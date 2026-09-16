using System.Text.Json;
using System.Text.RegularExpressions;

namespace YawaChatHub;

/// <summary>
/// Rutube Live.
///
/// У площадки нет публичного websocket-чата: официальный веб-клиент читает
/// сообщения обычными запросами к `rutube.ru/api/chat/{videoId}/`. Этот путь
/// открыт без авторизации, поэтому коннектор работает «из коробки», как и
/// остальные площадки приложения.
///
/// Порядок работы:
///   1. Цель приводится к идентификатору эфира:
///      - 32-символьный id видео используется напрямую;
///      - числовой id канала → ищем среди его роликов активный эфир;
///   2. Проверяем, что эфир идёт (`is_livestream` + `is_on_air`);
///   3. Опрашиваем чат и отдаём только новые сообщения (дедуп по id);
///   4. Раз в общий период перепроверяем статус эфира.
///
/// Донаты Rutube приходят тем же сообщением с заполненным `donate_amount`.
/// </summary>
public sealed class RutubeConnector : IPlatformConnector
{
    private const string Api = "https://rutube.ru/api";

    private readonly string _target;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    /// Название канала для интерфейса: пользователю показываем его,
    /// а не числовой номер, которым канал адресуется в площадке.
    private readonly Action<string>? _title;

    /// Уже показанные сообщения: чат отдаётся страницей, без этого
    /// каждое обращение присылало бы одни и те же строки заново.
    private readonly HashSet<string> _seen = new(StringComparer.Ordinal);
    private readonly Queue<string> _seenOrder = new();

    public RutubeConnector(string target, Action<ChatEvent> emit, Action<string, int> status,
        Action<string>? title = null)
    {
        _target = Normalize(target);
        _emit = emit;
        _status = status;
        _title = title;
    }

    /// Принимаем ссылку на эфир, ссылку на канал, номер канала и «голый» id.
    private static string Normalize(string? raw)
    {
        var value = (raw ?? "").Trim();

        var video = Regex.Match(value, @"rutube\.ru/(?:video|live|shorts)/([0-9a-f]{32})",
            RegexOptions.IgnoreCase);
        if (video.Success) return video.Groups[1].Value.ToLowerInvariant();

        var channel = Regex.Match(value, @"rutube\.ru/(?:channel|u)/(\d+)", RegexOptions.IgnoreCase);
        if (channel.Success) return channel.Groups[1].Value;

        value = value.TrimStart('@');
        var cut = value.IndexOfAny(new[] { '/', '?', '&', '#' });
        if (cut >= 0) value = value[..cut];
        return value.Trim().ToLowerInvariant();
    }

    private void Remember(string id)
    {
        if (!_seen.Add(id)) return;
        _seenOrder.Enqueue(id);
        // Держим ограниченное окно: длинный эфир иначе копил бы память.
        while (_seenOrder.Count > 4000) _seen.Remove(_seenOrder.Dequeue());
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        if (_target.Length == 0)
        {
            _status("error", 0);
            throw new InvalidOperationException("Rutube: не указан канал или эфир");
        }

        using var http = Net.Http(TimeSpan.FromSeconds(10));
        http.DefaultRequestHeaders.Referrer = new Uri("https://rutube.ru/");

        var videoId = await ResolveLiveVideoAsync(http, ct);
        if (videoId.Length == 0)
        {
            // Канал существует, но сейчас не вещает — это не ошибка.
            _status("offline", 0);
            if (!await Net.DelayAsync(45_000, ct)) return;
            throw new InvalidOperationException("Rutube: эфир не найден, повторная проверка");
        }

        _status("online", 0);

        // Первый проход только запоминает историю чата: иначе при подключении
        // в ленту разом улетели бы два десятка старых сообщений.
        var first = true;

        // Фоновая проверка, что эфир ещё идёт.
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                if (!await Net.DelayAsync(Net.ViewerPollMs, ct)) return;
                try
                {
                    var info = await GetJsonAsync(http, $"{Api}/video/{videoId}/", ct);
                    if (info == null) continue;
                    var onAir = Net.FindBool(info.Value, "is_on_air");
                    _status(onAir ? "online" : "offline", 0);
                }
                catch { /* временная сетевая ошибка — повторим */ }
            }
        }, CancellationToken.None);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var page = await GetJsonAsync(http, $"{Api}/chat/{videoId}/", ct);
                if (page != null &&
                    page.Value.TryGetProperty("results", out var results) &&
                    results.ValueKind == JsonValueKind.Array)
                {
                    // Лента площадки отдаётся от новых к старым — разворачиваем,
                    // чтобы в приложении сохранился нормальный порядок.
                    var items = results.EnumerateArray().Reverse().ToList();
                    foreach (var item in items) Handle(item, skip: first);
                    first = false;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch { /* пропускаем круг, соединение не рвём */ }

            // Чат Rutube не поддерживает push, поэтому опрашиваем часто —
            // задержка сообщений в ленте остаётся незаметной.
            if (!await Net.DelayAsync(2_000, ct)) return;
        }
    }

    /// <summary>
    /// Находит идентификатор активного эфира: либо он задан напрямую, либо
    /// ищется среди последних роликов канала.
    /// </summary>
    private async Task<string> ResolveLiveVideoAsync(HttpClient http, CancellationToken ct)
    {
        if (Regex.IsMatch(_target, "^[0-9a-f]{32}$"))
        {
            var direct = await GetJsonAsync(http, $"{Api}/video/{_target}/", ct);
            if (direct == null) return "";
            ReportTitle(direct.Value);
            return Net.FindBool(direct.Value, "is_livestream") ? _target : "";
        }

        // Канал у Rutube адресуется ЧИСЛОМ. Если пользователь ввёл имя
        // (rutube.ru/u/имя, rutube.ru/channel/имя или просто «имя»), сначала
        // переводим его в номер по странице канала — API по имени отвечает 404,
        // из-за чего канал раньше вообще не подключался.
        var channelId = _target;
        if (!Regex.IsMatch(channelId, @"^\d+$"))
        {
            channelId = await ResolveChannelIdAsync(http, _target, ct);
            if (channelId.Length == 0)
                throw new InvalidOperationException(
                    $"Rutube: канал «{_target}» не найден — проверьте ссылку или имя канала");
        }

        // Имя канала для интерфейса: показываем его вместо номера.
        try
        {
            var profile = await GetJsonAsync(http, $"{Api}/profile/user/{channelId}/", ct);
            if (profile != null) _title?.Invoke(Net.FindString(profile.Value, "name") ?? "");
        }
        catch { /* без имени покажем то, что ввёл пользователь */ }

        var list = await GetJsonAsync(http, $"{Api}/video/person/{channelId}/", ct);
        if (list == null ||
            !list.Value.TryGetProperty("results", out var arr) ||
            arr.ValueKind != JsonValueKind.Array)
            return "";

        // Сначала то, что прямо сейчас в эфире, иначе — любая трансляция.
        foreach (var onlyLive in new[] { true, false })
        {
            foreach (var v in arr.EnumerateArray())
            {
                if (!Net.FindBool(v, "is_livestream")) continue;
                if (onlyLive && !Net.FindBool(v, "is_on_air")) continue;
                var id = Net.FindString(v, "id") ?? "";
                if (id.Length > 0) return id;
            }
        }
        return "";
    }

    /// <summary>
    /// Имя канала → его числовой номер. Публичного поиска по имени у площадки
    /// нет, поэтому открываем страницу канала и берём номер из её данных:
    /// именно так адрес вида rutube.ru/u/имя превращается в rutube.ru/channel/NNN.
    /// </summary>
    private static async Task<string> ResolveChannelIdAsync(HttpClient http, string name, CancellationToken ct)
    {
        var safe = Uri.EscapeDataString(name);
        foreach (var url in new[]
                 {
                     $"https://rutube.ru/u/{safe}/",
                     $"https://rutube.ru/channel/{safe}/",
                 })
        {
            string html;
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Accept.Clear();
                req.Headers.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml");
                using var res = await http.SendAsync(req, ct);
                if (!res.IsSuccessStatusCode) continue;
                html = await res.Content.ReadAsStringAsync(ct);
            }
            catch { continue; }

            foreach (var pattern in new[]
                     {
                         @"""channel_id""\s*:\s*(\d{4,})",
                         @"""channel""\s*:\s*\{\s*""id""\s*:\s*(\d{4,})",
                         @"rutube\.ru/channel/(\d{4,})",
                     })
            {
                var m = Regex.Match(html, pattern);
                if (m.Success) return m.Groups[1].Value;
            }
        }
        return "";
    }

    /// Имя канала из данных эфира (когда указана прямая ссылка на трансляцию).
    private void ReportTitle(JsonElement video)
    {
        if (_title == null) return;
        if (!Net.TryFind(video, "author", out var author) || author.ValueKind != JsonValueKind.Object) return;
        var name = Net.FindString(author, "name") ?? "";
        if (name.Length > 0) _title(name);
    }

    private void Handle(JsonElement item, bool skip)
    {
        if (!item.TryGetProperty("payload", out var p) || p.ValueKind != JsonValueKind.Object) return;

        var id = Net.FindString(p, "id") ?? "";
        if (id.Length == 0) return;
        if (_seen.Contains(id)) return;
        Remember(id);
        if (skip) return;                       // история при подключении

        var text = (Net.FindString(p, "text") ?? "").Trim();
        if (text.Length == 0) return;

        var author = "";
        var official = false;
        if (p.TryGetProperty("user", out var user) && user.ValueKind == JsonValueKind.Object)
        {
            author = Net.FindString(user, "name") ?? "";
            official = Net.FindBool(user, "is_official");
        }
        if (author.Length == 0) author = "гость";

        // Донат отличается заполненной суммой в том же сообщении.
        var amountRaw = (Net.FindString(p, "donate_amount") ?? "").Trim();
        double? amount = null;
        if (amountRaw.Length > 0 &&
            double.TryParse(amountRaw.Replace(',', '.'),
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed) && parsed > 0)
            amount = parsed;

        _emit(new ChatEvent
        {
            platform = "rutube",
            channel = _target,
            author = author,
            text = text,
            kind = amount.HasValue ? "donate" : "chat",
            amount = amount,
            currency = amount.HasValue ? "₽" : null,
            badges = official ? new[] { "mod" } : null,
        });
    }

    private static async Task<JsonElement?> GetJsonAsync(HttpClient http, string url, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.TryAddWithoutValidation("Cache-Control", "no-cache, no-store");
        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode) return null;
        var body = await res.Content.ReadAsStringAsync(ct);
        try
        {
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.Clone();
        }
        catch { return null; }
    }

    public void Dispose() { }
}
