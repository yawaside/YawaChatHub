using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace YawaChatHub;

/// <summary>
/// DonatePay — площадка донатов.
///
/// ВАЖНО: площадка работает по API-ключу из личного кабинета
/// (donatepay.ru → «API»), а НЕ по токену виджета алертов, как DonationAlerts.
/// Токен виджета здесь не подходит — сервер отвечает «Incorrect token».
///
/// Порядок подключения (проверен по рабочему клиенту площадки):
///   1. POST /api/v2/socket/token с API-ключом → JWT-токен сокета;
///      номер аккаунта берём прямо из этого токена (поле sub) — отдельный
///      запрос профиля не нужен;
///   2. подключение к wss://centrifugo.donatepay.ru/connection/websocket
///      и авторизация полученным токеном → сервер выдаёт client id;
///   3. канал донатов приватный, поэтому на него нужен ОТДЕЛЬНЫЙ токен
///      подписки: POST /api/v2/socket/token?access_token=… с client id;
///   4. подписка на «$public:номер» — в неё приходят донаты.
/// </summary>
public sealed class DonatePayConnector : IPlatformConnector
{
    private const string SocketTokenUrl = "https://donatepay.ru/api/v2/socket/token";
    private const string WsUrl = "wss://centrifugo.donatepay.ru/connection/websocket";

    private readonly string _apiKey;
    private readonly string _currency;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;

    /// Показанные донаты: площадка повторяет последние события при
    /// переподключении, дубли в ленте не нужны.
    private readonly HashSet<string> _seen = new(StringComparer.Ordinal);
    private readonly Queue<string> _seenOrder = new();

    public DonatePayConnector(string currency, string apiKey,
        Action<ChatEvent> emit, Action<string, int> status)
    {
        _currency = string.IsNullOrWhiteSpace(currency) ? "₽" : currency;
        _apiKey = CleanKey(apiKey);
        _emit = emit;
        _status = status;
    }

    /// Ключ вставляют как есть или строкой со страницы — убираем лишнее.
    private static string CleanKey(string? raw)
    {
        var key = (raw ?? "").Trim();
        if (key.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) key = key[7..].Trim();
        var fromQuery = Regex.Match(key, @"access_token=([A-Za-z0-9_\-]+)", RegexOptions.IgnoreCase);
        if (fromQuery.Success) return fromQuery.Groups[1].Value;
        return key;
    }

    private void Remember(string id)
    {
        if (!_seen.Add(id)) return;
        _seenOrder.Enqueue(id);
        while (_seenOrder.Count > 500) _seen.Remove(_seenOrder.Dequeue());
    }

    public async Task RunAsync(CancellationToken ct)
    {
        if (_apiKey.Length == 0)
            throw new InvalidOperationException(
                "DonatePay: нужен API-ключ из личного кабинета (donatepay.ru → раздел «API»)");

        _status("connecting", 0);

        using var http = Net.Http(TimeSpan.FromSeconds(15));

        /* 1) токен сокета по API-ключу */
        var socketToken = await RequestSocketTokenAsync(http, ct);

        // Номер аккаунта зашит в сам токен — лишний запрос профиля не нужен.
        var userId = UserIdFromToken(socketToken);
        if (userId.Length == 0)
            throw new InvalidOperationException("DonatePay: не удалось определить аккаунт по ключу");

        /* 2) подключение и авторизация сокета */
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Origin", "https://donatepay.ru");
        _ws.Options.SetRequestHeader("User-Agent", Net.UA);
        await _ws.ConnectAsync(new Uri(WsUrl), ct);

        await Net.WsSend(_ws,
            JsonSerializer.Serialize(new { @params = new { token = socketToken }, id = 1 }), ct);

        var hello = await Net.WsRecv(_ws, ct)
            ?? throw new InvalidOperationException("DonatePay: сервер закрыл соединение");

        string clientId;
        using (var helloDoc = JsonDocument.Parse(hello))
        {
            if (helloDoc.RootElement.TryGetProperty("error", out var err))
                throw new InvalidOperationException(
                    "DonatePay: ключ отклонён — " + (Net.FindString(err, "message") ?? "проверьте API-ключ"));
            clientId = Net.FindString(helloDoc.RootElement, "client") ?? "";
        }
        if (clientId.Length == 0)
            throw new InvalidOperationException("DonatePay: сервер не подтвердил подключение");

        /* 3) токен подписки на приватный канал донатов */
        var channel = $"$public:{userId}";
        var subToken = await RequestSubscriptionTokenAsync(http, clientId, channel, ct);

        /* 4) подписка */
        await Net.WsSend(_ws, JsonSerializer.Serialize(new
        {
            @params = new { channel, token = subToken },
            method = 1,
            id = 2,
        }), ct);

        _status("online", 0);

        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("DonatePay: соединение закрыто");

            foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var s = line.Trim();
                if (s.Length == 0 || s == "{}") continue;
                try { HandleFrame(s); }
                catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[donatepay] {ex.Message}"); }
            }
        }
    }

    private async Task<string> RequestSocketTokenAsync(HttpClient http, CancellationToken ct)
    {
        using var form = new FormUrlEncodedContent(
            new Dictionary<string, string> { ["access_token"] = _apiKey });
        using var res = await http.PostAsync(SocketTokenUrl, form, ct);
        var body = await res.Content.ReadAsStringAsync(ct);

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        var token = Net.FindString(root, "token") ?? "";
        if (token.Length > 0) return token;

        var message = Net.FindString(root, "message") ?? Net.FindString(root, "error") ?? "ключ не принят";
        throw new InvalidOperationException(
            $"DonatePay: {message}. Нужен API-ключ со страницы donatepay.ru → «API»");
    }

    private async Task<string> RequestSubscriptionTokenAsync(
        HttpClient http, string clientId, string channel, CancellationToken ct)
    {
        var url = $"{SocketTokenUrl}?access_token={Uri.EscapeDataString(_apiKey)}";
        var payload = JsonSerializer.Serialize(new { client = clientId, channels = new[] { channel } });
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var res = await http.PostAsync(url, content, ct);
        var body = await res.Content.ReadAsStringAsync(ct);

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        // Ответ: { "channels": [ { "channel": "...", "token": "..." } ] }
        if (root.TryGetProperty("channels", out var channels) &&
            channels.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in channels.EnumerateArray())
            {
                if ((Net.FindString(item, "channel") ?? "") != channel) continue;
                var t = Net.FindString(item, "token") ?? "";
                if (t.Length > 0) return t;
            }
        }

        var fallback = Net.FindString(root, "token") ?? "";
        if (fallback.Length > 0) return fallback;

        var message = Net.FindString(root, "message") ?? Net.FindString(root, "error")
            ?? "канал донатов недоступен";
        throw new InvalidOperationException($"DonatePay: {message}");
    }

    /// <summary>
    /// Номер аккаунта из JWT-токена сокета (поле sub в его теле).
    /// Токен состоит из трёх частей через точку, тело — base64url.
    /// </summary>
    private static string UserIdFromToken(string jwt)
    {
        try
        {
            var parts = jwt.Split('.');
            if (parts.Length < 2) return "";

            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');

            using var doc = JsonDocument.Parse(Convert.FromBase64String(payload));
            var sub = doc.RootElement.TryGetProperty("sub", out var subEl)
                ? subEl.ValueKind == JsonValueKind.String ? subEl.GetString() ?? "" : subEl.GetRawText()
                : "";
            return sub.Trim('"').Trim();
        }
        catch { return ""; }
    }

    private void HandleFrame(string json)
    {
        using var doc = JsonDocument.Parse(json);

        // Полезная часть приходит в push.pub.data (иногда строкой с JSON внутри).
        if (!Net.TryFind(doc.RootElement, "notification", out var notification) ||
            notification.ValueKind != JsonValueKind.Object)
        {
            // данные могли прийти строкой — разворачиваем и пробуем ещё раз
            if (!Net.TryFind(doc.RootElement, "data", out var dataEl) ||
                dataEl.ValueKind != JsonValueKind.String) return;
            try
            {
                using var inner = JsonDocument.Parse(dataEl.GetString() ?? "");
                if (!Net.TryFind(inner.RootElement, "notification", out var n2) ||
                    n2.ValueKind != JsonValueKind.Object) return;
                EmitDonation(n2);
            }
            catch { }
            return;
        }

        EmitDonation(notification);
    }

    private void EmitDonation(JsonElement notification)
    {
        var type = Net.FindString(notification, "type") ?? "";
        // Интересуют только донаты, служебные уведомления пропускаем.
        if (type.Length > 0 && !type.Contains("donat", StringComparison.OrdinalIgnoreCase)) return;

        if (!Net.TryFind(notification, "vars", out var vars) || vars.ValueKind != JsonValueKind.Object)
            return;

        var donationId = Net.FindString(notification, "id") ?? "";
        if (donationId.Length == 0 &&
            notification.TryGetProperty("id", out var idEl) &&
            idEl.ValueKind == JsonValueKind.Number)
            donationId = idEl.GetRawText();

        if (donationId.Length > 0)
        {
            if (_seen.Contains(donationId)) return;
            Remember(donationId);
        }

        var author = (Net.FindString(vars, "name") ?? "").Trim();
        if (author.Length == 0) author = "Аноним";

        var text = (Net.FindString(vars, "comment") ?? "").Trim();

        double amount = 0;
        if (Net.TryFind(vars, "sum", out var sumEl))
        {
            if (sumEl.ValueKind == JsonValueKind.Number && sumEl.TryGetDouble(out var n)) amount = n;
            else if (sumEl.ValueKind == JsonValueKind.String &&
                     double.TryParse(sumEl.GetString()?.Replace(',', '.'),
                         System.Globalization.NumberStyles.Any,
                         System.Globalization.CultureInfo.InvariantCulture, out var s)) amount = s;
        }
        if (amount <= 0) return;

        var currency = (Net.FindString(vars, "currency") ?? "").Trim();

        _emit(new ChatEvent
        {
            platform = "donatepay",
            channel = "донаты",
            author = author,
            text = text,
            kind = "donate",
            amount = amount,
            currency = currency.Length > 0 ? NormalizeCurrency(currency) : _currency,
        });
    }

    /// Площадка отдаёт код валюты, в ленте удобнее знак.
    private static string NormalizeCurrency(string code) => code.ToUpperInvariant() switch
    {
        "RUB" or "RUR" => "₽",
        "USD" => "$",
        "EUR" => "€",
        "UAH" => "₴",
        "KZT" => "₸",
        _ => code,
    };

    public void Dispose()
    {
        try { _ws?.Abort(); } catch { }
        try { _ws?.Dispose(); } catch { }
    }
}
