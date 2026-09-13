using System.IO.Compression;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace YawaChatHub;

/// <summary>
/// Нативный коннектор TikTok LIVE по протоколу Webcast (WebSocket + protobuf).
///
/// Реализует тот же механизм, что и популярные неофициальные библиотеки
/// (tiktok-live-connector / piratetok-live): анонимно получает cookie ttwid,
/// напрямую открывает WSS-соединение с сервером TikTok, посылает protobuf
/// heartbeat каждые 10 секунд и разбирает поток событий.
///
/// Преимущества перед скрытым окном WebView2:
///   • никакого Chromium — единицы мегабайт вместо сотни;
///   • нет DOM-скрейпинга — события приходят из protobuf-потока;
///   • не требует cookies, логина и сторонних подписных серверов.
/// </summary>
public sealed class TikTokLiveWs : IDisposable
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;

    private const string WsHost = "webcast-ws.tiktok.com";
    private const string LiveUrl = "https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=";

    public TikTokLiveWs(string user, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = user.Trim().TrimStart('@');
        _emit = emit;
        _status = status;
    }

    /* ================= protobuf-энкодер ================= */

    private static void Varint(List<byte> buf, ulong value)
    {
        while (value >= 0x80)
        {
            buf.Add((byte)(value | 0x80));
            value >>= 7;
        }
        buf.Add((byte)value);
    }

    /// Поле с типом 2 (строка/байты/вложенное сообщение)
    private static void Tag2(List<byte> buf, int field, byte[] payload)
    {
        Varint(buf, (ulong)((field << 3) | 2));
        Varint(buf, (ulong)payload.Length);
        buf.AddRange(payload);
    }

    private static void Str2(List<byte> buf, int field, string value) =>
        Tag2(buf, field, Encoding.UTF8.GetBytes(value));

    /// Поле с типом 0 (varint)
    private static void Tag0(List<byte> buf, int field, ulong value)
    {
        Varint(buf, (ulong)((field << 3) | 0));
        Varint(buf, value);
    }

    /// WebcastPushFrame { payloadEncoding, payloadType, payload, logId }
    private static byte[] Frame(string type, byte[] payload, ulong logId = 0)
    {
        var f = new List<byte>();
        Str2(f, 6, "pb");          // payloadEncoding
        Str2(f, 7, type);          // payloadType
        Tag2(f, 8, payload);       // payload
        if (logId != 0) Tag0(f, 2, logId);   // logId (для ack)
        return f.ToArray();
    }

    private static byte[] Heartbeat(string roomId)
    {
        var hb = new List<byte>();
        Tag0(hb, 1, ulong.Parse(roomId));
        return Frame("hb", hb.ToArray());
    }

    private static byte[] EnterRoom(string roomId)
    {
        var m = new List<byte>();
        Tag0(m, 1, ulong.Parse(roomId));    // roomId
        Tag0(m, 4, 12);                      // liveId
        Str2(m, 5, "audience");             // identity
        Str2(m, 9, "0");                     // filterWelcomeMsg
        return Frame("im_enter_room", m.ToArray());
    }

    private static byte[] Ack(ulong logId, byte[] internalExt) =>
        Frame("ack", internalExt, logId);

    /* ================= protobuf-чтение ================= */

    /// Перебор полей протобуфа (без строгой схемы — только wire-формат).
    private static IEnumerable<(int Field, int Wire, byte[] Data, ulong Varint)> Fields(byte[] data)
    {
        int i = 0;
        while (i < data.Length)
        {
            // ключ
            ulong key = 0; int shift = 0;
            while (i < data.Length && shift <= 63)
            {
                var b = data[i++];
                key |= (ulong)(b & 0x7F) << shift;
                if ((b & 0x80) == 0) break;
                shift += 7;
            }
            int field = (int)(key >> 3);
            int wire = (int)(key & 7);

            if (wire == 0)
            {
                ulong v = 0; shift = 0;
                while (i < data.Length && shift <= 63)
                {
                    var b = data[i++];
                    v |= (ulong)(b & 0x7F) << shift;
                    if ((b & 0x80) == 0) break;
                    shift += 7;
                }
                yield return (field, wire, Array.Empty<byte>(), v);
            }
            else if (wire == 2)
            {
                ulong len = 0; shift = 0;
                while (i < data.Length && shift <= 63)
                {
                    var b = data[i++];
                    len |= (ulong)(b & 0x7F) << shift;
                    if ((b & 0x80) == 0) break;
                    shift += 7;
                }
                int size = (int)len;
                if (size < 0 || i + size > data.Length) yield break;
                var chunk = new byte[size];
                Array.Copy(data, i, chunk, 0, size);
                i += size;
                yield return (field, wire, chunk, 0);
            }
            else if (wire == 1) { i += 8; yield return (field, wire, Array.Empty<byte>(), 0); }
            else if (wire == 5) { i += 4; yield return (field, wire, Array.Empty<byte>(), 0); }
            else yield break;
        }
    }

    private static string PStr(byte[] msg, int field)
    {
        foreach (var f in Fields(msg))
            if (f.Field == field && f.Wire == 2)
                return Encoding.UTF8.GetString(f.Data);
        return "";
    }

    private static byte[] PBytes(byte[] msg, int field)
    {
        foreach (var f in Fields(msg))
            if (f.Field == field && f.Wire == 2)
                return f.Data;
        return Array.Empty<byte>();
    }

    private static long PLong(byte[] msg, int field)
    {
        foreach (var f in Fields(msg))
            if (f.Field == field && f.Wire == 0)
                return (long)f.Varint;
        return 0;
    }

    private static byte[] Gunzip(byte[] data)
    {
        if (data.Length < 2 || data[0] != 0x1f || data[1] != 0x8b) return data;
        using var input = new MemoryStream(data);
        using var gzip = new GZipStream(input, CompressionMode.Decompress);
        using var output = new MemoryStream();
        gzip.CopyTo(output);
        return output.ToArray();
    }

    /* ================= подключение ================= */

    private static string FetchTtwid()
    {
        // AllowAutoRedirect есть у HttpClientHandler, а не у HttpClient —
        // иначе редирект tiktok.com → tiktok.com/ru/ проглатывает Set-Cookie.
        using var handler = new HttpClientHandler { AllowAutoRedirect = false };
        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
        var response = http.GetAsync("https://www.tiktok.com/").GetAwaiter().GetResult();
        var cookies = response.Headers.GetValues("Set-Cookie") ?? Array.Empty<string>();
        foreach (var c in cookies)
        {
            var m = System.Text.RegularExpressions.Regex.Match(c, @"ttwid=([^;]+)");
            if (m.Success) return m.Groups[1].Value;
        }
        return "";
    }

    private static (string roomId, int viewers) ResolveRoom(string user)
    {
        var http = Net.Http();
        http.DefaultRequestHeaders.Referrer = new Uri($"https://www.tiktok.com/@{user}/live");
        var json = http.GetStringAsync(LiveUrl + Uri.EscapeDataString(user)).GetAwaiter().GetResult();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var roomId = Net.FindString(root, "roomId") ?? "";
        if (roomId.Length == 0 && Net.TryFind(root, "roomId", out var rid) && rid.ValueKind == JsonValueKind.Number)
            roomId = rid.GetRawText();
        return (roomId, Net.FindInt(root, "userCount"));
    }

    private static string BuildUrl(string roomId)
    {
        var q = new StringBuilder();
        void P(string k, string v) => q.Append(q.Length == 0 ? '?' : '&').Append(k).Append('=').Append(Uri.EscapeDataString(v));
        P("version_code", "180800");
        P("device_platform", "web");
        P("cookie_enabled", "true");
        P("screen_width", "1920");
        P("screen_height", "1080");
        P("browser_language", "ru-RU");
        P("browser_platform", "Win32");
        P("browser_name", "Mozilla");
        P("browser_version", "5.0");
        P("browser_online", "true");
        P("tz_name", "Europe/Moscow");
        P("app_name", "tiktok_web");
        P("sup_ws_ds_opt", "1");
        P("update_version_code", "2.0.0");
        P("compress", "gzip");
        P("webcast_language", "ru");
        P("ws_direct", "1");
        P("aid", "1988");
        P("live_id", "12");
        P("app_language", "ru");
        P("client_enter", "1");
        P("room_id", roomId);
        P("identity", "audience");
        P("history_comment_count", "6");
        P("last_rtt", (100 + Random.Shared.Next(0, 100)).ToString());
        P("heartbeat_duration", "10000");
        P("resp_content_type", "protobuf");
        P("did_rule", "3");
        return $"wss://{WsHost}/webcast/im/ws_proxy/ws_reuse_supplement/{q}";
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        var (roomId, viewers) = ResolveRoom(_user);
        if (roomId.Length == 0) { _status("error", 0); return; }
        var ttwid = FetchTtwid();
        _status("online", viewers);

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromHours(2));   // переподключение по истечении сессии

        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("User-Agent", Net.UA);
        _ws.Options.SetRequestHeader("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8");
        if (ttwid.Length > 0) _ws.Options.SetRequestHeader("Cookie", $"ttwid={ttwid}");
        await _ws.ConnectAsync(new Uri(BuildUrl(roomId)), cts.Token);

        // входим в комнату
        await _ws.SendAsync(EnterRoom(roomId), WebSocketMessageType.Binary, true, cts.Token);

        // heartbeat каждые 10 секунд — без него сервер закрывает соединение
        _ = Task.Run(async () =>
        {
            while (!cts.IsCancellationRequested && _ws.State == WebSocketState.Open)
            {
                try { await Task.Delay(10000, cts.Token); }
                catch { return; }
                try { await _ws.SendAsync(Heartbeat(roomId), WebSocketMessageType.Binary, true, cts.Token); }
                catch { return; }
            }
        }, CancellationToken.None);

        // опрос зрителей — из того же API, что и при подключении
        _ = Task.Run(async () =>
        {
            using var http = Net.Http();
            http.DefaultRequestHeaders.Referrer = new Uri($"https://www.tiktok.com/@{_user}/live");
            while (!cts.IsCancellationRequested)
            {
                try { await Task.Delay(30000, cts.Token); } catch { return; }
                try
                {
                    var j = await http.GetStringAsync(LiveUrl + Uri.EscapeDataString(_user), cts.Token);
                    using var d = JsonDocument.Parse(j);
                    var v = Net.FindInt(d.RootElement, "userCount");
                    _status("online", v);
                }
                catch { }
            }
        }, CancellationToken.None);

        // приём потока событий
        var buffer = new byte[1 << 18];
        while (!cts.IsCancellationRequested && _ws.State == WebSocketState.Open)
        {
            WebSocketReceiveResult result;
            using var frame = new MemoryStream();
            do
            {
                result = await _ws.ReceiveAsync(buffer, cts.Token);
                if (result.MessageType == WebSocketMessageType.Close)
                    throw new InvalidOperationException("TikTok закрыл соединение");
                frame.Write(buffer, 0, result.Count);
            }
            while (!result.EndOfMessage);

            var raw = frame.ToArray();
            try { HandleFrame(raw, roomId, cts.Token); }
            catch { /* битый кадр — пропускаем */ }
        }
    }

    /// Разбор WebcastPushFrame → WebcastResponse → события.
    private void HandleFrame(byte[] raw, string roomId, CancellationToken ct)
    {
        // PushFrame: 2=logId, 7=payloadType, 8=payload
        byte[] payload = Array.Empty<byte>();
        ulong logId = 0;
        string pushType = "";
        foreach (var f in Fields(raw))
        {
            if (f.Field == 2 && f.Wire == 0) logId = f.Varint;
            else if (f.Field == 7 && f.Wire == 2) pushType = Encoding.UTF8.GetString(f.Data);
            else if (f.Field == 8 && f.Wire == 2) payload = f.Data;
        }
        if (payload.Length == 0) return;
        if (pushType != "im") return;   // ответы heartbeat игнорируем

        var response = Gunzip(payload);

        // WebcastResponse: 1=messages, 5=internalExt, 9=needsAck
        byte[] internalExt = Array.Empty<byte>();
        var ackNeeded = false;
        var messages = new List<byte[]>();
        foreach (var f in Fields(response))
        {
            if (f.Field == 1 && f.Wire == 2) messages.Add(f.Data);
            else if (f.Field == 5 && f.Wire == 2) internalExt = f.Data;
            else if (f.Field == 9 && f.Wire == 0) ackNeeded = f.Varint != 0;
        }

        if (ackNeeded && _ws is { State: WebSocketState.Open })
            _ = _ws.SendAsync(Ack(logId, internalExt), WebSocketMessageType.Binary, true, ct);

        foreach (var message in messages)
            HandleMessage(message);
    }

    /// ResponseMessage: 1=method, 2=payload → разбор по типу события.
    private void HandleMessage(byte[] message)
    {
        var method = PStr(message, 1);
        var payload = PBytes(message, 2);
        if (payload.Length == 0) return;

        switch (method)
        {
            case "WebcastChatMessage":
            {
                // 2=user, 3=content; User: 3=nickname, 38=uniqueId
                var user = PBytes(payload, 2);
                var nick = PStr(user, 3);
                if (nick.Length == 0) nick = PStr(user, 38);
                var text = PStr(payload, 3);
                if (text.Length == 0) return;
                _emit(new ChatEvent
                {
                    platform = "tiktok", channel = _user,
                    author = nick, text = text, kind = "chat",
                });
                break;
            }
            case "WebcastGiftMessage":
            {
                // 5=repeatCount, 7=user, 15=gift; GiftStruct: 12=diamondCount, 16=name
                var user = PBytes(payload, 7);
                var nick = PStr(user, 3);
                if (nick.Length == 0) nick = PStr(user, 38);
                var gift = PBytes(payload, 15);
                var name = PStr(gift, 16);
                var diamonds = PLong(gift, 12);
                var repeat = PLong(payload, 5);
                if (repeat > 1) name = $"{name} ×{repeat}";
                _emit(new ChatEvent
                {
                    platform = "tiktok", channel = _user,
                    author = nick,
                    text = $"отправил подарок «{name}»",
                    kind = "donate",
                    amount = diamonds > 0 ? diamonds : null,
                });
                break;
            }
            case "WebcastSocialMessage":
            {
                // 2=user, 3=shareType, 4=action
                var user = PBytes(payload, 2);
                var nick = PStr(user, 3);
                if (nick.Length == 0) nick = PStr(user, 38);
                var shareType = PLong(payload, 3);
                _emit(new ChatEvent
                {
                    platform = "tiktok", channel = _user,
                    author = nick,
                    text = shareType == 1 ? "поделился трансляцией" : "подписался на канал",
                    kind = "sub",
                });
                break;
            }
            case "WebcastMemberMessage":
            {
                var user = PBytes(payload, 2);
                var nick = PStr(user, 3);
                if (nick.Length == 0) nick = PStr(user, 38);
                _emit(new ChatEvent
                {
                    platform = "tiktok", channel = _user,
                    author = nick, text = "зашёл в эфир", kind = "chat",
                });
                break;
            }
        }
    }

    public void Dispose()
    {
        try { _ws?.Abort(); } catch { }
        try { _ws?.Dispose(); } catch { }
    }
}
