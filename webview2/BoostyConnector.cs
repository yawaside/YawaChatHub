using System.Net.WebSockets;
using System.Text.Json;

namespace YawaChatHub;

/// <summary>
/// Boosty — чат трансляции.
///
/// Площадка сделана той же командой, что VK Видео Live, и использует тот же
/// транспорт Centrifugo, поэтому логика подключения почти повторяет
/// <see cref="VkVideoLiveConnector"/>:
///   1. `api.boosty.to/v1/blog/{blog}` → publicWebSocketChannel вида "blogger:442";
///   2. `api.boosty.to/v1/ws/connect`  → токен сокета (нужен вход);
///   3. `wss://pubsub.boosty.to/connection/websocket` с заголовком Origin;
///   4. подписка на канал блога, сообщения приходят событием
///      `blog_stream_chat_message`.
///
/// Отличие от VK: анонимные подключения площадка отклоняет — Boosty построен
/// вокруг платных подписок, и чат доступен только авторизованному аккаунту.
/// Поэтому токен обязателен, а при его отсутствии выводится понятная причина,
/// а не «молчащий» чат.
/// </summary>
public sealed class BoostyConnector : IPlatformConnector
{
    private const string ApiBase = "https://api.boosty.to/v1";
    private const string WsUrl = "wss://pubsub.boosty.to/connection/websocket?cf_protocol_version=v2";
    private const string Origin = "https://boosty.to";

    private readonly string _blog;
    private readonly string _token;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;
    private CancellationTokenSource? _viewerCts;

    public BoostyConnector(string blog, string token, Action<ChatEvent> emit, Action<string, int> status)
    {
        _blog = blog.Trim().TrimStart('@').ToLowerInvariant();
        _token = (token ?? "").Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase).Trim();
        _emit = emit;
        _status = status;
    }

    private HttpClient NewHttp()
    {
        var http = Net.Http(TimeSpan.FromSeconds(10));
        http.DefaultRequestHeaders.Add("Origin", Origin);
        http.DefaultRequestHeaders.Referrer = new Uri($"{Origin}/{_blog}");
        if (_token.Length > 0)
            http.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", $"Bearer {_token}");
        return http;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        if (_blog.Length == 0)
        {
            _status("error", 0);
            throw new InvalidOperationException("Boosty: не указано имя блога");
        }

        using var http = NewHttp();

        /* 1) блог: канал сокета и признак эфира */
        var blogResp = await http.GetAsync($"{ApiBase}/blog/{_blog}", ct);
        if (!blogResp.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"Boosty: блог «{_blog}» не найден ({(int)blogResp.StatusCode})");

        using var blogDoc = JsonDocument.Parse(await blogResp.Content.ReadAsStringAsync(ct));
        var blogRoot = blogDoc.RootElement;

        var wsChannel = Net.FindString(blogRoot, "publicWebSocketChannel") ?? "";
        if (wsChannel.Length == 0)
            throw new InvalidOperationException("Boosty: площадка не вернула канал чата");

        var channelId = wsChannel.Contains(':')
            ? wsChannel[(wsChannel.LastIndexOf(':') + 1)..]
            : wsChannel;

        /* 2) токен сокета — только с аккаунтом */
        if (_token.Length == 0)
        {
            _status("error", 0);
            throw new InvalidOperationException(
                "Boosty: чат трансляции доступен только с токеном аккаунта — добавьте его в настройках канала");
        }

        string wsToken;
        try
        {
            var tokenResp = await http.GetAsync($"{ApiBase}/ws/connect", ct);
            var tokenBody = await tokenResp.Content.ReadAsStringAsync(ct);
            if (!tokenResp.IsSuccessStatusCode)
                throw new InvalidOperationException(
                    $"Boosty: токен отклонён ({(int)tokenResp.StatusCode}) — войдите заново и обновите его");
            using var tokenDoc = JsonDocument.Parse(tokenBody);
            wsToken = Net.FindString(tokenDoc.RootElement, "token") ?? "";
        }
        catch (InvalidOperationException) { throw; }
        catch (Exception ex)
        {
            throw new InvalidOperationException("Boosty: не удалось получить доступ к чату — " + ex.Message);
        }

        if (wsToken.Length == 0)
            throw new InvalidOperationException("Boosty: площадка не выдала доступ к чату по этому токену");

        /* 3) Centrifugo */
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Origin", Origin);
        _ws.Options.SetRequestHeader("User-Agent", Net.UA);
        await _ws.ConnectAsync(new Uri(WsUrl), ct);

        await Net.WsSend(_ws,
            JsonSerializer.Serialize(new { connect = new { token = wsToken, name = "js" }, id = 1 }), ct);
        var hello = await Net.WsRecv(_ws, ct);
        if (hello == null) throw new InvalidOperationException("Boosty: сервер закрыл соединение");
        if (hello.Contains("\"error\"", StringComparison.Ordinal))
            throw new InvalidOperationException("Boosty: отказ авторизации чата — " + hello);

        // Канал блога + отдельный канал чата трансляции: площадка использует
        // оба в зависимости от типа эфира, лишняя подписка просто игнорируется.
        var channels = new[] { wsChannel, $"blog:{channelId}", $"public-chat:{channelId}" };
        var id = 2;
        foreach (var ch in channels)
        {
            try
            {
                await Net.WsSend(_ws,
                    JsonSerializer.Serialize(new { subscribe = new { channel = ch }, id = id++ }), ct);
            }
            catch { /* недоступный канал не мешает остальным */ }
        }

        await RefreshStreamAsync(ct, initial: true);

        /* 3.5) состояние эфира и зрители */
        _viewerCts?.Cancel();
        _viewerCts?.Dispose();
        _viewerCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var viewerToken = _viewerCts.Token;
        _ = Task.Run(async () =>
        {
            while (!viewerToken.IsCancellationRequested)
            {
                if (!await Net.DelayAsync(Net.ViewerPollMs, viewerToken)) return;
                try { await RefreshStreamAsync(viewerToken, initial: false); }
                catch { /* повторим на следующем круге */ }
            }
        }, CancellationToken.None);

        /* 4) приём сообщений; keep-alive: на "{}" отвечаем "{}" */
        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("Boosty: соединение с чатом закрыто");

            foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var s = line.Trim();
                if (s.Length == 0) continue;
                if (s == "{}")
                {
                    await Net.WsSend(_ws, "{}", ct);
                    continue;
                }
                try { HandleFrame(s); }
                catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[boosty] {ex.Message}"); }
            }
        }
    }

    /// Текущее состояние трансляции блога: в эфире и сколько смотрят.
    private async Task RefreshStreamAsync(CancellationToken ct, bool initial)
    {
        using var http = NewHttp();
        var nonce = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        using var req = new HttpRequestMessage(HttpMethod.Get, $"{ApiBase}/blog/{_blog}/video_stream?_={nonce}");
        req.Headers.TryAddWithoutValidation("Cache-Control", "no-cache, no-store");

        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            // Нет активного эфира — чат всё равно подключён.
            if (initial) _status("connected", 0);
            return;
        }

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;
        var live = Net.FindBool(root, "isOnline");
        var viewers = Net.FindInt(root, "viewersCounter");
        if (viewers == 0) viewers = Net.FindInt(root, "viewers");

        _status(live ? "online" : "connected", live ? viewers : 0);
    }

    private void HandleFrame(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        if (!root.TryGetProperty("push", out var push)) return;
        if (!push.TryGetProperty("pub", out var pub)) return;
        if (!pub.TryGetProperty("data", out var data)) return;

        var type = Net.FindString(data, "type") ?? "";

        // Сообщения чата трансляции приходят именно этим типом.
        if (!type.Contains("chat_message", StringComparison.OrdinalIgnoreCase) &&
            !type.Equals("message", StringComparison.OrdinalIgnoreCase))
            return;

        var body = data.TryGetProperty("data", out var inner) ? inner : data;

        var author = "";
        if (Net.TryFind(body, "author", out var authorEl) && authorEl.ValueKind == JsonValueKind.Object)
            author = Net.FindString(authorEl, "name") ?? Net.FindString(authorEl, "displayName") ?? "";
        if (author.Length == 0)
            author = Net.FindString(body, "authorName") ?? Net.FindString(body, "name") ?? "гость";

        var text = ExtractText(body);
        if (text.Length == 0) return;

        // Платное сообщение Boosty несёт сумму — показываем как донат.
        double? amount = null;
        if (Net.TryFind(body, "price", out var priceEl))
        {
            if (priceEl.ValueKind == JsonValueKind.Number && priceEl.TryGetDouble(out var p) && p > 0) amount = p;
            else if (priceEl.ValueKind == JsonValueKind.String &&
                     double.TryParse(priceEl.GetString()?.Replace(',', '.'),
                         System.Globalization.NumberStyles.Any,
                         System.Globalization.CultureInfo.InvariantCulture, out var ps) && ps > 0) amount = ps;
        }

        _emit(new ChatEvent
        {
            platform = "boosty",
            channel = _blog,
            author = author,
            text = text,
            kind = amount.HasValue ? "donate" : "chat",
            amount = amount,
            currency = amount.HasValue ? "₽" : null,
        });
    }

    /// <summary>
    /// Текст сообщения. Boosty хранит его блоками (как VK), поэтому собираем
    /// строку из всех текстовых кусков, а не берём одно поле.
    /// </summary>
    private static string ExtractText(JsonElement body)
    {
        var direct = Net.FindString(body, "text") ?? "";
        if (direct.Length > 0 && !direct.TrimStart().StartsWith("[", StringComparison.Ordinal))
            return direct.Trim();

        var parts = new List<string>();
        Collect(body, parts, 0);
        return string.Join(" ", parts).Trim();

        static void Collect(JsonElement el, List<string> acc, int depth)
        {
            if (depth > 6 || acc.Count > 64) return;
            if (el.ValueKind == JsonValueKind.Object)
            {
                var type = Net.FindString(el, "type") ?? "";
                if (type.Equals("text", StringComparison.OrdinalIgnoreCase))
                {
                    var content = Net.FindString(el, "content") ?? "";
                    var piece = UnwrapContent(content);
                    if (piece.Length > 0) acc.Add(piece);
                }
                foreach (var p in el.EnumerateObject()) Collect(p.Value, acc, depth + 1);
            }
            else if (el.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in el.EnumerateArray()) Collect(item, acc, depth + 1);
            }
        }
    }

    /// Блок текста приходит строкой с JSON внутри: ["сам текст","unstyled",[]].
    private static string UnwrapContent(string content)
    {
        if (content.Length == 0) return "";
        if (!content.TrimStart().StartsWith("[", StringComparison.Ordinal)) return content.Trim();
        try
        {
            using var doc = JsonDocument.Parse(content);
            if (doc.RootElement.ValueKind == JsonValueKind.Array &&
                doc.RootElement.GetArrayLength() > 0 &&
                doc.RootElement[0].ValueKind == JsonValueKind.String)
                return (doc.RootElement[0].GetString() ?? "").Trim();
        }
        catch { /* не JSON — вернём как есть */ }
        return content.Trim();
    }

    public void Dispose()
    {
        try { _viewerCts?.Cancel(); } catch { }
        try { _viewerCts?.Dispose(); } catch { }
        _viewerCts = null;
        try { _ws?.Abort(); } catch { }
    }
}
