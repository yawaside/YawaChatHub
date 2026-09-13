using System.Net;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace YawaChatHub;

/* ============================================================
 * Коннекторы площадок (перенос desktop/electron/connectors).
 * Анонимное чтение чата, без OAuth там, где это возможно.
 * Все сообщения уходят в единую точку HostApi.PushChatMessage.
 *
 * Статусы канала:
 *   connecting — идёт подключение
 *   connected  — чат читается, эфир не подтверждён
 *   online     — подтверждён живой эфир (есть данные стрима)
 *   offline    — канала нет в эфире
 *   error      — сбой подключения
 * ============================================================ */

public sealed class ChannelSubInput
{
    public string platform { get; set; } = "";
    public string username { get; set; } = "";
    public string? token { get; set; }
    public string? currency { get; set; }
}

/// Сообщение чата, которое уходит в рендерер (форма = ChatMsg на фронте).
public sealed class ChatEvent
{
    public string platform { get; set; } = "";
    public string channel { get; set; } = "";
    public string author { get; set; } = "";
    public string color { get; set; } = "";
    public string text { get; set; } = "";
    public string kind { get; set; } = "chat";
    public string[]? badges { get; set; }
    public double? amount { get; set; }
    public string? currency { get; set; }
    /* Идентификаторы Twitch — нужны для НАСТОЯЩЕЙ модерации через Helix:
       msgId — что удалять, userId — кого банить, roomId — в каком канале. */
    public string? msgId { get; set; }
    public string? userId { get; set; }
    public string? roomId { get; set; }
    public long ts { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

public interface IPlatformConnector : IDisposable
{
    Task RunAsync(CancellationToken ct);
}

/* ------------------------- менеджер ------------------------- */

public sealed class ConnectorManager : IDisposable
{
    /// Токен и логин авторизованного бота Twitch (подставляет HostApi).
    public static string BotToken = "";
    public static string BotLogin = "";
    /// Токен VK — открывает приватные события канала (награды, подписки).
    public static string VkToken = "";

    /// <summary>
    /// Чтение чата TikTok через скрытое окно WebView2 (подключает HostApi).
    /// Публичный webcast-API требует подписи и cookies, поэтому браузерный
    /// путь — единственный, где от пользователя нужно только имя канала.
    /// </summary>
    public static Func<string, Action<string, string>, Action<bool, int>, CancellationToken, Task>? TikTokReader;

    /// <summary>
    /// Проверенный коннектор TikTok LIVE: модуль tiktok-live-connector через
    /// Node-мост (tiktok-bridge/bridge.js). Чат, подарки, подписки, лайки,
    /// входы, зрители и эмодзи (в том числе в никах) — без браузера и cookies.
    /// </summary>
    public static Func<string, Action<string, string>, Action<bool, int>, CancellationToken, Task>? TikTokNodeReader;

    public delegate void OnChatMessage(ChatEvent msg);
    public delegate void OnChannelStatus(string platform, string username, string status, int viewers);

    private readonly OnChatMessage _onMsg;
    private readonly OnChannelStatus _onStatus;
    private readonly Dictionary<string, (IPlatformConnector conn, CancellationTokenSource cts)> _live = new();
    private readonly Dictionary<string, ChannelSubInput> _subscriptions = new();
    private readonly Dictionary<string, (string status, int viewers)> _lastStatuses = new();

    public ConnectorManager(OnChatMessage onMsg, OnChannelStatus onStatus)
    {
        _onMsg = onMsg;
        _onStatus = onStatus;
    }

    public void Connect(ChannelSubInput sub)
    {
        var key = $"{sub.platform}:{sub.username.ToLowerInvariant()}";
        Disconnect(sub.platform, sub.username);
        lock (_live) _subscriptions[key] = sub;

        void emit(ChatEvent m) => _onMsg(m);
        void status(string s, int v)
        {
            // одинаковый статус не отправляем повторно: иначе каждый poll
            // площадки заставлял React перерисовывать список каналов/статистику.
            lock (_live)
            {
                if (_lastStatuses.TryGetValue(key, out var prev)
                    && prev.status == s && prev.viewers == v) return;
                _lastStatuses[key] = (s, v);
            }
            _onStatus(sub.platform, sub.username, s, v);
        }

        var cts = new CancellationTokenSource();

        // Twitch: события канала идут отдельным каналом EventSub параллельно IRC
        if (sub.platform == "twitch")
        {
            _ = Task.Run(async () =>
            {
                while (!cts.IsCancellationRequested)
                {
                    if (string.IsNullOrWhiteSpace(BotToken))
                    {
                        try { await Task.Delay(5000, cts.Token); } catch { return; }
                        continue;
                    }
                    using var es = new TwitchEventSubConnector(sub.username, emit);
                    try { await es.RunAsync(cts.Token); }
                    catch (OperationCanceledException) { return; }
                    catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[eventsub {key}] {ex.Message}"); }
                    try { await Task.Delay(5000, cts.Token); } catch { return; }
                }
            }, CancellationToken.None);
        }

        // авто-переподключение с нарастающей паузой
        _ = Task.Run(async () =>
        {
            int attempt = 0;
            while (!cts.IsCancellationRequested)
            {
                IPlatformConnector? conn = null;
                try
                {
                    conn = sub.platform switch
                    {
                        // токен бота даёт права модерации и отправки сообщений
                        "twitch" => new TwitchIrcConnector(sub.username, emit, status, BotToken, BotLogin),
                        "kick" => new KickConnector(sub.username, emit, status),
                        "vkplay" => new VkVideoLiveConnector(sub.username, emit, status),
                        "youtube" => new YouTubeConnector(sub.username, emit, status),
                        // token для TikTok = cookie сессии (необязательно)
                        "tiktok" => new TikTokConnector(sub.username, emit, status, sub.token ?? ""),
                        "donationalerts" => new DonationAlertsConnector(sub.username, sub.token ?? "", emit, status),
                        _ => throw new InvalidOperationException($"неизвестная площадка {sub.platform}"),
                    };
                    lock (_live) _live[key] = (conn, cts);
                    await conn.RunAsync(cts.Token);
                    attempt = 0;
                }
                catch (OperationCanceledException) { return; }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[connector {key}] {ex.Message}");
                    status("error", 0);
                }
                finally { try { conn?.Dispose(); } catch { } }

                if (cts.IsCancellationRequested) return;
                var delay = Math.Min(30_000, 3_000 * Math.Max(1, ++attempt));
                try { await Task.Delay(delay, cts.Token); } catch { return; }
            }
        }, CancellationToken.None);
    }

    public void Disconnect(string platform, string username)
    {
        var key = $"{platform}:{username.ToLowerInvariant()}";
        (IPlatformConnector conn, CancellationTokenSource cts) item;
        lock (_live)
        {
            _subscriptions.Remove(key);
            _lastStatuses.Remove(key);
            if (!_live.Remove(key, out item)) return;
        }
        try { item.cts.Cancel(); } catch { }
        try { item.conn.Dispose(); } catch { }
    }

    /// <summary>
    /// После OAuth переподключаем уже работающие Twitch-каналы: иначе они
    /// продолжают жить в анонимной justinfan-сессии и не возвращают события
    /// модерации/статуса авторизованного аккаунта.
    /// </summary>
    public void RefreshTwitchAuth() => RefreshAuth("twitch");

    /// Переподключить каналы площадки после смены токена.
    public void RefreshAuth(string platform)
    {
        ChannelSubInput[] list;
        lock (_live)
            list = _subscriptions.Values
                .Where(s => s.platform == platform)
                .ToArray();

        foreach (var sub in list)
        {
            Disconnect(sub.platform, sub.username);
            Connect(sub);
        }
    }

    public void Dispose()
    {
        string[] keys;
        lock (_live) keys = _live.Keys.ToArray();
        foreach (var k in keys)
        {
            var parts = k.Split(':', 2);
            Disconnect(parts[0], parts.Length > 1 ? parts[1] : "");
        }
    }
}

/* ------------------------- хелперы ------------------------- */

internal static class Net
{
    public const string UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

    public static HttpClient Http()
    {
        var h = new HttpClient();
        h.DefaultRequestHeaders.UserAgent.ParseAdd(UA);
        h.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        h.Timeout = TimeSpan.FromSeconds(20);
        return h;
    }

    public static async Task<string?> WsRecv(ClientWebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[32768];
        using var ms = new MemoryStream();
        WebSocketReceiveResult res;
        do
        {
            res = await ws.ReceiveAsync(buffer, ct);
            if (res.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, res.Count);
        } while (!res.EndOfMessage);
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    public static Task WsSend(ClientWebSocket ws, string text, CancellationToken ct) =>
        ws.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, ct);

    public static string StripHtml(string s) => Regex.Replace(s, "<[^>]+>", "");

    /// <summary>
    /// Универсальный токен картиночного смайла: [[e|URL|имя]].
    /// Рендерер превращает его в <img>, поэтому смайлы всех площадок
    /// (Twitch, Kick, VK) показываются картинками, а не текстом.
    /// </summary>
    public static string Emote(string url, string name) => $"[[e|{url}|{name}]]";

    /// Разбивка строки на code points (для корректной работы с индексами Twitch).
    public static List<string> ToCodePoints(string s)
    {
        var list = new List<string>(s.Length);
        for (int i = 0; i < s.Length;)
        {
            int len = char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]) ? 2 : 1;
            list.Add(s.Substring(i, len));
            i += len;
        }
        return list;
    }

    /// Рекурсивный поиск свойства по имени в JSON-дереве (структуры площадок часто меняются).
    public static bool TryFind(JsonElement el, string name, out JsonElement found, int depth = 6)
    {
        found = default;
        if (depth < 0) return false;
        if (el.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in el.EnumerateObject())
            {
                if (p.NameEquals(name)) { found = p.Value; return true; }
                if (TryFind(p.Value, name, out found, depth - 1)) return true;
            }
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
                if (TryFind(item, name, out found, depth - 1)) return true;
        }
        return false;
    }

    public static string? FindString(JsonElement el, string name) =>
        TryFind(el, name, out var f) && f.ValueKind == JsonValueKind.String ? f.GetString() : null;

    public static int FindInt(JsonElement el, string name) =>
        TryFind(el, name, out var f) && f.ValueKind == JsonValueKind.Number && f.TryGetInt32(out var v) ? v : 0;

    public static bool FindBool(JsonElement el, string name) =>
        TryFind(el, name, out var f) && f.ValueKind == JsonValueKind.True;
}

/* ========================== TWITCH (IRC, анонимное чтение) ========================== */

public sealed class TwitchIrcConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private readonly string _botToken;
    private readonly string _botLogin;
    private TcpClient? _tcp;

    /// <summary>Room-id канала: приходит в тегах и нужен модерации Helix.</summary>
    public static readonly Dictionary<string, string> RoomIds = new(StringComparer.OrdinalIgnoreCase);

    /// Живые авторизованные подключения по каналам — через них бот
    /// отправляет ответы команд (IRC-путь надёжнее Helix: ему достаточно
    /// права chat:edit, которое есть даже у старых токенов).
    private static readonly Dictionary<string, TwitchIrcConnector> Live = new(StringComparer.OrdinalIgnoreCase);

    private StreamWriter? _writer;
    private bool _authenticated;
    private readonly SemaphoreSlim _sendGate = new(1, 1);

    /// Логин аккаунта по токену (Twitch validate).
    private static async Task<string> ResolveLoginAsync(string token, CancellationToken ct)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            http.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
            var body = await http.GetStringAsync("https://id.twitch.tv/oauth2/validate", ct);
            using var doc = JsonDocument.Parse(body);
            return Net.FindString(doc.RootElement, "login") ?? "";
        }
        catch { return ""; }
    }

    /// Отправить сообщение в чат канала от имени авторизованного аккаунта.
    public static async Task<bool> TrySendAsync(string channel, string text)
    {
        var key = channel.Trim().TrimStart('#', '@').ToLowerInvariant();

        // Соединение могло ещё подниматься (после входа коннектор
        // переподключается) — коротко ждём готовности, иначе ответ терялся.
        TwitchIrcConnector? conn = null;
        for (var attempt = 0; attempt < 10; attempt++)
        {
            lock (Live) Live.TryGetValue(key, out conn);
            if (conn is { _authenticated: true, _writer: not null }) break;
            await Task.Delay(300);
        }
        if (conn is null || !conn._authenticated || conn._writer is null) return false;

        await conn._sendGate.WaitAsync();
        try
        {
            // защита от разрыва строки: перевод строки завершил бы команду IRC
            var safe = text.Replace("\r", " ").Replace("\n", " ");
            if (safe.Length > 480) safe = safe[..480];
            await conn._writer.WriteLineAsync($"PRIVMSG #{conn._user} :{safe}");
            return true;
        }
        catch { return false; }
        finally { conn._sendGate.Release(); }
    }

    public TwitchIrcConnector(string user, Action<ChatEvent> emit, Action<string, int> status,
        string botToken = "", string botLogin = "")
    {
        _user = user.ToLowerInvariant();
        _emit = emit;
        _status = status;
        _botToken = botToken;
        _botLogin = botLogin;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);
        _tcp = new TcpClient();
        await _tcp.ConnectAsync("irc.chat.twitch.tv", 6697, ct);
        using var ssl = new SslStream(_tcp.GetStream());
        await ssl.AuthenticateAsClientAsync("irc.chat.twitch.tv");
        var reader = new StreamReader(ssl, Encoding.UTF8);
        var writer = new StreamWriter(ssl, new UTF8Encoding(false)) { AutoFlush = true };
        _writer = writer;
        lock (Live) Live[_user] = this;

        var cleanToken = (_botToken ?? "").Trim().Replace("oauth:", "", StringComparison.OrdinalIgnoreCase).Trim();
        var botLogin = (_botLogin ?? "").Trim();
        if (cleanToken.Length > 0 && botLogin.Length == 0)
            botLogin = await ResolveLoginAsync(cleanToken, ct);

        // Вход: если есть токен бота — авторизуемся под ним, иначе анонимно (justinfan)
        if (cleanToken.Length > 0 && botLogin.Length > 0)
        {
            await writer.WriteLineAsync($"PASS oauth:{cleanToken}");
            await writer.WriteLineAsync($"NICK {botLogin.ToLowerInvariant()}");
        }
        else
        {
            await writer.WriteLineAsync("PASS oauth:justinfan");
            await writer.WriteLineAsync($"NICK justinfan{Random.Shared.Next(10000, 99999)}");
        }

        await writer.WriteLineAsync("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
        await writer.WriteLineAsync($"JOIN #{_user}");
        _authenticated = cleanToken.Length > 0 && botLogin.Length > 0;
        _status("connected", 0);

        // реальный статус эфира и зрители
        _ = Task.Run(async () =>
        {
            using var http = Net.Http();
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    var s = (await http.GetStringAsync($"https://decapi.me/twitch/viewercount/{_user}", ct)).Trim();
                    if (int.TryParse(s, out var v) && v >= 0) _status("online", v);
                    else _status("connected", 0);
                }
                catch { }
                try { await Task.Delay(45000, ct); } catch { return; }
            }
        }, CancellationToken.None);

        string? line;
        while (!ct.IsCancellationRequested && (line = await reader.ReadLineAsync(ct)) != null)
        {
            if (line.StartsWith("PING", StringComparison.Ordinal)) { await writer.WriteLineAsync("PONG :tmi.twitch.tv"); continue; }
            if (line.Contains("NOTICE", StringComparison.Ordinal) &&
                (line.Contains("authentication failed", StringComparison.OrdinalIgnoreCase) ||
                 line.Contains("Improperly formatted auth", StringComparison.OrdinalIgnoreCase) ||
                 line.Contains("Login unsuccessful", StringComparison.OrdinalIgnoreCase)))
            {
                // Если токен отклонён, мгновенно переходим на анонимное чтение чата
                _authenticated = false;
                await writer.WriteLineAsync("PASS oauth:justinfan");
                await writer.WriteLineAsync($"NICK justinfan{Random.Shared.Next(10000, 99999)}");
                await writer.WriteLineAsync("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
                await writer.WriteLineAsync($"JOIN #{_user}");
                continue;
            }

            try
            {
                if (line.Contains(" PRIVMSG ", StringComparison.Ordinal)) HandlePrivmsg(line);
                else if (line.Contains(" USERNOTICE ", StringComparison.Ordinal)) HandleUserNotice(line);
                // события модерации с самого Twitch: удаление строки и бан/таймаут
                else if (line.Contains(" CLEARMSG ", StringComparison.Ordinal)) HandleClearMsg(line);
                else if (line.Contains(" CLEARCHAT ", StringComparison.Ordinal)) HandleClearChat(line);
                else if (line.Contains(" ROOMSTATE ", StringComparison.Ordinal))
                {
                    var t = Tags(line);
                    if (t.TryGetValue("room-id", out var rid) && rid.Length > 0)
                        lock (RoomIds) RoomIds[_user] = rid;
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[twitch parse] {ex.Message}");
            }
        }
    }

    private static Dictionary<string, string> Tags(string line)
    {
        var map = new Dictionary<string, string>();
        if (!line.StartsWith('@')) return map;
        var end = line.IndexOf(' ');
        if (end < 1) return map;
        foreach (var kv in line.Substring(1, end - 1).Split(';'))
        {
            var eq = kv.IndexOf('=');
            if (eq > 0) map[kv[..eq]] = kv[(eq + 1)..];
        }
        return map;
    }

    private static string ExtractText(string line, string marker)
    {
        var mi = line.IndexOf(marker, StringComparison.Ordinal);
        if (mi < 0) return "";
        var i = line.IndexOf(" :", mi, StringComparison.Ordinal);
        return i < 0 ? "" : line[(i + 2)..];
    }

    private void HandlePrivmsg(string line)
    {
        var tags = Tags(line);
        var text = ExtractText(line, "PRIVMSG");
        if (string.IsNullOrEmpty(text)) return;

        // Эмоуты Twitch: "25:0-4,12-23/354:30-35".
        // ВАЖНО: индексы указаны в code points (символах Юникода), а не в UTF-16.
        // Раньше это давало выход за границы на кириллице/эмодзи и роняло коннектор.
        if (tags.TryGetValue("emotes", out var em) && !string.IsNullOrEmpty(em))
        {
            var cps = Net.ToCodePoints(text);
            var spans = new List<(int start, int end, string id)>();
            foreach (var group in em.Split('/'))
            {
                // Twitch указывает id один раз на всю группу:
                //   25:0-4,6-10,12-16
                // Старый код ждал "25:" перед каждым диапазоном и терял
                // второй и последующие одинаковые смайлы.
                var colon = group.IndexOf(':');
                if (colon <= 0) continue;
                var id = group[..colon];
                foreach (var range in group[(colon + 1)..].Split(','))
                {
                    var dash = range.IndexOf('-');
                    if (dash <= 0) continue;
                    if (int.TryParse(range[..dash], out var s) &&
                        int.TryParse(range[(dash + 1)..], out var e))
                        spans.Add((s, e, id));
                }
            }

            spans.Sort((a, b) => b.start.CompareTo(a.start));
            foreach (var (s, e, id) in spans)
            {
                if (s < 0 || e >= cps.Count || e < s) continue;
                cps.RemoveRange(s, e - s + 1);
                cps.Insert(s, Net.Emote($"https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/2.0", "emote"));
            }
            text = string.Concat(cps);
        }

        var badges = ParseBadges(tags.TryGetValue("badges", out var b) ? b : "");
        if (tags.TryGetValue("room-id", out var room) && room.Length > 0)
            lock (RoomIds) RoomIds[_user] = room;

        _emit(new ChatEvent
        {
            platform = "twitch",
            channel = _user,
            author = tags.TryGetValue("display-name", out var dn) && dn.Length > 0 ? dn : _user,
            color = tags.TryGetValue("color", out var c) ? c : "",
            text = text,
            kind = "chat",
            badges = badges.Length > 0 ? badges : null,
            // идентификаторы для модерации через Helix
            msgId = tags.TryGetValue("id", out var mid) ? mid : null,
            userId = tags.TryGetValue("user-id", out var uid) ? uid : null,
            roomId = tags.TryGetValue("room-id", out var rid2) ? rid2 : null,
        });
    }

    /// Сообщение удалено модератором (в том числе из другого клиента).
    private void HandleClearMsg(string line)
    {
        var tags = Tags(line);
        var target = tags.TryGetValue("target-msg-id", out var t) ? t : "";
        if (target.Length == 0) return;
        _emit(new ChatEvent
        {
            platform = "twitch",
            channel = _user,
            kind = "moderation.delete",
            msgId = target,
            author = tags.TryGetValue("login", out var l) ? l : "",
            text = "",
        });
    }

    /// Бан/таймаут пользователя либо полная очистка чата.
    private void HandleClearChat(string line)
    {
        var tags = Tags(line);
        var login = ExtractText(line, "CLEARCHAT");
        _emit(new ChatEvent
        {
            platform = "twitch",
            channel = _user,
            kind = string.IsNullOrEmpty(login) ? "moderation.clear" : "moderation.ban",
            author = login ?? "",
            userId = tags.TryGetValue("target-user-id", out var tu) ? tu : null,
            text = tags.TryGetValue("ban-duration", out var d) ? d : "",
        });
    }

    private void HandleUserNotice(string line)
    {
        var tags = Tags(line);
        if (!tags.TryGetValue("msg-id", out var id)) return;
        var sys = tags.TryGetValue("system-msg", out var sm) ? sm.Replace("\\s", " ") : "";
        var author = tags.TryGetValue("display-name", out var dn) ? dn : "";
        var ev = new ChatEvent { platform = "twitch", channel = _user, author = author, text = sys };
        switch (id)
        {
            case "sub": case "resub": ev.kind = "sub"; break;
            case "subgift": case "submysterygift": ev.kind = "gift"; break;
            case "raid": ev.kind = "raid"; break;
            case "bitsbadgetier": ev.kind = "bits"; break;
            default: return;
        }
        _emit(ev);
    }

    private static string[] ParseBadges(string s)
    {
        var list = new List<string>();
        foreach (var b in s.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var name = b.Split('/')[0];
            var map = name switch
            {
                "moderator" or "broadcaster" => "mod",
                "subscriber" => "sub",
                "vip" => "vip",
                "turbo" => "turbo",
                _ => "",
            };
            if (map.Length > 0) list.Add(map);
        }
        return list.ToArray();
    }

    public void Dispose()
    {
        lock (Live)
        {
            if (Live.TryGetValue(_user, out var cur) && ReferenceEquals(cur, this)) Live.Remove(_user);
        }
        _authenticated = false;
        _writer = null;
        try { _tcp?.Close(); } catch { }
    }
}

/* ========================== KICK (Pusher WebSocket) ========================== */

/* ============ TWITCH EVENTSUB (фолловы, подписки, награды, рейды, биты) ============ */

/// <summary>
/// События канала Twitch приходят НЕ в IRC, а через EventSub WebSocket.
/// Именно поэтому раньше в ленте не было фолловов, подписок и наград за
/// баллы: IRC отдаёт только USERNOTICE (ресабы/рейды) и ничего про
/// награды и новых фолловеров. Работает поверх токена, полученного при
/// входе в разделе «Чат-бот».
/// </summary>
public sealed class TwitchEventSubConnector : IPlatformConnector
{
    private const string WsUrl = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";

    private readonly string _channelLogin;
    private readonly Action<ChatEvent> _emit;
    private ClientWebSocket? _ws;

    public TwitchEventSubConnector(string channelLogin, Action<ChatEvent> emit)
    {
        _channelLogin = channelLogin.Trim().TrimStart('@').ToLowerInvariant();
        _emit = emit;
    }

    /// Диагностика видна пользователю в ленте: иначе «событий нет» без причины.
    private void Note(string text) => _emit(new ChatEvent
    {
        platform = "twitch",
        channel = _channelLogin,
        kind = "system",
        text = text,
    });

    public async Task RunAsync(CancellationToken ct)
    {
        var token = ConnectorManager.BotToken;
        if (string.IsNullOrWhiteSpace(token)) return;   // без входа событий нет

        using var http = Net.Http();
        http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
        http.DefaultRequestHeaders.Add("Client-Id", AppAuth.TwitchClientId);

        var broadcasterId = await UserId(http, _channelLogin, ct);
        var selfId = await SelfId(token, ct);
        if (broadcasterId.Length == 0 || selfId.Length == 0)
        {
            Note($"События Twitch: не удалось определить id канала {_channelLogin}");
            return;
        }

        _ws = new ClientWebSocket();
        await _ws.ConnectAsync(new Uri(WsUrl), ct);

        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("Twitch EventSub: соединение закрыто");

            using var doc = JsonDocument.Parse(frame);
            var root = doc.RootElement;
            if (!root.TryGetProperty("metadata", out var meta)) continue;
            var msgType = meta.TryGetProperty("message_type", out var mt) ? mt.GetString() : "";

            if (msgType == "session_welcome")
            {
                var sessionId = Net.FindString(root, "id") ?? "";
                if (sessionId.Length == 0) continue;
                await Subscribe(http, sessionId, broadcasterId, selfId, ct);
            }
            else if (msgType == "notification")
            {
                try { HandleNotification(root); }
                catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[eventsub] {ex.Message}"); }
            }
            else if (msgType == "session_reconnect")
            {
                // Twitch просит переехать — выходим, менеджер переподключит
                throw new InvalidOperationException("Twitch EventSub: требуется переподключение");
            }
        }
    }

    private static async Task<string> UserId(HttpClient http, string login, CancellationToken ct)
    {
        try
        {
            var body = await http.GetStringAsync(
                $"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}", ct);
            using var d = JsonDocument.Parse(body);
            return d.RootElement.TryGetProperty("data", out var arr) && arr.GetArrayLength() > 0
                ? Net.FindString(arr[0], "id") ?? "" : "";
        }
        catch { return ""; }
    }

    private static async Task<string> SelfId(string token, CancellationToken ct)
    {
        try
        {
            using var vh = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            vh.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
            var body = await vh.GetStringAsync("https://id.twitch.tv/oauth2/validate", ct);
            using var d = JsonDocument.Parse(body);
            return Net.FindString(d.RootElement, "user_id") ?? "";
        }
        catch { return ""; }
    }

    /// Подписки на события канала. Часть требует, чтобы вход был выполнен
    /// владельцем канала (награды, подписки) — такие просто не создадутся.
    private async Task Subscribe(HttpClient http, string sessionId, string broadcasterId, string selfId, CancellationToken ct)
    {
        var subs = new (string type, string version, object condition)[]
        {
            ("channel.follow", "2", new { broadcaster_user_id = broadcasterId, moderator_user_id = selfId }),
            ("channel.subscribe", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.subscription.gift", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.subscription.message", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.cheer", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.raid", "1", new { to_broadcaster_user_id = broadcasterId }),
            ("channel.channel_points_custom_reward_redemption.add", "1", new { broadcaster_user_id = broadcasterId }),
        };

        int ok = 0, failed = 0;
        foreach (var (type, version, condition) in subs)
        {
            try
            {
                var payload = JsonSerializer.Serialize(new
                {
                    type,
                    version,
                    condition,
                    transport = new { method = "websocket", session_id = sessionId },
                });
                using var content = new StringContent(payload, Encoding.UTF8, "application/json");
                var res = await http.PostAsync("https://api.twitch.tv/helix/eventsub/subscriptions", content, ct);
                if (!res.IsSuccessStatusCode)
                {
                    var err = await res.Content.ReadAsStringAsync(ct);
                    failed++;
                    // 403 = у токена нет нужного права → нужен повторный вход
                    Note($"События Twitch: {type} отклонено ({(int)res.StatusCode}). {Short(err)}");
                }
                else ok++;
            }
            catch (Exception ex) { failed++; Note($"События Twitch: {type} — {ex.Message}"); }
        }

        Note(failed == 0
            ? $"События Twitch подключены ({ok} подписок): фолловы, подписки, награды, рейды"
            : $"События Twitch: активно {ok}, отклонено {failed}. Если отклонено — выйдите и войдите в Twitch заново (нужны новые права)");
    }

    private static string Short(string s) =>
        s.Length <= 160 ? s : s[..160] + "…";

    private void HandleNotification(JsonElement root)
    {
        var subType = root.TryGetProperty("metadata", out var meta) && meta.TryGetProperty("subscription_type", out var st)
            ? st.GetString() ?? "" : "";
        if (!root.TryGetProperty("payload", out var payload) || !payload.TryGetProperty("event", out var ev)) return;

        string user = Net.FindString(ev, "user_name") ?? Net.FindString(ev, "user_login") ?? "";
        var e = new ChatEvent { platform = "twitch", channel = _channelLogin, author = user };

        switch (subType)
        {
            case "channel.follow":
                e.kind = "sub";
                e.text = "новый фолловер";
                break;

            case "channel.subscribe":
            {
                var tier = Net.FindString(ev, "tier") ?? "1000";
                e.kind = "sub";
                e.text = $"оформил подписку (Tier {tier[..1]})";
                break;
            }

            case "channel.subscription.message":
            {
                var months = Net.FindInt(ev, "cumulative_months");
                var text = Net.TryFind(ev, "message", out var mo) ? Net.FindString(mo, "text") ?? "" : "";
                e.kind = "sub";
                e.text = months > 0 ? $"продлил подписку ({months} мес.) {text}".Trim() : $"продлил подписку {text}".Trim();
                break;
            }

            case "channel.subscription.gift":
            {
                var total = Net.FindInt(ev, "total");
                var anon = Net.TryFind(ev, "is_anonymous", out var an) && an.ValueKind == JsonValueKind.True;
                e.kind = "gift";
                e.author = anon ? "Аноним" : user;
                e.text = $"подарил {(total > 0 ? total : 1)} подписк(и)";
                break;
            }

            case "channel.cheer":
            {
                var bits = Net.FindInt(ev, "bits");
                var anon = Net.TryFind(ev, "is_anonymous", out var ca) && ca.ValueKind == JsonValueKind.True;
                e.kind = "bits";
                e.author = anon ? "Аноним" : user;
                e.text = $"отправил {bits} бит(ов) {Net.FindString(ev, "message") ?? ""}".Trim();
                break;
            }

            case "channel.raid":
            {
                var from = Net.FindString(ev, "from_broadcaster_user_name") ?? "";
                var viewers = Net.FindInt(ev, "viewers");
                e.kind = "raid";
                e.author = from;
                e.text = $"рейд на {viewers} зрителей";
                break;
            }

            case "channel.channel_points_custom_reward_redemption.add":
            {
                var rewardName = Net.TryFind(ev, "reward", out var rw) ? Net.FindString(rw, "title") ?? "награда" : "награда";
                var input = Net.FindString(ev, "user_input") ?? "";
                e.kind = "reward";
                e.text = string.IsNullOrWhiteSpace(input)
                    ? $"активировал награду «{rewardName}»"
                    : $"активировал награду «{rewardName}»: {input}";
                break;
            }

            default:
                return;
        }

        _emit(e);
    }

    public void Dispose() { try { _ws?.Abort(); } catch { } }
}

public sealed class KickConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;

    public KickConnector(string user, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = user.ToLowerInvariant();
        _emit = emit;
        _status = status;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);
        using var http = Net.Http();
        var chJson = await http.GetStringAsync($"https://kick.com/api/v2/channels/{_user}", ct);
        using var ch = JsonDocument.Parse(chJson);
        if (!ch.RootElement.TryGetProperty("chatroom", out var room))
            throw new InvalidOperationException($"Kick: канал «{_user}» не найден");
        var chatroomId = room.GetProperty("id").GetInt32();
        var isLive = ch.RootElement.TryGetProperty("livestream", out var ls) && ls.ValueKind == JsonValueKind.Object;
        var viewers = isLive && ls.TryGetProperty("viewer_count", out var vc) ? vc.GetInt32() : 0;

        _ws = new ClientWebSocket();
        await _ws.ConnectAsync(
            new Uri("wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false"), ct);
        await Net.WsSend(_ws, JsonSerializer.Serialize(new
        {
            @event = "pusher:subscribe",
            data = new { auth = "", channel = $"chatrooms.{chatroomId}.v2" },
        }), ct);

        _status(isLive ? "online" : "connected", viewers);

        // периодическая проверка эфира
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try { await Task.Delay(60000, ct); } catch { return; }
                try
                {
                    var j = await http.GetStringAsync($"https://kick.com/api/v2/channels/{_user}", ct);
                    using var d = JsonDocument.Parse(j);
                    var live = d.RootElement.TryGetProperty("livestream", out var l) && l.ValueKind == JsonValueKind.Object;
                    var v = live && l.TryGetProperty("viewer_count", out var x) ? x.GetInt32() : 0;
                    _status(live ? "online" : "connected", v);
                }
                catch { }
            }
        }, CancellationToken.None);

        while (!ct.IsCancellationRequested)
        {
            var text = await Net.WsRecv(_ws, ct);
            if (text == null) throw new InvalidOperationException("Kick: соединение закрыто");
            using var doc = JsonDocument.Parse(text);
            var evName = doc.RootElement.TryGetProperty("event", out var e) ? e.GetString() : "";
            if (evName == "pusher:ping")
            {
                await Net.WsSend(_ws, "{\"event\":\"pusher:pong\",\"data\":{}}", ct);
                continue;
            }
            if (!string.Equals(evName, "App\\Events\\ChatMessageEvent", StringComparison.Ordinal)) continue;

            var payload = doc.RootElement.GetProperty("data").GetString();
            if (string.IsNullOrEmpty(payload)) continue;
            using var inner = JsonDocument.Parse(payload);
            var dataEl = inner.RootElement;

            if (dataEl.TryGetProperty("type", out var tp))
            {
                var t = tp.GetString();
                if (t != "message" && t != "reply") continue;
            }
            var content = dataEl.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
            // смайлы Kick: [emote:123456:KEKW] → картинка с CDN
            content = Regex.Replace(content, @"\[emote:(\d+):([\w]+)\]",
                m => Net.Emote($"https://files.kick.com/emotes/{m.Groups[1].Value}/fullsize", m.Groups[2].Value));
            if (content.Length == 0) continue;

            var sender = dataEl.GetProperty("sender");
            var author = sender.TryGetProperty("username", out var un) ? un.GetString() ?? "" : "";
            var color = "";
            var badges = new List<string>();
            if (sender.TryGetProperty("identity", out var idn))
            {
                if (idn.TryGetProperty("color", out var cl)) color = cl.GetString() ?? "";
                if (idn.TryGetProperty("badges", out var bArr) && bArr.ValueKind == JsonValueKind.Array)
                    foreach (var b in bArr.EnumerateArray())
                    {
                        var t = b.TryGetProperty("type", out var bt) ? bt.GetString() : "";
                        var map = t switch
                        {
                            "moderator" or "broadcaster" => "mod",
                            "subscriber" => "sub",
                            "vip" => "vip",
                            _ => "",
                        };
                        if (map.Length > 0) badges.Add(map);
                    }
            }
            _emit(new ChatEvent
            {
                platform = "kick",
                channel = _user,
                author = author,
                color = color,
                text = content,
                kind = "chat",
                badges = badges.Count > 0 ? badges.ToArray() : null,
            });
        }
    }

    public void Dispose() { try { _ws?.Abort(); } catch { } }
}

/* ============ VK ВИДЕО LIVE (Centrifugo v2, публичный чат) ============
 * Протокол (реверс официального веб-клиента live.vkvideo.ru):
 *   1. GET https://api.live.vkvideo.ru/v1/blog/{channel}  → publicWebSocketChannel
 *   2. GET https://api.live.vkvideo.ru/v1/ws/connect      → анонимный токен
 *   3. wss://pubsub.live.vkvideo.ru/connection/websocket?cf_protocol_version=v2
 *      с обязательным заголовком Origin: https://live.vkvideo.ru
 *   4. {"connect":{"token":..,"name":"js"},"id":1}
 *      {"subscribe":{"channel":"public-chat:<ch>"},"id":2}
 *      {"subscribe":{"channel":"channel-info:<ch>"},"id":3}
 *   5. keep-alive: сервер шлёт "{}", клиент обязан ответить "{}"
 * Сообщение: push.pub.data.type == "message", блоки текста лежат в data.data[]
 * ==================================================================== */

public sealed class VkVideoLiveConnector : IPlatformConnector
{
    private const string ApiBase = "https://api.live.vkvideo.ru/v1";
    private const string WsUrl = "wss://pubsub.live.vkvideo.ru/connection/websocket?cf_protocol_version=v2";
    private const string Origin = "https://live.vkvideo.ru";

    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;

    public VkVideoLiveConnector(string user, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = user.Trim().TrimStart('@').ToLowerInvariant();
        _emit = emit;
        _status = status;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        using var http = Net.Http();
        http.DefaultRequestHeaders.Add("Origin", Origin);
        http.DefaultRequestHeaders.Referrer = new Uri($"{Origin}/{_user}");

        /* 1) информация о канале */
        var blogResp = await http.GetAsync($"{ApiBase}/blog/{_user}", ct);
        if (!blogResp.IsSuccessStatusCode)
            throw new InvalidOperationException($"VK: канал «{_user}» не найден ({(int)blogResp.StatusCode})");
        var blogJson = await blogResp.Content.ReadAsStringAsync(ct);

        using var blogDoc = JsonDocument.Parse(blogJson);
        var blogRoot = blogDoc.RootElement;

        var wsChannel = Net.FindString(blogRoot, "publicWebSocketChannel");
        if (string.IsNullOrEmpty(wsChannel))
            throw new InvalidOperationException("VK: не удалось получить канал чата (publicWebSocketChannel)");

        // API возвращает, например, "blogger:9671656". Рабочий клиент VK
        // берёт часть ПОСЛЕ двоеточия и подписывается на public-chat:9671656.
        var wsChannelId = wsChannel.Contains(':')
            ? wsChannel[(wsChannel.LastIndexOf(':') + 1)..]
            : wsChannel;
        if (string.IsNullOrWhiteSpace(wsChannelId))
            throw new InvalidOperationException("VK: пустой идентификатор websocket-канала");

        bool live = Net.FindBool(blogRoot, "isOnline");
        int viewers = Net.FindInt(blogRoot, "viewers");

        /* 2) websocket-токен. С токеном аккаунта VK отдаёт ПРИВАТНЫЕ события
              канала (награды за баллы, подписки, журнал действий); анонимный
              токен даёт только публичный чат. */
        string wsToken = "";
        try
        {
            using var tokenReq = new HttpRequestMessage(HttpMethod.Get, $"{ApiBase}/ws/connect");
            if (!string.IsNullOrWhiteSpace(ConnectorManager.VkToken))
                tokenReq.Headers.TryAddWithoutValidation("Authorization", $"Bearer {ConnectorManager.VkToken}");
            var tokenResp = await http.SendAsync(tokenReq, ct);
            var tokenJson = await tokenResp.Content.ReadAsStringAsync(ct);
            using var tokenDoc = JsonDocument.Parse(tokenJson);
            wsToken = Net.FindString(tokenDoc.RootElement, "token") ?? "";
        }
        catch { /* публичный чат читается и с пустым токеном */ }

        /* 3) Centrifugo v2 */
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Origin", Origin);
        _ws.Options.SetRequestHeader("User-Agent", Net.UA);
        await _ws.ConnectAsync(new Uri(WsUrl), ct);

        await Net.WsSend(_ws, JsonSerializer.Serialize(new { connect = new { token = wsToken, name = "js" }, id = 1 }), ct);
        var hello = await Net.WsRecv(_ws, ct);
        if (hello == null) throw new InvalidOperationException("VK: сервер закрыл соединение при подключении");
        if (hello.Contains("\"error\"", StringComparison.Ordinal))
            throw new InvalidOperationException("VK: отказ авторизации сокета — " + hello);

        var chatCh = $"public-chat:{wsChannelId}";
        var infoCh = $"channel-info:{wsChannelId}";

        await Net.WsSend(_ws, JsonSerializer.Serialize(new { subscribe = new { channel = chatCh }, id = 2 }), ct);
        await WaitForSubscriptionAsync(_ws, 2, ct);

        await Net.WsSend(_ws, JsonSerializer.Serialize(new { subscribe = new { channel = infoCh }, id = 3 }), ct);
        // Информация об эфире вспомогательная: её ответ обработает основной
        // цикл. Не блокируем приём сообщений чата ожиданием второй подписки.

        // Каналы событий: награды за баллы и журнал действий (фолловы,
        // подписки, донаты). Часть доступна только с токеном аккаунта —
        // неудачные подписки просто игнорируются сервером.
        var eventChannels = new[]
        {
            $"channel-points:{wsChannelId}",
            $"channel-reward:{wsChannelId}",
            $"actions-journal:{wsChannelId}",
            $"private-channel:{wsChannelId}",
        };
        int subId = 10;
        foreach (var ch in eventChannels)
        {
            try { await Net.WsSend(_ws, JsonSerializer.Serialize(new { subscribe = new { channel = ch }, id = subId++ }), ct); }
            catch { }
        }

        _status(live ? "online" : "connected", live ? viewers : 0);

        /* 4) приём сообщений; keep-alive: на "{}" отвечаем "{}" */
        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("VK: соединение с чатом закрыто");

            // Centrifugo шлёт JSON-объекты, разделённые переводом строки
            foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var s = line.Trim();
                if (s.Length == 0) continue;
                if (s == "{}")
                {
                    await Net.WsSend(_ws, "{}", ct);   // pong обязателен, иначе сервер рвёт связь
                    continue;
                }
                try { HandleFrame(s); }
                catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[vk parse] {ex.Message} :: {s}"); }
            }
        }
    }

    private void HandlePossiblePush(string frame)
    {
        foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var value = line.Trim();
            if (value.Length == 0 || value == "{}") continue;
            try { HandleFrame(value); } catch { }
        }
    }

    /// Ждём подтверждение конкретной команды subscribe, не теряя push-события.
    private async Task WaitForSubscriptionAsync(ClientWebSocket ws, int commandId, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(8));
        var waitToken = timeout.Token;

        try
        {
            while (!waitToken.IsCancellationRequested)
            {
                var frame = await Net.WsRecv(ws, waitToken)
                    ?? throw new InvalidOperationException("VK: соединение закрыто во время подписки");
                if (frame.Trim() == "{}")
                {
                    await Net.WsSend(ws, "{}", waitToken);
                    continue;
                }

                foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("push", out _))
                    {
                        HandlePossiblePush(line);
                        continue;
                    }
                    if (!root.TryGetProperty("id", out var id) || id.GetInt32() != commandId)
                        continue;
                    if (root.TryGetProperty("error", out var error))
                    {
                        var reason = Net.FindString(error, "message") ?? error.GetRawText();
                        throw new InvalidOperationException($"VK: подписка {commandId} отклонена: {reason}");
                    }
                    return;
                }
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException($"VK: нет подтверждения подписки {commandId}");
        }

        throw new TimeoutException($"VK: нет подтверждения подписки {commandId}");
    }

    private void HandleFrame(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        // ответ на subscribe с ошибкой — сразу видно причину
        if (root.TryGetProperty("error", out var err))
        {
            var msg = Net.FindString(err, "message") ?? err.GetRawText();
            System.Diagnostics.Debug.WriteLine($"[vk] ошибка подписки: {msg}");
            return;
        }

        if (!root.TryGetProperty("push", out var push)) return;
        if (!push.TryGetProperty("pub", out var pub)) return;
        if (!pub.TryGetProperty("data", out var data)) return;

        var type = data.TryGetProperty("type", out var t) ? t.GetString() : "";

        // страховка: тип не распознан, но структура похожа на сообщение чата
        if (string.IsNullOrEmpty(type) && data.TryGetProperty("data", out _))
            type = "message";

        switch (type)
        {
            case "message":
                EmitChat(data);
                break;

            case "stream_online_status":
            {
                // единственный достоверный источник статуса эфира
                var online = data.TryGetProperty("isOnline", out var io) && io.ValueKind == JsonValueKind.True;
                var v = data.TryGetProperty("viewers", out var vw) && vw.TryGetInt32(out var vi) ? vi : 0;
                _status(online ? "online" : "connected", online ? v : 0);
                break;
            }

            case "stream_start":
                // само число зрителей придёт следующим stream_online_status
                _status("online", 0);
                break;

            case "stream_end":
                _status("connected", 0);
                break;

            // Награда за баллы канала. Ключевое: если зритель приложил текст
            // (в т.ч. награда «выделить сообщение»), он ДОЛЖЕН попасть в ленту
            // как сообщение чата — раньше текст терялся целиком.
            case "cp_reward_demand":
            case "cp_reward_demand_update":
            case "reward_demand":
            {
                var inner = data.TryGetProperty("data", out var rd) ? rd : data;
                var nick = Net.FindString(inner, "nick") ?? Net.FindString(inner, "displayName") ?? "";
                var rewardName = Net.TryFind(inner, "reward", out var rw)
                    ? Net.FindString(rw, "name") ?? Net.FindString(rw, "title") ?? "награда"
                    : "награда";
                var userText = Net.FindString(inner, "userText")
                    ?? Net.FindString(inner, "user_text")
                    ?? Net.FindString(inner, "text")
                    ?? "";

                _emit(new ChatEvent
                {
                    platform = "vkplay",
                    channel = _user,
                    author = nick,
                    text = string.IsNullOrWhiteSpace(userText)
                        ? $"активировал награду «{rewardName}»"
                        : $"активировал награду «{rewardName}»: {userText}",
                    kind = "reward",
                });

                // текст награды дополнительно показываем как обычное сообщение
                if (!string.IsNullOrWhiteSpace(userText))
                    _emit(new ChatEvent
                    {
                        platform = "vkplay",
                        channel = _user,
                        author = nick,
                        text = userText,
                        kind = "chat",
                    });
                break;
            }

            // Донаты и события VK приходят журналом действий канала
            case "actions_journal_new_event":
            case "action_journal_new_event":
            {
                var inner = data.TryGetProperty("data", out var jd) ? jd : data;
                var evType = inner.TryGetProperty("type", out var jt) ? jt.GetString() : "";
                var nick = Net.FindString(inner, "displayName") ?? Net.FindString(inner, "nick") ?? "";
                var ev = new ChatEvent { platform = "vkplay", channel = _user, author = nick };

                switch (evType)
                {
                    case "following":
                    case "actions_journal_follower":
                    case "follower":
                        ev.kind = "sub";
                        ev.text = "новый отслеживающий";
                        break;

                    case "subscription":
                    case "actions_journal_subscription":
                    case "channel_subscription":
                        ev.kind = "sub";
                        ev.text = "оформил подписку канала";
                        break;

                    case "donation":
                    case "actions_journal_donation":
                    {
                        var amount = Net.FindInt(inner, "amount");
                        ev.kind = "donate";
                        ev.amount = amount > 0 ? amount : null;
                        ev.currency = "₽";
                        ev.text = Net.FindString(inner, "message") ?? "";
                        break;
                    }

                    default:
                        return;   // неизвестное событие журнала пропускаем
                }
                _emit(ev);
                break;
            }
        }
    }

    private void EmitChat(JsonElement data)
    {
        // тело сообщения: обычно data.data, но встречается и плоская форма
        var msg = data.TryGetProperty("data", out var inner) ? inner : data;

        // автор: author → user → рекурсивный поиск по дереву
        var author = "";
        if (msg.TryGetProperty("author", out var a) || msg.TryGetProperty("user", out a))
            author = (a.TryGetProperty("displayName", out var dn) ? dn.GetString() : null)
                     ?? (a.TryGetProperty("nick", out var nk) ? nk.GetString() : null)
                     ?? "";
        if (string.IsNullOrEmpty(author))
            author = Net.FindString(msg, "displayName") ?? Net.FindString(msg, "nick") ?? "";

        // бейджи: владелец / модератор
        var badges = new List<string>();
        if (msg.TryGetProperty("author", out var au))
        {
            if (au.TryGetProperty("isOwner", out var ow) && ow.ValueKind == JsonValueKind.True) badges.Add("mod");
            else if ((au.TryGetProperty("isChatModerator", out var cm) && cm.ValueKind == JsonValueKind.True) ||
                     (au.TryGetProperty("isChannelModerator", out var chm) && chm.ValueKind == JsonValueKind.True))
                badges.Add("mod");
            if (au.TryGetProperty("badges", out var bd) && bd.ValueKind == JsonValueKind.Array && bd.GetArrayLength() > 0)
                badges.Add("sub");
        }

        // текст: массив блоков (text / smile / mention / link)
        var sb = new StringBuilder();
        if (!msg.TryGetProperty("data", out var blocks) || blocks.ValueKind != JsonValueKind.Array)
            Net.TryFind(msg, "data", out blocks);   // блоки могут лежать глубже

        if (blocks.ValueKind == JsonValueKind.Array)
        {
            foreach (var b in blocks.EnumerateArray())
            {
                var bt = b.TryGetProperty("type", out var bty) ? bty.GetString() : "";
                switch (bt)
                {
                    case "text":
                    {
                        // content — строка с JSON-массивом: "[\"привет\",\"unstyled\",[]]"
                        var raw = b.TryGetProperty("content", out var cEl) ? cEl.GetString() ?? "" : "";
                        sb.Append(ParseTextBlock(raw));
                        break;
                    }
                    case "smile":
                    {
                        // смайлы VK приходят с готовыми URL — показываем картинкой
                        var url = (b.TryGetProperty("largeUrl", out var lu2) ? lu2.GetString() : null)
                                  ?? (b.TryGetProperty("mediumUrl", out var mu) ? mu.GetString() : null)
                                  ?? (b.TryGetProperty("smallUrl", out var su) ? su.GetString() : null);
                        var nm = b.TryGetProperty("name", out var sn) ? sn.GetString() ?? "smile" : "smile";
                        sb.Append(string.IsNullOrEmpty(url) ? $":{nm}:" : Net.Emote(url, nm));
                        break;
                    }
                    case "mention":
                        sb.Append('@')
                          .Append((b.TryGetProperty("displayName", out var mdn) ? mdn.GetString() : null)
                                  ?? (b.TryGetProperty("nick", out var mn) ? mn.GetString() : "") ?? "")
                          .Append(' ');
                        break;
                    case "link":
                        sb.Append(b.TryGetProperty("content", out var lc) ? lc.GetString() : b.TryGetProperty("url", out var lu) ? lu.GetString() : "");
                        break;
                }
            }
        }

        var text = sb.ToString().Trim();
        // последний резерв: простое текстовое поле
        if (text.Length == 0) text = (Net.FindString(msg, "text") ?? "").Trim();
        if (text.Length == 0) return;

        _emit(new ChatEvent
        {
            platform = "vkplay",
            channel = _user,
            author = author,
            text = text,
            kind = "chat",
            badges = badges.Count > 0 ? badges.ToArray() : null,
        });
    }

    /// Блок текста приходит как строка с JSON-массивом ["текст","unstyled",[]]
    private static string ParseTextBlock(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return "";
        if (!raw.TrimStart().StartsWith('[')) return raw;
        try
        {
            using var d = JsonDocument.Parse(raw);
            if (d.RootElement.ValueKind == JsonValueKind.Array && d.RootElement.GetArrayLength() > 0)
            {
                var first = d.RootElement[0];
                if (first.ValueKind == JsonValueKind.String) return first.GetString() ?? "";
            }
        }
        catch { }
        return raw;
    }

    public void Dispose() { try { _ws?.Abort(); } catch { } }
}

/* ============== YOUTUBE LIVE (innertube get_live_chat, без API-ключа) ============== */

public sealed class YouTubeConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;

    public YouTubeConnector(string user, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = user.Trim().TrimStart('@');
        _emit = emit;
        _status = status;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        using var http = Net.Http();
        while (!ct.IsCancellationRequested)
        {
            _status("connecting", 0);
            string? liveHtml = null;
            foreach (var url in new[]
            {
                $"https://www.youtube.com/@{_user}/live",
                $"https://www.youtube.com/channel/{_user}/live",
                $"https://www.youtube.com/user/{_user}/live",
            })
            {
                try
                {
                    var h = await http.GetStringAsync(url, ct);
                    if (h.Contains("liveChatRenderer") || h.Contains("\"videoId\":\"")) { liveHtml = h; break; }
                }
                catch { }
            }

            string? cont = liveHtml == null ? null : ExtractAfter(liveHtml, "liveChatRenderer", "\"continuation\":\"", "\"");
            if (liveHtml == null || cont == null)
            {
                _status("connected", 0);   // канал есть, но эфира нет
                try { await Task.Delay(TimeSpan.FromMinutes(2), ct); } catch { return; }
                continue;
            }

            var apiKey = Extract(liveHtml, "\"INNERTUBE_API_KEY\":\"", "\"") ?? throw new InvalidOperationException("YouTube: innertube key не найден");
            var clientVer = Extract(liveHtml, "\"clientVersion\":\"", "\"") ?? "2.20240620.01.00";
            // счётчик зрителей: раньше всегда уходил 0 и колонка была пустой
            var liveUrl = $"https://www.youtube.com/{(_user.StartsWith('@') ? _user : "@" + _user)}/live";
            _status("online", ParseViewers(liveHtml));

            // периодическое обновление счётчика, пока идёт эфир
            using var viewersCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            _ = Task.Run(async () =>
            {
                while (!viewersCts.IsCancellationRequested)
                {
                    try { await Task.Delay(TimeSpan.FromSeconds(15), viewersCts.Token); } catch { return; }
                    try
                    {
                        // тянем только начало страницы: счётчик лежит в первых
                        // килобайтах, полная загрузка была лишней нагрузкой
                        using var req = new HttpRequestMessage(HttpMethod.Get, liveUrl);
                        req.Headers.TryAddWithoutValidation("Range", "bytes=0-300000");
                        using var res = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, viewersCts.Token);
                        var page = await res.Content.ReadAsStringAsync(viewersCts.Token);
                        var v = ParseViewers(page);
                        if (v > 0) _status("online", v);
                    }
                    catch { /* временная ошибка сети — попробуем позже */ }
                }
            }, CancellationToken.None);

            var errorStreak = 0;
            // Первый ответ innertube содержит ИСТОРИЮ чата за последние минуты.
            // Показываем только то, что пришло после подключения.
            var skipHistory = true;
            while (!ct.IsCancellationRequested)
            {
                string resp;
                try
                {
                    var body = JsonSerializer.Serialize(new
                    {
                        context = new { client = new { clientName = "WEB", clientVersion = clientVer } },
                        continuation = cont,
                    });
                    using var content = new StringContent(body, Encoding.UTF8, "application/json");
                    var r = await http.PostAsync($"https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={apiKey}", content, ct);
                    resp = await r.Content.ReadAsStringAsync(ct);
                }
                catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
                {
                    if (++errorStreak > 5) break;   // вернёмся к поиску эфира
                    try { await Task.Delay(5000, ct); } catch { return; }
                    continue;
                }
                errorStreak = 0;
                var waitMs = 900;
                // первая пачка = история чата, её не показываем
                var isHistoryBatch = skipHistory;
                skipHistory = false;

                using var doc = JsonDocument.Parse(resp);
                if (doc.RootElement.TryGetProperty("continuationContents", out var cc) &&
                    cc.TryGetProperty("liveChatContinuation", out var lcc))
                {
                    if (lcc.TryGetProperty("continuations", out var conts) && conts.GetArrayLength() > 0)
                    {
                        var c0 = conts[0];
                        if (c0.TryGetProperty("timedContinuationData", out var tcd))
                        {
                            cont = tcd.GetProperty("continuation").GetString() ?? cont;
                            if (tcd.TryGetProperty("timeoutMs", out var tm)) waitMs = tm.GetInt32();
                        }
                        else if (c0.TryGetProperty("invalidationContinuationData", out var icd))
                            cont = icd.GetProperty("continuation").GetString() ?? cont;
                    }

                    if (lcc.TryGetProperty("actions", out var actions) && !isHistoryBatch)
                        foreach (var a in actions.EnumerateArray())
                        {
                            if (!a.TryGetProperty("addChatItemAction", out var add)) continue;
                            if (!add.TryGetProperty("item", out var item)) continue;
                            HandleYouTubeItem(item);
                        }
                }
                // YouTube нередко просит ждать 5–10 секунд, из-за чего чат шёл
                // с заметной задержкой. Опрашиваем чаще — лента идёт «вживую».
                try { await Task.Delay(Math.Clamp(waitMs, 400, 1500), ct); } catch { return; }
            }
        }
    }

    /// <summary>
    /// Разбор всех типов элементов YouTube Live чата:
    /// обычные сообщения, спонсорские подписки (memberships), Super Chat и подарки.
    /// </summary>
    private void HandleYouTubeItem(JsonElement item)
    {
        // 1) Обычное текстовое сообщение
        if (item.TryGetProperty("liveChatTextMessageRenderer", out var m))
        {
            var text = ParseYouTubeRuns(m, "message");
            if (string.IsNullOrEmpty(text)) return;
            var author = ExtractAuthor(m);
            var badges = ExtractBadges(m);
            _emit(new ChatEvent
            {
                platform = "youtube",
                channel = _user,
                author = author,
                text = text,
                kind = "chat",
                badges = badges.Length > 0 ? badges : null,
            });
            return;
        }

        // 2) Спонсорская подписка (Membership / Новый спонсор / Продление)
        if (item.TryGetProperty("liveChatMembershipItemRenderer", out var mem))
        {
            var author = ExtractAuthor(mem);
            var subtext = ParseYouTubeRuns(mem, "headerSubtext");
            if (string.IsNullOrWhiteSpace(subtext)) subtext = "оформил спонсорскую подписку";
            var comment = ParseYouTubeRuns(mem, "message");
            var fullText = string.IsNullOrWhiteSpace(comment) ? subtext : $"{subtext}: {comment}";
            var badges = ExtractBadges(mem);
            _emit(new ChatEvent
            {
                platform = "youtube",
                channel = _user,
                author = author,
                text = fullText,
                kind = "sub",
                badges = badges.Length > 0 ? badges : new[] { "sub" },
            });
            return;
        }

        // 3) Super Chat (платное сообщение / донат)
        if (item.TryGetProperty("liveChatPaidMessageRenderer", out var paid))
        {
            var author = ExtractAuthor(paid);
            var text = ParseYouTubeRuns(paid, "message");
            var amountStr = "";
            if (paid.TryGetProperty("purchaseAmountText", out var pat) && pat.TryGetProperty("simpleText", out var patSt))
                amountStr = patSt.GetString() ?? "";

            var (amount, currency) = ParseAmountAndCurrency(amountStr);
            var badges = ExtractBadges(paid);
            _emit(new ChatEvent
            {
                platform = "youtube",
                channel = _user,
                author = author,
                text = string.IsNullOrWhiteSpace(text) ? $"Super Chat {amountStr}" : text,
                kind = "donate",
                amount = amount,
                currency = currency,
                badges = badges.Length > 0 ? badges : null,
            });
            return;
        }

        // 4) Подарочные спонсорские подписки (Gifted memberships)
        if (item.TryGetProperty("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer", out var gift))
        {
            var author = "";
            if (gift.TryGetProperty("header", out var hdr) &&
                hdr.TryGetProperty("liveChatSponsorshipsHeaderRenderer", out var hr))
            {
                author = ExtractAuthor(hr);
                var text = ParseYouTubeRuns(hr, "primaryText");
                if (string.IsNullOrWhiteSpace(text)) text = "подарил спонсорские подписки";
                _emit(new ChatEvent
                {
                    platform = "youtube",
                    channel = _user,
                    author = author,
                    text = text,
                    kind = "gift",
                    badges = new[] { "sub" },
                });
            }
            return;
        }

        // 5) Получение подарка спонсорства
        if (item.TryGetProperty("liveChatSponsorshipsGiftRedemptionAnnouncementRenderer", out var redeem))
        {
            var author = ExtractAuthor(redeem);
            var text = ParseYouTubeRuns(redeem, "message");
            if (string.IsNullOrWhiteSpace(text)) text = "получил подарочную спонсорскую подписку";
            _emit(new ChatEvent
            {
                platform = "youtube",
                channel = _user,
                author = author,
                text = text,
                kind = "sub",
            });
        }
    }

    private static string ExtractAuthor(JsonElement el)
    {
        if (el.TryGetProperty("authorName", out var an))
        {
            if (an.TryGetProperty("simpleText", out var st)) return st.GetString() ?? "";
            if (an.TryGetProperty("runs", out var r) && r.ValueKind == JsonValueKind.Array && r.GetArrayLength() > 0)
                return r[0].TryGetProperty("text", out var t) ? t.GetString() ?? "" : "";
        }
        return "";
    }

    private static string[] ExtractBadges(JsonElement el)
    {
        var list = new List<string>();
        if (el.TryGetProperty("authorBadges", out var ab))
        {
            var raw = ab.GetRawText();
            if (raw.Contains("moderator", StringComparison.OrdinalIgnoreCase) || raw.Contains("owner", StringComparison.OrdinalIgnoreCase)) list.Add("mod");
            if (raw.Contains("member", StringComparison.OrdinalIgnoreCase)) list.Add("sub");
            if (raw.Contains("verified", StringComparison.OrdinalIgnoreCase)) list.Add("vip");
        }
        return list.ToArray();
    }

    private static (double? amount, string currency) ParseAmountAndCurrency(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (null, "₽");
        var m = Regex.Match(text, @"([\d\s.,]+)");
        double? val = null;
        if (m.Success)
        {
            var numStr = m.Groups[1].Value.Replace(" ", "").Replace(" ", "").Replace(',', '.');
            if (double.TryParse(numStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d))
                val = d;
        }
        var cur = text.Contains('$') ? "$" : text.Contains('€') ? "€" : text.Contains('£') ? "£" : "₽";
        return (val, cur);
    }

    private static string ParseYouTubeRuns(JsonElement parent, string propName)
    {
        if (!parent.TryGetProperty(propName, out var prop)) return "";
        if (prop.TryGetProperty("simpleText", out var st)) return st.GetString() ?? "";
        if (!prop.TryGetProperty("runs", out var runs) || runs.ValueKind != JsonValueKind.Array) return "";

        var sb = new StringBuilder();
        foreach (var r in runs.EnumerateArray())
        {
            if (r.TryGetProperty("text", out var tEl)) { sb.Append(tEl.GetString()); continue; }
            if (!r.TryGetProperty("emoji", out var emo)) continue;

            var isCustom = emo.TryGetProperty("isCustomEmoji", out var ice) && ice.ValueKind == JsonValueKind.True;
            var emojiUrl = "";
            if (Net.TryFind(emo, "thumbnails", out var thumbs) && thumbs.ValueKind == JsonValueKind.Array && thumbs.GetArrayLength() > 0)
                emojiUrl = Net.FindString(thumbs[thumbs.GetArrayLength() - 1], "url") ?? "";

            var shortcut = emo.TryGetProperty("shortcuts", out var sc) && sc.GetArrayLength() > 0
                ? sc[0].GetString() ?? "" : "";
            var emojiId = Net.FindString(emo, "emojiId") ?? "";

            if (isCustom && emojiUrl.Length > 0)
                sb.Append(Net.Emote(emojiUrl, shortcut.Trim(':')));
            else if (!isCustom && emojiId.Length > 0 && emojiId.Length <= 8)
                sb.Append(emojiId);
            else if (emojiUrl.Length > 0)
                sb.Append(Net.Emote(emojiUrl, shortcut.Trim(':')));
            else
                sb.Append(shortcut);
        }
        return sb.ToString();
    }

    private static string? Extract(string src, string from, string to)
    {
        var i = src.IndexOf(from, StringComparison.Ordinal);
        if (i < 0) return null;
        i += from.Length;
        var j = src.IndexOf(to, i, StringComparison.Ordinal);
        return j < 0 ? null : src[i..j];
    }

    /// <summary>
    /// Число зрителей эфира со страницы YouTube. Раньше всегда отправлялся 0,
    /// поэтому счётчик в интерфейсе был пустым.
    /// </summary>
    private static int ParseViewers(string html)
    {
        // строгое машинное поле
        var raw = Extract(html, "\"originalViewCount\":\"", "\"");
        if (int.TryParse(raw, out var exact)) return exact;

        // запасной путь: "1 234 смотрят сейчас" / "1,234 watching now"
        var m = Regex.Match(html, "\"viewCount\":\\{\"runs\":\\[\\{\"text\":\"([\\d\\s,.\\u00a0]+)\"");
        if (!m.Success) m = Regex.Match(html, "([\\d\\s,.\\u00a0]{1,15})\\s*(?:смотр|watching)");
        if (m.Success)
        {
            var digits = Regex.Replace(m.Groups[1].Value, "[^0-9]", "");
            if (int.TryParse(digits, out var v)) return v;
        }
        return 0;
    }

    private static string? ExtractAfter(string src, string marker, string from, string to)
    {
        var k = src.IndexOf(marker, StringComparison.Ordinal);
        return k < 0 ? null : Extract(src[k..], from, to);
    }

    public void Dispose() { }
}

/* ================== DONATIONALERTS (Centrifugo по секретному токену) ================== */

public sealed class DonationAlertsConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly string _token;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;

    public DonationAlertsConnector(string user, string token, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = user;
        _token = token;
        _emit = emit;
        _status = status;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_token))
            throw new InvalidOperationException(
                "DonationAlerts: вставьте токен из ссылки виджета алертов (Алерты → ссылка ...token=XXXX)");
        _status("connecting", 0);

        // токен вставляют по-разному: с префиксом, ссылкой или как есть
        var token = _token.Trim();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) token = token[7..].Trim();
        var fromUrl = Regex.Match(token, @"token=([A-Za-z0-9_\-]+)");
        if (fromUrl.Success) token = fromUrl.Groups[1].Value;

        // КОРОТКИЙ токен = токен виджета алертов (его вставляет большинство
        // пользователей: он есть в ссылке виджета и не требует OAuth-приложения).
        // Такой токен работает по socket.io, а не по Centrifugo/OAuth.
        if (token.Length < 100)
        {
            await RunWidgetSocketAsync(token, ct);
            return;
        }

        using var http = Net.Http();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Диагностика вместо «молча не подключается»: показываем реальный код ответа.
        var userHttp = await http.GetAsync("https://www.donationalerts.com/api/v1/user/oauth", ct);
        var userResp = await userHttp.Content.ReadAsStringAsync(ct);
        if (!userHttp.IsSuccessStatusCode)
            throw new InvalidOperationException(userHttp.StatusCode switch
            {
                System.Net.HttpStatusCode.Unauthorized =>
                    "DonationAlerts: токен недействителен или истёк. Нужен OAuth access token со scope oauth-user-show и oauth-donation-subscribe",
                System.Net.HttpStatusCode.Forbidden =>
                    "DonationAlerts: у токена нет прав oauth-user-show / oauth-donation-subscribe",
                _ => $"DonationAlerts: API ответил {(int)userHttp.StatusCode}",
            });

        using var userDoc = JsonDocument.Parse(userResp);
        if (!userDoc.RootElement.TryGetProperty("data", out var data))
            throw new InvalidOperationException("DonationAlerts: неожиданный ответ API (нет data)");
        var uid = data.TryGetProperty("id", out var idEl) && idEl.TryGetInt64(out var idVal)
            ? idVal.ToString()
            : throw new InvalidOperationException("DonationAlerts: API не вернул id пользователя");
        var socketToken = data.TryGetProperty("socket_connection_token", out var sct) ? sct.GetString() ?? "" : "";
        if (socketToken.Length == 0)
            throw new InvalidOperationException("DonationAlerts: нет socket_connection_token — добавьте scope oauth-donation-subscribe");

        _ws = new ClientWebSocket();
        await _ws.ConnectAsync(new Uri("wss://centrifugo.donationalerts.com/connection/websocket"), ct);
        // Команда connect по документации DA: params + id, БЕЗ method
        // (method=1 — это subscribe, из-за чего рукопожатие не проходило).
        await Net.WsSend(_ws, JsonSerializer.Serialize(new { @params = new { token = socketToken }, id = 1 }), ct);

        string? clientId = null;
        var handshake = await Net.WsRecv(_ws, ct) ?? throw new InvalidOperationException("DonationAlerts: нет ответа");
        using (var hs = JsonDocument.Parse(handshake))
            if (hs.RootElement.TryGetProperty("result", out var res) && res.TryGetProperty("client", out var cl))
                clientId = cl.GetString();
        if (string.IsNullOrEmpty(clientId)) throw new InvalidOperationException("DonationAlerts: client id не получен");

        var channelName = $"$alerts:donation_{uid}";
        var subBody = JsonSerializer.Serialize(new { channels = new[] { channelName }, client = clientId });
        using var subContent = new StringContent(subBody, Encoding.UTF8, "application/json");
        var subResp = await http.PostAsync("https://www.donationalerts.com/api/v1/centrifuge/subscribe", subContent, ct);
        var subText = await subResp.Content.ReadAsStringAsync(ct);
        if (!subResp.IsSuccessStatusCode)
            throw new InvalidOperationException($"DonationAlerts: подписка отклонена ({(int)subResp.StatusCode}) {subText}");

        // Полученный channel token обязателен: без него Centrifugo не отдаёт события.
        try
        {
            using var subDoc = JsonDocument.Parse(subText);
            if (subDoc.RootElement.TryGetProperty("channels", out var chArr) && chArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var ch in chArr.EnumerateArray())
                {
                    var name = Net.FindString(ch, "channel") ?? channelName;
                    var chToken = Net.FindString(ch, "token") ?? "";
                    if (chToken.Length == 0) continue;
                    await Net.WsSend(_ws, JsonSerializer.Serialize(new
                    {
                        @params = new { channel = name, token = chToken },
                        method = 1,
                        id = 2,
                    }), ct);
                }
            }
        }
        catch (InvalidOperationException) { throw; }
        catch { /* формат ответа изменился — событий ждём по общему каналу */ }

        _status("connected", 0);

        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try { await Net.WsSend(_ws!, "{\"method\":7,\"id\":7}", ct); } catch { return; }
                try { await Task.Delay(25000, ct); } catch { return; }
            }
        }, CancellationToken.None);

        while (!ct.IsCancellationRequested)
        {
            var text = await Net.WsRecv(_ws, ct);
            if (text == null) throw new InvalidOperationException("DonationAlerts: соединение закрыто");

            // Строгий разбор Centrifugo вместо поиска подстроки "username":
            // раньше одно и то же событие попадало в ленту несколько раз
            // (данные дублируются в разных полях кадра).
            try
            {
                using var doc = JsonDocument.Parse(text);
                if (!Net.TryFind(doc.RootElement, "data", out var payloadEl)) continue;
                // тело алерта может лежать глубже: result.data.data
                var body = Net.TryFind(payloadEl, "data", out var innerEl) ? innerEl : payloadEl;
                if (body.ValueKind == JsonValueKind.String)
                {
                    using var parsed = JsonDocument.Parse(body.GetString() ?? "{}");
                    EmitDonation(parsed.RootElement);
                }
                else EmitDonation(body);
            }
            catch (JsonException) { /* служебный кадр */ }
        }
    }

    /// <summary>
    /// Подключение по токену виджета алертов (socket.io / Engine.IO v3).
    /// Это «народный» путь DonationAlerts: токен виден прямо в ссылке виджета,
    /// OAuth-приложение регистрировать не нужно.
    /// </summary>
    private async Task RunWidgetSocketAsync(string widgetToken, CancellationToken ct)
    {
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Origin", "https://www.donationalerts.com");
        _ws.Options.SetRequestHeader("User-Agent", Net.UA);
        await _ws.ConnectAsync(
            new Uri("wss://socket.donationalerts.com/socket.io/?EIO=3&transport=websocket"), ct);

        // Engine.IO ping, чтобы сервер не разорвал соединение
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try { await Net.WsSend(_ws!, "2", ct); } catch { return; }
                try { await Task.Delay(20000, ct); } catch { return; }
            }
        }, CancellationToken.None);

        bool registered = false;
        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("DonationAlerts: соединение закрыто");
            if (frame.Length == 0) continue;

            // служебные пакеты Engine.IO
            if (frame == "2") { await Net.WsSend(_ws, "3", ct); continue; }
            if (frame == "3") continue;

            if (frame[0] == '0')
            {
                // handshake получен — входим в неймспейс
                await Net.WsSend(_ws, "40", ct);
                continue;
            }

            if (frame.StartsWith("40", StringComparison.Ordinal) && !registered)
            {
                registered = true;
                var hello = JsonSerializer.Serialize(new { token = widgetToken, type = "alert_widget" });
                await Net.WsSend(_ws, $"42[\"add-user\",{hello}]", ct);
                _status("connected", 0);
                continue;
            }

            if (!frame.StartsWith("42", StringComparison.Ordinal)) continue;

            // 42["donation",{...}]
            var payload = frame[2..];
            try
            {
                using var doc = JsonDocument.Parse(payload);
                if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() < 2) continue;
                var name = doc.RootElement[0].GetString() ?? "";
                if (!name.Contains("donation", StringComparison.OrdinalIgnoreCase)) continue;

                var d = doc.RootElement[1];
                // тело иногда приходит строкой с JSON внутри
                if (d.ValueKind == JsonValueKind.String)
                {
                    using var inner = JsonDocument.Parse(d.GetString() ?? "{}");
                    EmitDonation(inner.RootElement);
                }
                else EmitDonation(d);
            }
            catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[da parse] {ex.Message}"); }
        }
    }

    /// ID уже показанных донатов: страховка от повторной доставки одного
    /// события (Centrifugo может прислать его в нескольких кадрах).
    private readonly HashSet<string> _seenDonations = new();

    private void EmitDonation(JsonElement d)
    {
        // Пропускаем всё, что не является алертом доната
        var alertType = Net.FindString(d, "alert_type") ?? "";
        if (alertType.Length > 0 && alertType != "1" && !alertType.Contains("donation", StringComparison.OrdinalIgnoreCase))
            return;

        var id = Net.FindString(d, "id") ?? "";
        if (id.Length == 0 && Net.TryFind(d, "id", out var idEl) && idEl.ValueKind == JsonValueKind.Number)
            id = idEl.GetRawText();
        if (id.Length > 0)
        {
            lock (_seenDonations)
            {
                if (!_seenDonations.Add(id)) return;      // дубликат — игнорируем
                if (_seenDonations.Count > 500) _seenDonations.Clear();
            }
        }

        var user = Net.FindString(d, "username") ?? Net.FindString(d, "name") ?? "Аноним";
        var message = Net.FindString(d, "message") ?? "";
        var currency = Net.FindString(d, "currency") ?? "RUB";
        double? amount = null;
        if (Net.TryFind(d, "amount", out var am))
        {
            if (am.ValueKind == JsonValueKind.Number && am.TryGetDouble(out var a)) amount = a;
            else if (am.ValueKind == JsonValueKind.String &&
                     double.TryParse(am.GetString()?.Replace(',', '.'),
                         System.Globalization.NumberStyles.Any,
                         System.Globalization.CultureInfo.InvariantCulture, out var a2)) amount = a2;
        }

        _emit(new ChatEvent
        {
            platform = "donationalerts",
            channel = _user,
            author = user,
            text = Net.StripHtml(message),
            kind = "donate",
            amount = amount,
            currency = currency == "USD" ? "$" : currency == "EUR" ? "€" : "₽",
        });
    }

    public void Dispose() { try { _ws?.Abort(); } catch { } }
}

/* ============ TIKTOK LIVE (webcast chat fetch — экспериментально) ============ */

public sealed class TikTokConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private readonly string _cookie;

    public TikTokConnector(string user, Action<ChatEvent> emit, Action<string, int> status, string cookie = "")
    {
        _user = user.Trim().TrimStart('@');
        _emit = emit;
        _status = status;
        _cookie = cookie.Trim();
    }

    /// <summary>
    /// Клиент с cookie-контейнером. TikTok отдаёт чат только «узнаваемому»
    /// браузеру: без cookies (минимум ttwid) webcast возвращает ПУСТОЙ ответ,
    /// из-за чего подключение выглядело успешным, а сообщений не было.
    /// Сначала открываем страницу эфира — TikTok сам выдаёт нужные cookies.
    /// </summary>
    private async Task<HttpClient> CreateClientAsync(CancellationToken ct)
    {
        var handler = new HttpClientHandler { CookieContainer = new CookieContainer(), UseCookies = true };
        var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(20) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
        http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8");
        http.DefaultRequestHeaders.TryAddWithoutValidation("Origin", "https://www.tiktok.com");
        http.DefaultRequestHeaders.Referrer = new Uri($"https://www.tiktok.com/@{_user}/live");

        // cookie пользователя (если указан при добавлении канала) — самый надёжный путь
        if (_cookie.Length > 0)
            http.DefaultRequestHeaders.TryAddWithoutValidation("Cookie", _cookie);
        else
        {
            // иначе получаем гостевые cookies, открыв страницу эфира
            try { await http.GetStringAsync($"https://www.tiktok.com/@{_user}/live", ct); }
            catch { /* страница может не открыться — попробуем без cookies */ }
        }
        return http;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        // ОСНОВНОЙ путь — проверенный модуль tiktok-live-connector (Node-мост).
        // Реально протестирован на живом эфире: чат, подарки, подписки, входы,
        // зрители и эмодзи. Не требует cookies, логина и браузера.
        var nodeReader = ConnectorManager.TikTokNodeReader;
        if (nodeReader != null)
        {
            var live = false;
            var lastViewers = 0;
            await nodeReader(
                _user,
                (author, text) =>
                {
                    if (!live) { live = true; _status("online", lastViewers); }
                    _emit(new ChatEvent
                    {
                        platform = "tiktok",
                        channel = _user,
                        author = author,
                        text = text,
                        kind = "chat",
                    });
                },
                (isLive, viewers) =>
                {
                    live = isLive;
                    if (viewers >= 0) lastViewers = viewers;
                    _status(isLive ? "online" : "connected", isLive ? lastViewers : 0);
                },
                ct);
            return;
        }

        // Запасной путь — нативный Webcast WebSocket (без Node.js).
        var ws = new TikTokLiveWs(_user, _emit, _status);
        try { await ws.RunAsync(ct); return; }
        catch (OperationCanceledException) { ws.Dispose(); return; }
        catch
        {
            ws.Dispose();
            _status("connected", 0);
            throw;
        }
    }

    /// Запасной путь: скрытое окно WebView2 со страницей эфира.
    private async Task RunWebView2Async(CancellationToken ct)
    {
        string roomId = "";
        try
        {
            using var probe = Net.Http();
            probe.DefaultRequestHeaders.Referrer = new Uri($"https://www.tiktok.com/@{_user}/live");
            var api = await probe.GetStringAsync(
                $"https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId={Uri.EscapeDataString(_user)}", ct);
            using var doc = JsonDocument.Parse(api);
            roomId = Net.FindString(doc.RootElement, "roomId") ?? "";
            if (roomId.Length == 0 && Net.TryFind(doc.RootElement, "roomId", out var rid) && rid.ValueKind == JsonValueKind.Number)
                roomId = rid.GetRawText();
        }
        catch { /* пропускаем roomId — fallback просто не сработает */ }

        if (roomId.Length == 0) return;

        // Эфир найден — только теперь запускаем скрытый WebView2-ридер.
        var reader = ConnectorManager.TikTokReader;
        if (reader != null)
        {
            var live = false;
            var lastViewers = 0;
            await reader(
                _user,
                (author, text) =>
                {
                    if (!live) { live = true; _status("online", lastViewers); }
                    _emit(new ChatEvent
                    {
                        platform = "tiktok",
                        channel = _user,
                        author = author,
                        text = text,
                        kind = "chat",
                    });
                },
                (isLive, count) =>
                {
                    live = isLive;
                    if (count >= 0) lastViewers = count;
                    _status(isLive ? "online" : "connected", isLive ? lastViewers : 0);
                },
                ct);
            return;
        }

        // Запасной бинарный webcast-путь для окружений без WebView2.
        using var http = await CreateClientAsync(ct);

        var cursor = "";
        var fails = 0;
        // Первая выдача содержит историю чата — показываем только новое.
        var skipHistory = true;
        var emptyStreak = 0;
        var warned = false;

        while (!ct.IsCancellationRequested)
        {
            byte[] payload;
            try
            {
                // ВАЖНО: webcast/im/fetch отдаёт PROTOBUF, а не JSON —
                // прежний разбор через JsonDocument всегда падал, поэтому
                // сообщения не появлялись вовсе. Читаем бинарный ответ.
                var url =
                    "https://webcast.tiktok.com/webcast/im/fetch/?aid=1988&app_language=ru-RU" +
                    "&app_name=tiktok_web&browser_language=ru&browser_name=Mozilla&browser_online=true" +
                    "&browser_platform=Win32&browser_version=5.0&cookie_enabled=true&device_platform=web" +
                    "&identity=audience&sourceType=54&version_code=180800" +
                    $"&room_id={roomId}&cursor={Uri.EscapeDataString(cursor)}";
                payload = await http.GetByteArrayAsync(url, ct);
            }
            catch
            {
                // Обрыв связи — не роняем коннектор: ждём и пробуем снова,
                // а после серии неудач переоткрываем эфир с нуля.
                if (++fails > 6) throw new InvalidOperationException("TikTok: чат недоступен, переподключаемся");
                try { await Task.Delay(Math.Min(15000, 2000 * fails), ct); } catch { return; }
                continue;
            }
            fails = 0;

            if (payload.Length == 0)
            {
                // сообщений пока нет — обычная ситуация между опросами
                if (++emptyStreak == 40 && !warned)
                {
                    warned = true;
                    _emit(new ChatEvent
                    {
                        platform = "tiktok",
                        channel = _user,
                        kind = "system",
                        text = "TikTok: эфир идёт, но чат пока не отдаётся — повторяем попытки.",
                    });
                }
                try { await Task.Delay(1500, ct); } catch { return; }
                continue;
            }
            emptyStreak = 0;

            var isHistory = skipHistory;
            skipHistory = false;

            try
            {
                var response = TikTokProto.ParseResponse(payload);
                if (!string.IsNullOrEmpty(response.Cursor)) cursor = response.Cursor;

                if (!isHistory)
                    foreach (var (author, text) in response.Messages)
                    {
                        if (text.Length == 0) continue;
                        _emit(new ChatEvent
                        {
                            platform = "tiktok",
                            channel = _user,
                            author = author,
                            text = text,
                            kind = "chat",
                        });
                    }

                // сервер сам подсказывает период опроса
                var wait = response.FetchIntervalMs > 0 ? Math.Clamp(response.FetchIntervalMs, 800, 5000) : 1500;
                try { await Task.Delay(wait, ct); } catch { return; }
            }
            catch
            {
                try { await Task.Delay(2000, ct); } catch { return; }
            }
        }
    }

    public void Dispose() { }
}

/* ============ Минимальный protobuf-ридер для TikTok Webcast ============ */

/// <summary>
/// TikTok отдаёт чат в protobuf (WebcastResponse), а не в JSON.
/// Полная схема не нужна: читаем wire-формат и достаём только то, что важно —
/// метод сообщения, ник автора и текст. Такой разбор устойчив к добавлению
/// новых полей в схему.
/// </summary>
internal static class TikTokProto
{
    public sealed record Response(List<(string Author, string Text)> Messages, string Cursor, int FetchIntervalMs);

    public static Response ParseResponse(byte[] data)
    {
        var messages = new List<(string, string)>();
        var cursor = "";
        var interval = 0;

        foreach (var (field, bytes, varint) in Fields(data))
        {
            switch (field)
            {
                case 1 when bytes != null:      // repeated Message messages
                {
                    var (method, payload) = ParseMessage(bytes);
                    if (method == "WebcastChatMessage" && payload != null)
                    {
                        var chat = ParseChat(payload);
                        if (!string.IsNullOrEmpty(chat.Text)) messages.Add(chat);
                    }
                    break;
                }
                case 2 when bytes != null:      // string cursor
                    cursor = Text(bytes);
                    break;
                case 3:                         // int fetchInterval
                    interval = (int)varint;
                    break;
            }
        }
        return new Response(messages, cursor, interval);
    }

    /// Message: 1 = method (string), 2 = payload (bytes)
    private static (string Method, byte[]? Payload) ParseMessage(byte[] data)
    {
        string method = "";
        byte[]? payload = null;
        foreach (var (field, bytes, _) in Fields(data))
        {
            if (field == 1 && bytes != null) method = Text(bytes);
            else if (field == 2 && bytes != null) payload = bytes;
        }
        return (method, payload);
    }

    /// WebcastChatMessage: 2 = User, 3 = content (string)
    private static (string Author, string Text) ParseChat(byte[] data)
    {
        var author = "";
        var text = "";
        foreach (var (field, bytes, _) in Fields(data))
        {
            if (field == 2 && bytes != null) author = ParseUser(bytes);
            else if (field == 3 && bytes != null) text = Text(bytes);
        }
        return (author, text);
    }

    /// User: 2 = uniqueId, 3 = nickname (берём то, что заполнено)
    private static string ParseUser(byte[] data)
    {
        var nickname = "";
        var uniqueId = "";
        foreach (var (field, bytes, _) in Fields(data))
        {
            if (field == 3 && bytes != null) nickname = Text(bytes);
            else if (field == 2 && bytes != null) uniqueId = Text(bytes);
        }
        return nickname.Length > 0 ? nickname : uniqueId;
    }

    private static string Text(byte[] bytes)
    {
        try { return Encoding.UTF8.GetString(bytes).Trim(); }
        catch { return ""; }
    }

    /// Перебор полей protobuf: (номер поля, данные для length-delimited, varint)
    private static IEnumerable<(int Field, byte[]? Bytes, ulong Varint)> Fields(byte[] data)
    {
        int i = 0;
        while (i < data.Length)
        {
            if (!TryVarint(data, ref i, out var key)) yield break;
            var field = (int)(key >> 3);
            var wire = (int)(key & 7);

            switch (wire)
            {
                case 0:
                    if (!TryVarint(data, ref i, out var v)) yield break;
                    yield return (field, null, v);
                    break;
                case 1:
                    if (i + 8 > data.Length) yield break;
                    i += 8;
                    yield return (field, null, 0);
                    break;
                case 2:
                {
                    if (!TryVarint(data, ref i, out var len)) yield break;
                    var size = (int)len;
                    if (size < 0 || i + size > data.Length) yield break;
                    var chunk = new byte[size];
                    Array.Copy(data, i, chunk, 0, size);
                    i += size;
                    yield return (field, chunk, 0);
                    break;
                }
                case 5:
                    if (i + 4 > data.Length) yield break;
                    i += 4;
                    yield return (field, null, 0);
                    break;
                default:
                    yield break;   // неизвестный тип — дальше читать небезопасно
            }
        }
    }

    private static bool TryVarint(byte[] data, ref int i, out ulong value)
    {
        value = 0;
        var shift = 0;
        while (i < data.Length && shift <= 63)
        {
            var b = data[i++];
            value |= (ulong)(b & 0x7F) << shift;
            if ((b & 0x80) == 0) return true;
            shift += 7;
        }
        return false;
    }
}
