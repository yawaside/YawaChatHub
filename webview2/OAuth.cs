using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace YawaChatHub;

/// <summary>
/// Автоматическая авторизация чат-бота.
///
/// БЕЗОПАСНОСТЬ: используется ТОЛЬКО публичный client_id — секретные ключи
/// в десктоп-сборку не попадают. Вход — только в браузере по умолчанию,
/// ни одного окна WebView2 для OAuth не открывается.
///
/// TWITCH — OAuth Device Code Flow (RFC 8628). Локального HTTP-слушателя
/// НЕТ ВООБЩЕ: приложение просит device-код у Twitch, открывает
/// twitch.tv/activate в браузере, кладёт код в буфер обмена и опрашивает
/// токен, пока пользователь подтверждает вход. Так исключён целый класс
/// проблем loopback-серверов: «127.0.0.1 отказано в подключении», занятые
/// порты, залипшие процессы в трее, прокси/антивирус, netsh addurlacl.
///
/// VK — современный VK ID Authorization Code Flow + PKCE через id.vk.ru.
/// Callback принимает локальный raw TCP listener на http://localhost:80 —
/// это единственная loopback-конфигурация, которую официальная документация
/// VK ID разрешает для Web-приложений. Код, device_id и state автоматически
/// обмениваются на токен через id.vk.ru/oauth2/auth; копировать адрес не нужно.
///
/// Диагностика: %LOCALAPPDATA%\YawaChatHub\oauth.log (токены не пишем).
/// </summary>
public static class AppAuth
{
    /* ---------- зарегистрированные приложения ---------- */
    public const string TwitchClientId = "3qcjmtqkoobdcrrxzqbcw75n7egr8n";

    /// <summary>
    /// ID приложения VK ID приложения YawaChatHub (постоянный).
    /// Прежний комментарий про пользовательский ID неактуален:
    /// прежний вшитый ID VK отклоняет на уровне самого приложения — на любой
    /// запрос, даже без cookies и с revoke, отвечает
    /// {"error":"invalid_request","error_description":"Security Error"}.
    /// Живые ID дают другие ответы, то есть починить это кодом нельзя:
    /// нужно своё приложение VK. Подключает HostApi из settings.json.
    /// </summary>
    public static string VkClientId = "54765722";
    /// Для конфиденциального VK ID Web-приложения обязателен service_token.
    public static string VkServiceToken = "";
    /// Канал VK Видео Live, указанный пользователем вручную (приоритетнее автопоиска).
    public static string VkChannelOverride = "";

    /// Права: чтение/отправка чата, модерация И события EventSub
    /// (фолловы, подписки, награды за баллы, рейды, биты) — без них
    /// площадка просто не присылает эти события.
    private const string TwitchScopes =
        "chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users " +
        "moderator:manage:chat_settings channel:moderate " +
        "moderator:read:followers channel:read:subscriptions channel:read:redemptions bits:read " +
        "user:write:chat user:bot channel:bot";

    public sealed record AuthResult(string Account, string Token, string Channel = "");

    /* ---------- буфер обмена (подключает HostApi, UI-поток STA) ---------- */
    public static Func<string?>? ClipboardReader;
    public static Action<string>? ClipboardWriter;

    /// <summary>Полный цикл авторизации. Бросает исключение с понятной причиной.</summary>
    public static async Task<AuthResult> AuthorizeAsync(string platform, CancellationToken ct = default)
    {
        return platform switch
        {
            "twitch" => await TwitchDeviceAuthorizeAsync(ct),
            "vkplay" => await VkAuthorizeAsync(ct),
            _ => throw new InvalidOperationException($"Неизвестная площадка {platform}"),
        };
    }

    /* ============================ TWITCH: Device Code Flow ============================ */

    /// <summary>
    /// Вход Twitch по device-коду. Никаких redirect_uri и локальных серверов:
    /// пользователь подтверждает код на twitch.tv/activate в браузере по
    /// умолчанию, приложение тем временем опрашивает токен.
    /// </summary>
    private static async Task<AuthResult> TwitchDeviceAuthorizeAsync(CancellationToken ct)
    {
        using var http = NewHttp();

        // 1) запрашиваем device-код
        OAuthLog.Write("[start] twitch: запрашиваем device-код");
        var (status, body) = await Post(http, "https://id.twitch.tv/oauth2/device",
            new Dictionary<string, string>
            {
                ["client_id"] = TwitchClientId,
                ["scopes"] = TwitchScopes,
            }, ct);
        if (status != HttpStatusCode.OK)
            throw new InvalidOperationException($"Twitch не выдал device-код: {body}");

        using var init = JsonDocument.Parse(body);
        var deviceCode = init.RootElement.GetProperty("device_code").GetString()
            ?? throw new InvalidOperationException("Twitch не вернул device_code");
        var userCode = init.RootElement.GetProperty("user_code").GetString() ?? "";
        var verifyUri = init.RootElement.GetProperty("verification_uri").GetString()
            ?? "https://www.twitch.tv/activate";
        var interval = init.RootElement.TryGetProperty("interval", out var iv) ? iv.GetInt32() : 5;
        if (interval < 3) interval = 3;
        var expiresIn = init.RootElement.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 900;

        // 2) открываем браузер на странице активации; код — уже в буфере обмена
        OAuthLog.Write($"[device] twitch: код {userCode}, страница {verifyUri}");
        try { ClipboardWriter?.Invoke(userCode); } catch { }
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(verifyUri) { UseShellExecute = true });
        }
        catch
        {
            throw new InvalidOperationException("Не удалось открыть браузер");
        }

        // 3) опрашиваем токен до подтверждения пользователем
        var deadline = DateTime.UtcNow.AddSeconds(expiresIn);
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(interval * 1000, ct);

            var (pStatus, pBody) = await Post(http, "https://id.twitch.tv/oauth2/token",
                new Dictionary<string, string>
                {
                    ["client_id"] = TwitchClientId,
                    ["device_code"] = deviceCode,
                    ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code",
                }, ct);

            if (pStatus == HttpStatusCode.OK)
            {
                using var granted = JsonDocument.Parse(pBody);
                var token = granted.RootElement.GetProperty("access_token").GetString()
                    ?? throw new InvalidOperationException("Twitch не вернул access_token");
                OAuthLog.Write("[token] twitch: токен получен, проверяем…");
                var account = await VerifyAsync("twitch", token, ct);
                OAuthLog.Write($"[ok] twitch: бот подключён как {account}");
                return new AuthResult(account, token, account);
            }

            if (pBody.Contains("authorization_pending", StringComparison.OrdinalIgnoreCase))
                continue;   // пользователь ещё подтверждает — ждём интервал
            if (pBody.Contains("slow_down", StringComparison.OrdinalIgnoreCase))
            {
                interval += 5;
                continue;   // нас просят реже опрашивать
            }

            OAuthLog.Write($"[error] twitch: {pBody}");
            throw new InvalidOperationException($"Twitch отклонил вход: {pBody}");
        }

        OAuthLog.Write("[timeout] twitch: код не подтверждён вовремя");
        throw new InvalidOperationException("Код не подтверждён на странице twitch.tv/activate — нажмите «Войти» ещё раз");
    }

    /* ============================ VK ID: Authorization Code + PKCE ============================ */

    private const string VkRedirectUri = "http://localhost";

    /// <summary>
    /// Современный VK ID Web-flow. Настройки приложения VK ID:
    ///   Базовый домен: localhost
    ///   Доверенный Redirect URL: http://localhost
    /// Другие порты VK ID временно не поддерживает, поэтому raw TcpListener
    /// поднимается именно на loopback:80 (без HttpListener/urlacl).
    /// </summary>
    private static async Task<AuthResult> VkAuthorizeAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(VkClientId))
            throw new InvalidOperationException("Укажите ID приложения VK ID в разделе «Чат-бот»");

        using var callback = VkLoopbackServer.Start();

        var state = Base64Url(RandomNumberGenerator.GetBytes(32));
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(64));
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

        var authUrl =
            "https://id.vk.ru/authorize" +
            "?response_type=code" +
            $"&client_id={Uri.EscapeDataString(VkClientId)}" +
            $"&redirect_uri={Uri.EscapeDataString(VkRedirectUri)}" +
            $"&state={Uri.EscapeDataString(state)}" +
            $"&code_challenge={Uri.EscapeDataString(challenge)}" +
            "&code_challenge_method=S256";

        OAuthLog.Write("[start] vkplay: VK ID Authorization Code + PKCE, localhost:80");
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(authUrl) { UseShellExecute = true });
        }
        catch { throw new InvalidOperationException("Не удалось открыть браузер"); }

        var result = await callback.WaitAsync(TimeSpan.FromMinutes(5), ct);
        if (!string.IsNullOrEmpty(result.Error))
            throw new InvalidOperationException($"VK ID отклонил вход: {result.Error}");
        if (result.State != state)
            throw new InvalidOperationException("VK ID вернул неверный state — вход отменён");
        if (string.IsNullOrEmpty(result.Code) || string.IsNullOrEmpty(result.DeviceId))
            throw new InvalidOperationException("VK ID не вернул code/device_id");

        using var http = NewHttp();
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code_verifier"] = verifier,
            ["redirect_uri"] = VkRedirectUri,
            ["code"] = result.Code,
            ["client_id"] = VkClientId,
            ["device_id"] = result.DeviceId,
            ["state"] = state,
        };
        if (!string.IsNullOrWhiteSpace(VkServiceToken)) form["service_token"] = VkServiceToken;

        var (status, body) = await Post(http, "https://id.vk.ru/oauth2/auth", form, ct);
        if (status != HttpStatusCode.OK)
        {
            OAuthLog.Write($"[error] vk token exchange: {(int)status} {body}");
            throw new InvalidOperationException($"VK ID не выдал токен ({(int)status}): {body}");
        }

        using var tokenDoc = JsonDocument.Parse(body);
        var token = Net.FindString(tokenDoc.RootElement, "access_token")
            ?? throw new InvalidOperationException("VK ID не вернул access_token");
        var account = await VerifyAsync("vkplay", token, ct);
        var channel = await VkChannelAsync(token, ct);
        OAuthLog.Write($"[ok] vkplay: вход выполнен как {account}, канал «{channel}»");
        return new AuthResult(account, token, channel);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed record VkCallback(string Code, string DeviceId, string State, string Error);

    /// Мини-HTTP callback на localhost:80, IPv4+IPv6; доступен только loopback.
    private sealed class VkLoopbackServer : IDisposable
    {
        private readonly List<TcpListener> _listeners;
        private VkLoopbackServer(List<TcpListener> listeners) => _listeners = listeners;

        public static VkLoopbackServer Start()
        {
            var listeners = new List<TcpListener>();
            try
            {
                var v4 = new TcpListener(IPAddress.Loopback, 80);
                v4.Start();
                listeners.Add(v4);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    $"Порт 80 занят — VK ID не сможет вернуть вход на http://localhost. Освободите порт 80. ({ex.Message})");
            }
            try
            {
                var v6 = new TcpListener(IPAddress.IPv6Loopback, 80);
                v6.Server.SetSocketOption(SocketOptionLevel.IPv6, SocketOptionName.IPv6Only, true);
                v6.Start();
                listeners.Add(v6);
            }
            catch { /* IPv4 достаточно, если localhost резолвится в 127.0.0.1 */ }
            return new VkLoopbackServer(listeners);
        }

        public async Task<VkCallback> WaitAsync(TimeSpan timeout, CancellationToken external)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(external);
            cts.CancelAfter(timeout);
            try
            {
                var accepts = _listeners.Select(l => l.AcceptTcpClientAsync(cts.Token).AsTask()).ToArray();
                var client = await await Task.WhenAny(accepts);
                using (client)
                {
                    var line = await ReadFirstLine(client, cts.Token);
                    var target = line.Split(' ', StringSplitOptions.RemoveEmptyEntries).ElementAtOrDefault(1) ?? "/";
                    var query = ParseQuery(target);

                    // Некоторые варианты VK ID заворачивают code/device_id/state в JSON payload.
                    if (query.TryGetValue("payload", out var payload) && payload.Length > 0)
                    {
                        try
                        {
                            using var pd = JsonDocument.Parse(payload);
                            foreach (var k in new[] { "code", "device_id", "state" })
                                if (pd.RootElement.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String)
                                    query[k] = v.GetString() ?? "";
                        }
                        catch { }
                    }

                    await Respond(client, string.IsNullOrEmpty(query.GetValueOrDefault("error"))
                        ? "Готово! Вернитесь в YawaChatHub — вкладку можно закрыть."
                        : "VK ID отклонил вход. Вернитесь в YawaChatHub.");

                    return new VkCallback(
                        query.GetValueOrDefault("code", ""),
                        query.GetValueOrDefault("device_id", ""),
                        query.GetValueOrDefault("state", ""),
                        query.GetValueOrDefault("error_description", query.GetValueOrDefault("error", "")));
                }
            }
            catch (OperationCanceledException)
            {
                throw new InvalidOperationException("VK ID не вернул ответ за 5 минут");
            }
        }

        private static async Task<string> ReadFirstLine(TcpClient client, CancellationToken ct)
        {
            var ns = client.GetStream();
            var buf = new byte[8192];
            var sb = new StringBuilder();
            while (sb.Length < 65536)
            {
                int n = await ns.ReadAsync(buf.AsMemory(0, buf.Length), ct);
                if (n <= 0) break;
                sb.Append(Encoding.ASCII.GetString(buf, 0, n));
                if (sb.ToString().Contains("\r\n\r\n", StringComparison.Ordinal)) break;
            }
            var all = sb.ToString();
            var eol = all.IndexOf("\r\n", StringComparison.Ordinal);
            return eol > 0 ? all[..eol] : all;
        }

        private static Dictionary<string, string> ParseQuery(string target)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            int q = target.IndexOf('?');
            if (q < 0) return map;
            foreach (var pair in target[(q + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                int eq = pair.IndexOf('=');
                var k = Uri.UnescapeDataString((eq < 0 ? pair : pair[..eq]).Replace("+", " "));
                var v = eq < 0 ? "" : Uri.UnescapeDataString(pair[(eq + 1)..].Replace("+", " "));
                map[k] = v;
            }
            return map;
        }

        private static async Task Respond(TcpClient client, string message)
        {
            var body = Encoding.UTF8.GetBytes(
                "<!doctype html><meta charset=utf-8><title>YawaChatHub</title>" +
                $"<body style=\"background:#0a0b13;color:#eceef6;font:15px Segoe UI;text-align:center;padding-top:20vh\">{WebUtility.HtmlEncode(message)}</body>");
            var head = Encoding.ASCII.GetBytes(
                $"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n");
            await client.GetStream().WriteAsync(head);
            await client.GetStream().WriteAsync(body);
        }

        public void Dispose()
        {
            foreach (var l in _listeners) { try { l.Stop(); } catch { } }
        }
    }

    /// <summary>
    /// Канал VK Видео Live, связанный с аккаунтом. В URL канала
    /// (live.vkvideo.ru/&lt;slug&gt;) используется blogUrl, а НЕ отображаемое имя —
    /// поэтому канал по нику не находился.
    /// </summary>
    private static async Task<string> VkChannelAsync(string token, CancellationToken ct)
    {
        using var http = NewHttp();
        http.DefaultRequestHeaders.Add("Origin", "https://live.vkvideo.ru");
        http.DefaultRequestHeaders.Referrer = new Uri("https://live.vkvideo.ru/");
        http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

        // 0) Канал задан вручную — используем его (VK ID и Live связаны
        // не всегда: слаг канала может отличаться от имени профиля VK).
        var manual = CleanSlug(VkChannelOverride);
        if (!string.IsNullOrWhiteSpace(manual))
        {
            OAuthLog.Write($"[vk-channel] канал задан вручную: {manual}");
            return manual!;
        }

        // 1) Прямые маршруты VK Видео Live (работают, если токен выдан самим Live)
        foreach (var url in new[]
        {
            "https://api.live.vkvideo.ru/v1/blog/current",
            "https://api.live.vkvideo.ru/v1/user/current",
        })
        {
            try
            {
                var body = await http.GetStringAsync(url, ct);
                OAuthLog.Write($"[vk-channel] {url}: {(body.Length > 300 ? body[..300] : body)}");
                using var doc = JsonDocument.Parse(body);

                // Точечно: сначала blog.blogUrl, потом плоские варианты.
                // Рекурсивный поиск мог подхватить постороннее поле url.
                string? slug = null;
                if (doc.RootElement.TryGetProperty("data", out var dataEl))
                {
                    if (dataEl.TryGetProperty("blog", out var blogEl))
                        slug = Str(blogEl, "blogUrl") ?? Str(blogEl, "blog_url");
                    slug ??= Str(dataEl, "blogUrl") ?? Str(dataEl, "blog_url");
                }
                slug ??= Str(doc.RootElement, "blogUrl") ?? Str(doc.RootElement, "blog_url");

                slug = CleanSlug(slug);
                if (!string.IsNullOrWhiteSpace(slug))
                {
                    OAuthLog.Write($"[vk-channel] канал определён: {slug}");
                    return slug!;
                }
            }
            catch (Exception ex) { OAuthLog.Write($"[vk-channel] {url}: {ex.Message}"); }
        }

        // 2) Основной путь для VK ID. Токен VK ID выдан для api.vk.com, а Live —
        // отдельный сервис, поэтому /blog/current отвечает blog_not_found.
        // Берём профиль VK (id + screen_name) и ищем связанный канал Live.
        try
        {
            var vkId = "";
            var candidates = new List<string>();

            using var vk = NewHttp();
            var profile = await vk.GetStringAsync(
                "https://api.vk.com/method/users.get" +
                $"?access_token={Uri.EscapeDataString(token)}&v=5.199&fields=screen_name,domain", ct);
            OAuthLog.Write($"[vk-channel] users.get: {(profile.Length > 300 ? profile[..300] : profile)}");

            using (var pd = JsonDocument.Parse(profile))
            {
                if (pd.RootElement.TryGetProperty("response", out var resp) && resp.GetArrayLength() > 0)
                {
                    var me = resp[0];
                    if (me.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number)
                        vkId = idEl.GetRawText();
                    foreach (var field in new[] { "screen_name", "domain" })
                    {
                        var v = Str(me, field);
                        if (!string.IsNullOrWhiteSpace(v)) candidates.Add(v!);
                    }
                }
            }

            // 2a) канал напрямую по screen_name/domain пользователя
            foreach (var slug in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var found = await VkBlogMatchesAsync(http, slug, vkId, ct);
                if (found.Length > 0) return found;
            }

            // 2b) запасные варианты слага: числовой id и нормализованный ник
            foreach (var slug in new[] { $"id{vkId}", vkId }.Where(v => v.Length > 2))
            {
                var found = await VkBlogMatchesAsync(http, slug, vkId, ct);
                if (found.Length > 0) return found;
            }
        }
        catch (Exception ex) { OAuthLog.Write($"[vk-channel] профиль VK: {ex.Message}"); }

        OAuthLog.Write("[vk-channel] канал VK Видео Live не найден");
        return "";
    }

    /// Проверяет, что канал Live существует и принадлежит этому VK ID.
    private static async Task<string> VkBlogMatchesAsync(HttpClient http, string slug, string vkId, CancellationToken ct)
    {
        slug = CleanSlug(slug) ?? "";
        if (slug.Length == 0) return "";
        try
        {
            var body = await http.GetStringAsync($"https://api.live.vkvideo.ru/v1/blog/{Uri.EscapeDataString(slug)}", ct);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var blogUrl = CleanSlug(Str(root, "blogUrl"));
            if (string.IsNullOrWhiteSpace(blogUrl)) return "";

            // если VK ID известен — сверяем владельца, иначе принимаем найденный канал
            if (vkId.Length > 0 && root.TryGetProperty("owner", out var owner)
                && owner.TryGetProperty("id", out var ownerId) && ownerId.GetRawText() != vkId)
                return "";

            OAuthLog.Write($"[vk-channel] канал подтверждён: {blogUrl}");
            return blogUrl!;
        }
        catch { return ""; }
    }

    private static string? Str(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var v)
        && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    /// Из значения вида "https://live.vkvideo.ru/name" или "/name" достаём "name".
    private static string? CleanSlug(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var s = raw.Trim();
        if (s.StartsWith("http", StringComparison.OrdinalIgnoreCase) && Uri.TryCreate(s, UriKind.Absolute, out var uri))
            s = uri.AbsolutePath;
        s = s.Trim('/');
        var last = s.Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
        return string.IsNullOrWhiteSpace(last) ? null : last;
    }

    /* ========================== проверка токена у площадки ========================== */

    /// <summary>Проверка токена у площадки и получение имени аккаунта.</summary>
    public static async Task<string> VerifyAsync(string platform, string token, CancellationToken ct = default)
    {
        token = token.Replace("oauth:", "", StringComparison.OrdinalIgnoreCase).Trim();
        using var http = NewHttp();

        if (platform == "twitch")
        {
            http.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
            var r = await http.GetAsync("https://id.twitch.tv/oauth2/validate", ct);
            var body = await r.Content.ReadAsStringAsync(ct);
            if (!r.IsSuccessStatusCode) throw new InvalidOperationException("Twitch отклонил токен");
            using var doc = JsonDocument.Parse(body);
            return Net.FindString(doc.RootElement, "login")
                   ?? throw new InvalidOperationException("Twitch не вернул аккаунт");
        }

        if (platform == "vkplay")
        {
            http.DefaultRequestHeaders.Add("Origin", "https://live.vkvideo.ru");
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
            var r = await http.GetAsync("https://api.live.vkvideo.ru/v1/user/current", ct);
            var body = await r.Content.ReadAsStringAsync(ct);
            if (r.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(body);
                var nick = Net.FindString(doc.RootElement, "nick") ?? Net.FindString(doc.RootElement, "displayName");
                if (!string.IsNullOrEmpty(nick)) return nick!;
            }

            // запасной путь: обычный профиль VK
            var vk = await http.GetStringAsync(
                $"https://api.vk.com/method/users.get?access_token={Uri.EscapeDataString(token)}&v=5.199", ct);
            using var vkDoc = JsonDocument.Parse(vk);
            var first = Net.FindString(vkDoc.RootElement, "first_name");
            var last = Net.FindString(vkDoc.RootElement, "last_name");
            if (!string.IsNullOrEmpty(first)) return $"{first} {last}".Trim();

            throw new InvalidOperationException("VK отклонил токен");
        }

        throw new InvalidOperationException($"Неизвестная площадка {platform}");
    }

    /* ================================ утилиты ================================ */

    private static HttpClient NewHttp()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
        return http;
    }

    private static async Task<(HttpStatusCode, string)> Post(
        HttpClient http, string url, Dictionary<string, string> form, CancellationToken ct)
    {
        var r = await http.PostAsync(url, new FormUrlEncodedContent(form), ct);
        var body = await r.Content.ReadAsStringAsync(ct);
        return (r.StatusCode, body);
    }

    /// <summary>Диагностический журнал входа: %LOCALAPPDATA%\YawaChatHub\oauth.log</summary>
    internal static class OAuthLog
    {
        private static readonly object Gate = new();
        public static string Path => System.IO.Path.Combine(Program.AppDir, "oauth.log");

        public static void Write(string line)
        {
            try
            {
                lock (Gate)
                {
                    Directory.CreateDirectory(Program.AppDir);
                    File.AppendAllText(Path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}{Environment.NewLine}");
                }
            }
            catch { /* журнал не критичен */ }
        }
    }
}
