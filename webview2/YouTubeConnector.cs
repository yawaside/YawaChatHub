using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace YawaChatHub;

/// <summary>
/// Быстрый YouTube Live-коннектор без пользовательского API-ключа.
///
/// Старый вариант последовательно открывал три адреса с таймаутом 20 секунд
/// каждый и искал continuation только рядом с liveChatRenderer. После изменений
/// YouTube это давало до минуты ожидания и вечный статус «подключение».
///
/// Новый порядок повторяет рабочий YawaChat_Hub:
///   1. /live, /streams и Innertube search проверяются ПАРАЛЛЕЛЬНО;
///   2. весь поиск ограничен восемью секундами;
///   3. чат открывается через /live_chat?is_popout=1&amp;v=VIDEO_ID;
///   4. если continuation нет в HTML, используется youtubei/v1/next;
///   5. timed/invalidation/reload continuation поддерживаются одинаково.
/// </summary>
public sealed class YouTubeConnector : IPlatformConnector
{
    // Публичный ключ WEB-клиента: он встроен в youtube.com и используется самим
    // сайтом. Это не пользовательский Google API key и не секрет.
    private const string InnertubeKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    private const string DefaultClientVersion = "2.20241216.01.00";

    private readonly string _user;
    private readonly string _directVideoId;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;

    private sealed record LiveInfo(string VideoId, string Html, string PageUrl);
    private sealed record ChatSession(string Key, string ClientVersion, string Continuation);
    private sealed record PollBatch(string Continuation, int TimeoutMs);

    public YouTubeConnector(string user, Action<ChatEvent> emit, Action<string, int> status)
    {
        (_user, _directVideoId) = NormalizeTarget(user);
        _emit = emit;
        _status = status;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        using var handler = new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All,
        };
        using var http = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
        http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8");
        // Без consent-cookie YouTube иногда редиректит на consent.youtube.com,
        // где нет videoId и continuation.
        http.DefaultRequestHeaders.TryAddWithoutValidation(
            "Cookie", "CONSENT=YES+cb.20210328-17-p0.en+FX; SOCS=CAI");

        while (!ct.IsCancellationRequested)
        {
            _status("connecting", 0);

            LiveInfo? live;
            try { live = await FindLiveAsync(http, ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch
            {
                _status("error", 0);
                if (!await DelayAsync(15_000, ct)) return;
                continue;
            }

            if (live == null)
            {
                // Важно: статус завершается максимум через 8 секунд, а не
                // остаётся «подключение» на неопределённое время.
                _status("offline", 0);
                if (!await DelayAsync(45_000, ct)) return;
                continue;
            }

            var lastViewers = ParseViewers(live.Html);
            _status("online", lastViewers);

            ChatSession? session;
            try { session = await OpenChatAsync(http, live.VideoId, ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch { session = null; }

            if (session == null)
            {
                // Эфир найден, но чат может быть выключен владельцем. Не
                // показываем вечное подключение и не называем эфир офлайном.
                _status("online", lastViewers);
                if (!await DelayAsync(20_000, ct)) return;
                continue;
            }

            using var viewersCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var viewersTask = RefreshViewersAsync(http, live.VideoId, lastViewers, viewersCts.Token);

            var continuation = session.Continuation;
            var misses = 0;
            var skipHistory = true;

            while (!ct.IsCancellationRequested)
            {
                PollBatch? batch;
                try
                {
                    batch = await PollAsync(
                        http, session.Key, session.ClientVersion, continuation,
                        emitMessages: !skipHistory, ct);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
                catch { batch = null; }

                skipHistory = false;
                if (batch == null)
                {
                    if (++misses >= 3) break;
                    if (!await DelayAsync(2_500, ct)) break;
                    continue;
                }

                misses = 0;
                continuation = batch.Continuation;
                // Уважаем серверный интервал, но не позволяем чату отставать
                // на 10+ секунд из-за завышенного timeoutMs.
                var waitMs = Math.Clamp(batch.TimeoutMs, 800, 4_000);
                if (!await DelayAsync(waitMs, ct)) break;
            }

            // Старый код только Dispose-ил linked CTS, но не отменял его — при
            // каждом reconnect оставалась ещё одна вечная задача viewers.
            viewersCts.Cancel();
            try { await viewersTask; } catch { /* отмена ожидаема */ }

            if (ct.IsCancellationRequested) return;
            _status("connected", 0);
            if (!await DelayAsync(3_000, ct)) return;
        }
    }

    /// <summary>
    /// Одновременно проверяем все разумные адреса канала и Innertube search.
    /// Медленный/заблокированный URL больше не задерживает остальные.
    /// </summary>
    private async Task<LiveInfo?> FindLiveAsync(HttpClient http, CancellationToken ct)
    {
        if (_directVideoId.Length == 11)
        {
            var watch = $"https://www.youtube.com/watch?v={_directVideoId}";
            var html = await GetTextAsync(http, watch, ct, 7);
            return IsLiveHtml(html) ? new LiveInfo(_directVideoId, html, watch) : null;
        }

        using var searchCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        searchCts.CancelAfter(TimeSpan.FromSeconds(8));

        var id = Uri.EscapeDataString(_user);
        var urls = _user.StartsWith("UC", StringComparison.Ordinal) && _user.Length > 20
            ? new[]
            {
                $"https://www.youtube.com/channel/{id}/live",
                $"https://www.youtube.com/channel/{id}/streams",
            }
            : new[]
            {
                $"https://www.youtube.com/@{id}/live",
                $"https://www.youtube.com/@{id}/streams",
                $"https://www.youtube.com/c/{id}/live",
                $"https://www.youtube.com/user/{id}/live",
                $"https://www.youtube.com/{id}/live",
            };

        var pending = urls
            .Select(url => FindFromPageAsync(http, url, searchCts.Token))
            .Append(FindFromSearchAsync(http, _user, searchCts.Token))
            .ToList();

        while (pending.Count > 0 && !searchCts.IsCancellationRequested)
        {
            var done = await Task.WhenAny(pending);
            pending.Remove(done);
            LiveInfo? result;
            try { result = await done; } catch { result = null; }
            if (result == null) continue;
            searchCts.Cancel();
            return result;
        }
        return null;
    }

    private static async Task<LiveInfo?> FindFromPageAsync(
        HttpClient http, string url, CancellationToken ct)
    {
        var html = await GetTextAsync(http, url, ct, 7);
        var videoId = ExtractLiveVideoId(html);
        return videoId.Length == 11 ? new LiveInfo(videoId, html, url) : null;
    }

    private static async Task<LiveInfo?> FindFromSearchAsync(
        HttpClient http, string query, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new
        {
            context = new
            {
                client = new
                {
                    clientName = "WEB",
                    clientVersion = DefaultClientVersion,
                    hl = "ru",
                    gl = "RU",
                },
            },
            query,
            // Фильтр YouTube Search «Live».
            @params = "EgJAAQ==",
        });

        var json = await PostJsonAsync(
            http,
            $"https://www.youtube.com/youtubei/v1/search?key={InnertubeKey}&prettyPrint=false",
            payload,
            DefaultClientVersion,
            ct,
            7);
        if (json.Length == 0) return null;

        try
        {
            using var doc = JsonDocument.Parse(json);
            var videoId = FindLiveVideoId(doc.RootElement);
            return videoId.Length == 11
                ? new LiveInfo(videoId, json, $"https://www.youtube.com/watch?v={videoId}")
                : null;
        }
        catch { return null; }
    }

    private static string ExtractLiveVideoId(string html)
    {
        if (!IsLiveHtml(html)) return "";

        var patterns = new[]
        {
            @"<link\s+rel=""canonical""\s+href=""https://www\.youtube\.com/watch\?v=([\w-]{11})",
            @"""videoDetails""\s*:\s*\{\s*""videoId""\s*:\s*""([\w-]{11})""",
            @"""videoId""\s*:\s*""([\w-]{11})""(?:(?!""videoId"").){0,1200}?(?:""isLiveNow""\s*:\s*true|""isLive""\s*:\s*true|BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW)",
            @"""videoId""\s*:\s*""([\w-]{11})""",
        };
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(html, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (match.Success) return match.Groups[1].Value;
        }
        return "";
    }

    private static bool IsLiveHtml(string html) =>
        html.Length > 500 && Regex.IsMatch(
            html,
            @"""isLiveNow""\s*:\s*true|""isLive""\s*:\s*true|BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW|""style""\s*:\s*""LIVE""",
            RegexOptions.IgnoreCase);

    private static string FindLiveVideoId(JsonElement el, int depth = 0)
    {
        if (depth > 20) return "";
        if (el.ValueKind == JsonValueKind.Object)
        {
            if (el.TryGetProperty("videoId", out var idEl) && idEl.ValueKind == JsonValueKind.String)
            {
                var id = idEl.GetString() ?? "";
                if (id.Length == 11)
                {
                    var raw = el.GetRawText();
                    if (Regex.IsMatch(raw, "LIVE|isLiveNow|BADGE_STYLE_TYPE_LIVE", RegexOptions.IgnoreCase))
                        return id;
                }
            }
            foreach (var prop in el.EnumerateObject())
            {
                var found = FindLiveVideoId(prop.Value, depth + 1);
                if (found.Length == 11) return found;
            }
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
            {
                var found = FindLiveVideoId(item, depth + 1);
                if (found.Length == 11) return found;
            }
        }
        return "";
    }

    private static async Task<ChatSession?> OpenChatAsync(
        HttpClient http, string videoId, CancellationToken ct)
    {
        var html = await GetTextAsync(
            http,
            $"https://www.youtube.com/live_chat?is_popout=1&v={videoId}",
            ct,
            7,
            $"https://www.youtube.com/watch?v={videoId}");

        var key = Extract(html, "\"INNERTUBE_API_KEY\":\"", "\"") ?? InnertubeKey;
        var clientVersion =
            Extract(html, "\"INNERTUBE_CLIENT_VERSION\":\"", "\"") ??
            Extract(html, "\"clientVersion\":\"", "\"") ??
            DefaultClientVersion;
        var continuation = ExtractContinuationFromHtml(html);

        if (continuation.Length == 0)
        {
            var payload = JsonSerializer.Serialize(new
            {
                context = new
                {
                    client = new
                    {
                        clientName = "WEB",
                        clientVersion,
                        hl = "ru",
                        gl = "RU",
                    },
                },
                videoId,
            });
            var next = await PostJsonAsync(
                http,
                $"https://www.youtube.com/youtubei/v1/next?key={key}&prettyPrint=false",
                payload,
                clientVersion,
                ct,
                7);
            try
            {
                using var doc = JsonDocument.Parse(next);
                continuation = FindContinuation(doc.RootElement).token;
            }
            catch { /* чат закрыт или ответ изменился */ }
        }

        return continuation.Length > 0
            ? new ChatSession(key, clientVersion, continuation)
            : null;
    }

    private async Task<PollBatch?> PollAsync(
        HttpClient http,
        string key,
        string clientVersion,
        string continuation,
        bool emitMessages,
        CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new
        {
            context = new
            {
                client = new
                {
                    clientName = "WEB",
                    clientVersion,
                    hl = "ru",
                    gl = "RU",
                },
            },
            continuation,
        });

        var json = await PostJsonAsync(
            http,
            $"https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={key}&prettyPrint=false",
            payload,
            clientVersion,
            ct,
            10);
        if (json.Length == 0) return null;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("continuationContents", out var cc) ||
                !cc.TryGetProperty("liveChatContinuation", out var liveChat))
                return null;

            if (emitMessages && liveChat.TryGetProperty("actions", out var actions) &&
                actions.ValueKind == JsonValueKind.Array)
            {
                foreach (var action in actions.EnumerateArray()) HandleYouTubeAction(action);
            }

            var next = FindContinuation(liveChat);
            return next.token.Length > 0
                ? new PollBatch(next.token, next.timeoutMs > 0 ? next.timeoutMs : 4_000)
                : null;
        }
        catch { return null; }
    }

    private void HandleYouTubeAction(JsonElement action)
    {
        if (action.TryGetProperty("addChatItemAction", out var add) &&
            add.TryGetProperty("item", out var item))
        {
            HandleYouTubeItem(item);
            return;
        }

        if (action.TryGetProperty("replayChatItemAction", out var replay) &&
            replay.TryGetProperty("actions", out var nested) &&
            nested.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in nested.EnumerateArray()) HandleYouTubeAction(child);
        }
    }

    private static (string token, int timeoutMs) FindContinuation(JsonElement el, int depth = 0)
    {
        if (depth > 20) return ("", 0);
        if (el.ValueKind == JsonValueKind.Object)
        {
            foreach (var name in new[]
            {
                "invalidationContinuationData",
                "timedContinuationData",
                "reloadContinuationData",
                "liveChatReplayContinuationData",
            })
            {
                if (!el.TryGetProperty(name, out var data) || data.ValueKind != JsonValueKind.Object)
                    continue;
                if (!data.TryGetProperty("continuation", out var tokenEl) ||
                    tokenEl.ValueKind != JsonValueKind.String)
                    continue;
                var token = tokenEl.GetString() ?? "";
                var timeout = data.TryGetProperty("timeoutMs", out var timeoutEl) &&
                              timeoutEl.TryGetInt32(out var ms) ? ms : 4_000;
                if (token.Length > 0) return (token, timeout);
            }

            foreach (var prop in el.EnumerateObject())
            {
                var found = FindContinuation(prop.Value, depth + 1);
                if (found.token.Length > 0) return found;
            }
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
            {
                var found = FindContinuation(item, depth + 1);
                if (found.token.Length > 0) return found;
            }
        }
        return ("", 0);
    }

    private static string ExtractContinuationFromHtml(string html)
    {
        if (html.Length == 0) return "";
        var patterns = new[]
        {
            @"""(?:invalidation|timed|reload|liveChatReplay)ContinuationData""\s*:\s*\{\s*""continuation""\s*:\s*""([^""]{20,})""",
            @"""continuation""\s*:\s*""([^""]{20,})""",
        };
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(html, pattern, RegexOptions.IgnoreCase);
            if (!match.Success) continue;
            try
            {
                return JsonSerializer.Deserialize<string>($"\"{match.Groups[1].Value}\"") ?? "";
            }
            catch { return match.Groups[1].Value; }
        }
        return "";
    }

    private async Task RefreshViewersAsync(
        HttpClient http, string videoId, int initial, CancellationToken ct)
    {
        var last = initial;
        while (!ct.IsCancellationRequested)
        {
            if (!await DelayAsync(15_000, ct)) return;
            var html = await GetTextAsync(
                http,
                $"https://www.youtube.com/watch?v={videoId}",
                ct,
                6);
            if (html.Length == 0) continue;
            if (!IsLiveHtml(html))
            {
                _status("offline", 0);
                return;
            }
            var viewers = ParseViewers(html);
            if (viewers > 0 && viewers != last)
            {
                last = viewers;
                _status("online", viewers);
            }
        }
    }

    private static async Task<string> GetTextAsync(
        HttpClient http,
        string url,
        CancellationToken ct,
        int timeoutSeconds,
        string? referer = null)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
            req.Headers.Referrer = new Uri(referer ?? "https://www.youtube.com/");
            using var res = await http.SendAsync(req, HttpCompletionOption.ResponseContentRead, timeout.Token);
            if (!res.IsSuccessStatusCode) return "";
            return await res.Content.ReadAsStringAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { return ""; }
    }

    private static async Task<string> PostJsonAsync(
        HttpClient http,
        string url,
        string json,
        string clientVersion,
        CancellationToken ct,
        int timeoutSeconds)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            };
            req.Headers.Referrer = new Uri("https://www.youtube.com/");
            req.Headers.TryAddWithoutValidation("Origin", "https://www.youtube.com");
            req.Headers.TryAddWithoutValidation("X-YouTube-Client-Name", "1");
            req.Headers.TryAddWithoutValidation("X-YouTube-Client-Version", clientVersion);
            using var res = await http.SendAsync(req, HttpCompletionOption.ResponseContentRead, timeout.Token);
            if (!res.IsSuccessStatusCode) return "";
            return await res.Content.ReadAsStringAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { return ""; }
    }

    private static async Task<bool> DelayAsync(int milliseconds, CancellationToken ct)
    {
        try { await Task.Delay(milliseconds, ct); return true; }
        catch (OperationCanceledException) { return false; }
    }

    private static (string user, string directVideoId) NormalizeTarget(string raw)
    {
        var value = (raw ?? "").Trim();
        var direct = Regex.Match(value, @"(?:youtu\.be/|[?&]v=)([\w-]{11})", RegexOptions.IgnoreCase);
        if (direct.Success) return (value, direct.Groups[1].Value);

        var channel = Regex.Match(
            value,
            @"youtube\.com/(?:@|channel/|user/|c/)?([^/?#]+)",
            RegexOptions.IgnoreCase);
        if (channel.Success) value = channel.Groups[1].Value;
        value = value.TrimStart('@').Split('/', '?', '&', '#')[0].Trim();
        return (value, "");
    }

    /// Обычные сообщения, memberships, Super Chat и подарочные подписки.
    private void HandleYouTubeItem(JsonElement item)
    {
        if (item.TryGetProperty("liveChatTextMessageRenderer", out var message))
        {
            var text = ParseYouTubeRuns(message, "message");
            if (text.Length == 0) return;
            Emit(ExtractAuthor(message), text, "chat", ExtractBadges(message));
            return;
        }

        if (item.TryGetProperty("liveChatMembershipItemRenderer", out var member))
        {
            var header = ParseYouTubeRuns(member, "headerSubtext");
            if (header.Length == 0) header = "оформил спонсорскую подписку";
            var comment = ParseYouTubeRuns(member, "message");
            Emit(
                ExtractAuthor(member),
                comment.Length == 0 ? header : $"{header}: {comment}",
                "sub",
                ExtractBadges(member, "sub"));
            return;
        }

        if (item.TryGetProperty("liveChatPaidMessageRenderer", out var paid))
        {
            var text = ParseYouTubeRuns(paid, "message");
            var amountText = paid.TryGetProperty("purchaseAmountText", out var amountEl) &&
                             amountEl.TryGetProperty("simpleText", out var simple)
                ? simple.GetString() ?? ""
                : "";
            var (amount, currency) = ParseAmountAndCurrency(amountText);
            Emit(
                ExtractAuthor(paid),
                text.Length == 0 ? $"Super Chat {amountText}" : text,
                "donate",
                ExtractBadges(paid),
                amount,
                currency);
            return;
        }

        if (item.TryGetProperty("liveChatPaidStickerRenderer", out var sticker))
        {
            var amountText = sticker.TryGetProperty("purchaseAmountText", out var amountEl) &&
                             amountEl.TryGetProperty("simpleText", out var simple)
                ? simple.GetString() ?? ""
                : "";
            var (amount, currency) = ParseAmountAndCurrency(amountText);
            Emit(
                ExtractAuthor(sticker),
                $"Super Sticker {amountText}".Trim(),
                "donate",
                ExtractBadges(sticker),
                amount,
                currency);
            return;
        }

        if (item.TryGetProperty("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer", out var gift) &&
            gift.TryGetProperty("header", out var giftHeaderContainer) &&
            giftHeaderContainer.TryGetProperty("liveChatSponsorshipsHeaderRenderer", out var giftHeader))
        {
            var text = ParseYouTubeRuns(giftHeader, "primaryText");
            Emit(
                ExtractAuthor(giftHeader),
                text.Length == 0 ? "подарил спонсорские подписки" : text,
                "gift",
                new[] { "sub" });
            return;
        }

        if (item.TryGetProperty("liveChatSponsorshipsGiftRedemptionAnnouncementRenderer", out var redeem))
        {
            var text = ParseYouTubeRuns(redeem, "message");
            Emit(
                ExtractAuthor(redeem),
                text.Length == 0 ? "получил подарочную спонсорскую подписку" : text,
                "sub");
        }
    }

    private void Emit(
        string author,
        string text,
        string kind,
        string[]? badges = null,
        double? amount = null,
        string? currency = null)
    {
        _emit(new ChatEvent
        {
            platform = "youtube",
            channel = _user,
            author = author,
            text = text,
            kind = kind,
            badges = badges is { Length: > 0 } ? badges : null,
            amount = amount,
            currency = currency,
        });
    }

    private static string ExtractAuthor(JsonElement el)
    {
        if (!el.TryGetProperty("authorName", out var author)) return "зритель";
        if (author.TryGetProperty("simpleText", out var simple))
            return simple.GetString() ?? "зритель";
        if (author.TryGetProperty("runs", out var runs) &&
            runs.ValueKind == JsonValueKind.Array && runs.GetArrayLength() > 0 &&
            runs[0].TryGetProperty("text", out var text))
            return text.GetString() ?? "зритель";
        return "зритель";
    }

    private static string[] ExtractBadges(JsonElement el, string fallback = "")
    {
        var list = new List<string>();
        if (el.TryGetProperty("authorBadges", out var badges))
        {
            var raw = badges.GetRawText();
            if (raw.Contains("moderator", StringComparison.OrdinalIgnoreCase) ||
                raw.Contains("owner", StringComparison.OrdinalIgnoreCase)) list.Add("mod");
            if (raw.Contains("member", StringComparison.OrdinalIgnoreCase)) list.Add("sub");
            if (raw.Contains("verified", StringComparison.OrdinalIgnoreCase)) list.Add("vip");
        }
        if (list.Count == 0 && fallback.Length > 0) list.Add(fallback);
        return list.ToArray();
    }

    private static string ParseYouTubeRuns(JsonElement parent, string property)
    {
        if (!parent.TryGetProperty(property, out var value)) return "";
        if (value.TryGetProperty("simpleText", out var simple)) return simple.GetString() ?? "";
        if (!value.TryGetProperty("runs", out var runs) || runs.ValueKind != JsonValueKind.Array)
            return "";

        var result = new StringBuilder();
        foreach (var run in runs.EnumerateArray())
        {
            if (run.TryGetProperty("text", out var text))
            {
                result.Append(text.GetString());
                continue;
            }
            if (!run.TryGetProperty("emoji", out var emoji)) continue;

            var custom = emoji.TryGetProperty("isCustomEmoji", out var customEl) &&
                         customEl.ValueKind == JsonValueKind.True;
            var shortcut = emoji.TryGetProperty("shortcuts", out var shortcuts) &&
                           shortcuts.ValueKind == JsonValueKind.Array && shortcuts.GetArrayLength() > 0
                ? shortcuts[0].GetString() ?? ""
                : "";
            var emojiId = Net.FindString(emoji, "emojiId") ?? "";
            var imageUrl = "";
            if (Net.TryFind(emoji, "thumbnails", out var thumbs) &&
                thumbs.ValueKind == JsonValueKind.Array && thumbs.GetArrayLength() > 0)
                imageUrl = Net.FindString(thumbs[thumbs.GetArrayLength() - 1], "url") ?? "";

            if (custom && imageUrl.Length > 0)
                result.Append(Net.Emote(imageUrl, shortcut.Trim(':')));
            else if (!custom && emojiId.Length is > 0 and <= 8)
                result.Append(emojiId);
            else if (imageUrl.Length > 0)
                result.Append(Net.Emote(imageUrl, shortcut.Trim(':')));
            else
                result.Append(shortcut);
        }
        return result.ToString();
    }

    private static (double? amount, string currency) ParseAmountAndCurrency(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (null, "₽");
        var match = Regex.Match(text, @"([\d\s.,]+)");
        double? amount = null;
        if (match.Success)
        {
            var number = match.Groups[1].Value
                .Replace(" ", "")
                .Replace(" ", "")
                .Replace(',', '.');
            if (double.TryParse(
                number,
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture,
                out var parsed))
                amount = parsed;
        }
        var currency = text.Contains('$') ? "$" :
                       text.Contains('€') ? "€" :
                       text.Contains('£') ? "£" : "₽";
        return (amount, currency);
    }

    private static string? Extract(string source, string from, string to)
    {
        var start = source.IndexOf(from, StringComparison.Ordinal);
        if (start < 0) return null;
        start += from.Length;
        var end = source.IndexOf(to, start, StringComparison.Ordinal);
        return end < 0 ? null : source[start..end];
    }

    private static int ParseViewers(string html)
    {
        var raw = Extract(html, "\"originalViewCount\":\"", "\"");
        if (int.TryParse(raw, out var exact)) return exact;

        var match = Regex.Match(
            html,
            "\\\"viewCount\\\":\\{\\\"runs\\\":\\[\\{\\\"text\\\":\\\"([\\d\\s,.\\u00a0]+)\\\"");
        if (!match.Success)
            match = Regex.Match(html, "([\\d\\s,.\\u00a0]{1,15})\\s*(?:смотр|watching)", RegexOptions.IgnoreCase);
        if (!match.Success) return 0;
        var digits = Regex.Replace(match.Groups[1].Value, "[^0-9]", "");
        return int.TryParse(digits, out var value) ? value : 0;
    }

    public void Dispose() { }
}
