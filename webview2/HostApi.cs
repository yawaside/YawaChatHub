using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace YawaChatHub;

/// <summary>
/// JSON-RPC мост рендерер ↔ хост. Заменяет electron/ipc: те же методы,
/// что вызывает src/lib/bridge.ts — settings.*, window.*, tts.*,
/// overlay.*, widget.info, hotkeys.apply, clipboard.set, shell.openExternal.
/// Настройки живут в %LOCALAPPDATA%\YawaChatHub\settings.json (как раньше у Electron).
/// </summary>
public sealed class HostApi : IDisposable
{
    private readonly MainWindow _win;
    private readonly WebView2 _web;
    private readonly SapiTts _tts = new();
    private readonly EdgeTts _edge = new();
    private readonly WidgetServer _widget = new();
    private readonly ConnectorManager _connectors;
    private OverlayWindow? _overlay;
    private JsonNode? _overlayConfig;     // последний конфиг — применяется к новому окну
    private readonly string _settingsPath = Path.Combine(Program.AppDir, "settings.json");
    private JsonObject _settings = new();

    /// Создаёт окно оверлея при первом обращении и сразу применяет сохранённые настройки.
    private OverlayWindow EnsureOverlay()
    {
        if (_overlay == null || _overlay.IsDisposed)
        {
            _overlay = new OverlayWindow(this);
            // перетащили окно → сохраняем posX/posY в settings.json (и в конфиг оверлея)
            _overlay.PositionChanged += (x, y) =>
            {
                if (_overlayConfig is JsonObject cfgObj)
                {
                    cfgObj["posX"] = x;
                    cfgObj["posY"] = y;
                }
                if (_settings["overlay"] is JsonObject savedObj)
                {
                    savedObj["posX"] = x;
                    savedObj["posY"] = y;
                    SaveSettings();
                }
                _win.SendEvent("overlay.moved", new { x, y });
            };
            // размер, заданный перетаскиванием краёв, тоже запоминаем
            _overlay.SizeChangedByUser += (w, h) =>
            {
                if (_overlayConfig is JsonObject sizeCfg)
                {
                    sizeCfg["width"] = w;
                    sizeCfg["height"] = h;
                }
                if (_settings["overlay"] is JsonObject savedSize)
                {
                    savedSize["width"] = w;
                    savedSize["height"] = h;
                    SaveSettings();
                }
                _win.SendEvent("overlay.resized", new { width = w, height = h });
            };
            var cfg = _overlayConfig
                ?? (_settings.TryGetPropertyValue("overlay", out var saved) ? saved?.DeepClone() : null);
            if (cfg != null) _overlay.Apply(cfg);
        }
        return _overlay;
    }

    public HostApi(MainWindow win, WebView2 web)
    {
        _win = win;
        _web = web;
        LoadSettings();
        // VK отдаёт токен только во фрагменте blank.html: читаем адрес из буфера
        // обмена, причём строго в UI-потоке — Clipboard требует STA.
        AppAuth.ClipboardReader = () =>
        {
            try
            {
                return _win.IsHandleCreated
                    ? _win.Invoke(() => Clipboard.ContainsText() ? Clipboard.GetText() : null)
                    : null;
            }
            catch { return null; }
        };
        // Twitch: device-код кладём в буфер — пользователю остаётся только вставить
        AppAuth.ClipboardWriter = text =>
        {
            try { _win.BeginInvoke(() => Clipboard.SetText(text)); } catch { }
        };
        // Токен бота включает права модерации и отправки в Twitch-коннекторе
        ConnectorManager.BotToken = (_settings["botToken:twitch"]?.GetValue<string>() ?? "")
            .Replace("oauth:", "", StringComparison.OrdinalIgnoreCase);
        ConnectorManager.BotLogin = (_settings["botAuth"] is JsonObject ba
            ? ba["twitch"]?.GetValue<string>() : null) ?? "";
        ConnectorManager.VkToken = _settings["botToken:vkplay"]?.GetValue<string>() ?? "";
        // Чат TikTok читается скрытым окном WebView2: браузер сам получает
        // cookies и подписывает запросы, пользователь вводит только канал.
        ConnectorManager.TikTokReader = (channel, onMessage, onStatus, ct) =>
            TikTokLive.RunAsync(_win, channel, onMessage, onStatus, ct);

        // ПРОВЕРЕННЫЙ коннектор TikTok LIVE (модуль tiktok-live-connector):
        // чат, подарки, подписки, лайки, входы, зрители и эмодзи в никах.
        // Прокси определяется автоматически из переменных окружения (HTTPS_PROXY);
        // если VPN работает на TUN-адаптере, трафик идёт через него без настроек.
        ConnectorManager.TikTokNodeReader = (channel, onMessage, onStatus, ct)
            => new TikTokNodeBridge(channel, onMessage, onStatus).RunAsync(ct);

        // Сервер виджета поднимается СРАЗУ при старте: иначе OBS не мог
        // подключиться, пока пользователь не откроет настройки виджета,
        // и озвучка/сообщения в Browser Source не приходили.
        try { _widget.Start(IntSetting("widgetPort", 8085)); } catch { }

        // System.Threading.Timer работает из фоновых потоков коннекторов
        // (в отличие от ранее сломанного WinForms.Timer без message loop).
        _chatFlushTimer = new System.Threading.Timer(
            _ => FlushChatBatch(), null, Timeout.Infinite, Timeout.Infinite);

        // Прогрев Edge TTS после появления интерфейса: не конкурирует с
        // запуском WebView2 и восстановлением каналов за CPU/сеть.
        _ = Task.Run(async () =>
        {
            await Task.Delay(1500);
            _edge.Warmup();
        });
        _connectors = new ConnectorManager(
            msg => PushChatMessage(msg),
            (platform, username, status, viewers) =>
                _win.SendEvent("channel.status", new { platform, username, status, viewers }));
    }

    /// <param name="reply">
    /// Куда отправить ответ. По умолчанию — главное окно; окно оверлея
    /// передаёт свой Reply, чтобы получать собственные настройки.
    /// </param>
    public async Task DispatchAsync(
        int id,
        string method,
        object?[] args,
        Action<int, bool, object?, string?>? reply = null)
    {
        reply ??= (i, ok, res, err) => _win.Reply(i, ok, res, err);
        try
        {
            object? result = await Route(method, args);
            if (id != 0) reply(id, true, result, null);
        }
        catch (Exception ex)
        {
            if (id != 0) reply(id, false, null, ex.Message);
        }
    }

    private async Task<object?> Route(string method, object?[] a)
    {
        switch (method)
        {
            /* ---------- настройки ---------- */
            case "settings.get":
            {
                var key = Str(a, 0) ?? "";
                return _settings.TryGetPropertyValue(key, out var node) ? node?.DeepClone() : null;
            }
            case "settings.set":
            {
                var key = Str(a, 0) ?? "";
                _settings[key] = a.Length > 1 ? ToNode(a[1]) : null;
                SaveSettings();
                if (key == "closeToTray") _win.SetCloseToTray(a.Length > 1 && Bool(a, 1));
                return null;
            }

            /* ---------- окно ---------- */
            case "window.minimize": _win.BeginInvoke(() => _win.WindowState = FormWindowState.Minimized); return null;
            case "window.toggleMaximize": _win.BeginInvoke(_win.ToggleMaximize); return null;
            case "window.isMaximized": return _win.WindowState == FormWindowState.Maximized;
            case "window.close":
            {
                bool toTray = Bool(a, 0);
                _win.BeginInvoke(() =>
                {
                    if (toTray) _win.Hide();
                    else { _win.SetCloseToTray(false); _win.Close(); }
                });
                return null;
            }
            case "window.drag": _win.BeginInvoke(_win.BeginDrag); return null;

            /* ---------- озвучка: Edge TTS (нейро, только русский) или системный SAPI ---------- */
            case "tts.voices":
                // список доступных голосов для панели «Озвучка»
                return new
                {
                    edge = EdgeTts.AllVoices.Select(v => new { id = v.Id, title = v.Title, gender = v.Gender }),
                    sapi = SapiTts.ListRussianVoices(),
                };

            case "tts.speak":
            {
                var text = Str(a, 0) ?? "";
                var voice = Str(a, 1) ?? "";
                var rate = a.Length > 2 ? Int(a, 2) : 0;      // -10..10 (SAPI) / проценты (Edge)
                var volume = a.Length > 3 ? Int(a, 3) : 100;  // 0..100
                var engine = a.Length > 4 ? Str(a, 4) ?? "edge" : "edge";
                var speaker = a.Length > 5 ? Str(a, 5) ?? "" : "";   // ник автора для персонального голоса

                // Персональный голос автора важнее выбранного по умолчанию
                if (speaker.Trim().Length > 0
                    && _settings["userVoices"] is JsonObject perUser
                    && perUser[speaker.Trim().ToLowerInvariant()] is JsonValue personal
                    && EdgeTts.AllVoices.Any(v => v.Id.Equals(personal.GetValue<string>(), StringComparison.OrdinalIgnoreCase)))
                {
                    voice = personal.GetValue<string>();
                }

                if (engine == "sapi")
                {
                    // Локально — выбранный системный голос SAPI. Параллельно
                    // синтезируем MP3 только для OBS (без второго звука на ПК).
                    if (_widget.Running)
                    {
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                var mp3 = await _edge.SynthesizeForObsAsync(text, rate * 10);
                                if (mp3.Length > 0) _widget.BroadcastTts(mp3, volume);
                            }
                            catch { }
                        });
                    }
                    await _tts.SpeakAsync(text, voice, rate, volume);
                }
                else
                {
                    // Аудио уходит в OBS Browser Source МГНОВЕННО при готовности синтеза (0 задержки)
                    await _edge.SpeakAsync(text, voice, rate * 10, volume, mp3 =>
                    {
                        if (mp3.Length > 0 && _widget.Running)
                        {
                            try { _widget.BroadcastTts(mp3, volume); } catch { }
                        }
                    });
                }
                return null;
            }
            /* ---------- закрепление голоса за пользователем чата ---------- */
            case "userVoice.set":
            {
                // userVoice.set { user: "ник", voice: "id голоса" }
                var node = ToNode(a.ElementAtOrDefault(0));
                var user = node?["user"]?.GetValue<string>()?.Trim().ToLowerInvariant() ?? "";
                var voice = node?["voice"]?.GetValue<string>()?.Trim() ?? "";
                if (user.Length == 0) throw new InvalidOperationException("Не указан пользователь");
                if (voice.Length == 0)
                {
                    if (_settings["userVoices"] is JsonObject map1) map1.Remove(user);
                }
                else
                {
                    if (!EdgeTts.AllVoices.Any(v => v.Id.Equals(voice, StringComparison.OrdinalIgnoreCase)))
                        throw new InvalidOperationException("Неизвестный голос");
                    if (_settings["userVoices"] is not JsonObject map2) _settings["userVoices"] = map2 = new JsonObject();
                    map2[user] = voice;
                }
                SaveSettings();
                return new { ok = true };
            }
            case "userVoice.get":
            {
                // карта «ник → голос» с русскими названиями
                var result = new List<object>();
                if (_settings["userVoices"] is JsonObject map)
                    foreach (var kv in map)
                        result.Add(new { user = kv.Key, voice = kv.Value?.GetValue<string>() ?? "", title = EdgeTts.TitleOf(kv.Value?.GetValue<string>()) });
                return new { voices = EdgeTts.AllVoices.Select(v => new { id = v.Id, title = v.Title, gender = v.Gender }), assigned = result };
            }

            case "tts.pause": _tts.Pause(); return null;
            case "tts.resume": _tts.Resume(); return null;
            case "tts.clear":
                _tts.Clear();
                _edge.Cancel();
                return null;

            /* ---------- оверлей поверх игры ---------- */
            case "overlay.open":
                _win.Invoke(() => EnsureOverlay().Show());
                return null;
            case "overlay.close":
                _win.Invoke(() => _overlay?.Hide());
                return null;
            case "overlay.isVisible":
                return _win.Invoke(() => _overlay?.Visible == true);
            case "overlay.toggle":
                // показать/скрыть окно оверлея (вызывается кнопкой и глобальным хоткеем)
                return _win.Invoke(() =>
                {
                    var ov = EnsureOverlay();
                    if (ov.Visible) { ov.Hide(); return false; }
                    ov.Show();
                    ov.BringToFront();
                    return true;
                });
            case "overlay.set":
            {
                var cfg = ToNode(a.ElementAtOrDefault(0));
                _overlayConfig = cfg?.DeepClone();
                _win.BeginInvoke(() => _overlay?.Apply(cfg));
                return null;
            }
            case "overlay.stats":
            {
                var stats = ToNode(a.ElementAtOrDefault(0));
                _win.BeginInvoke(() => _overlay?.SetStats(stats));
                return null;
            }
            case "overlay.beginDrag":
                _win.BeginInvoke(() => _overlay?.BeginDrag());
                return null;
            case "overlay.beginResize":
            {
                // страница сообщает, за какой край тянут: "e" | "s" | "se"
                var dir = Str(a, 0) ?? "se";
                _win.BeginInvoke(() => _overlay?.BeginResize(dir));
                return null;
            }
            case "overlay.center":
                _win.BeginInvoke(() => EnsureOverlay().CenterOnScreen());
                return null;

            /* ---------- каналы: реальные коннекторы площадок ---------- */
            case "channels.connect":
            {
                var sub = ToNode(a.ElementAtOrDefault(0))?.Deserialize<ChannelSubInput>()
                    ?? throw new InvalidOperationException("channels.connect: нет параметров");
                _connectors.Connect(sub);
                return null;
            }
            case "channels.disconnect":
            {
                var sub = ToNode(a.ElementAtOrDefault(0))?.Deserialize<ChannelSubInput>()
                    ?? throw new InvalidOperationException("channels.disconnect: нет параметров");
                _connectors.Disconnect(sub.platform, sub.username);
                return null;
            }
            case "channels.reconnect":
            {
                var sub = ToNode(a.ElementAtOrDefault(0))?.Deserialize<ChannelSubInput>()
                    ?? throw new InvalidOperationException("channels.reconnect: нет параметров");
                _connectors.Connect(sub); // Connect сам гасит предыдущий экземпляр
                return null;
            }

            /* ---------- виджет OBS ---------- */
            case "widget.config":
            {
                // ссылка в OBS постоянная — оформление доставляется по SSE
                var cfg = ToNode(a.ElementAtOrDefault(0));
                if (!_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));
                _widget.BroadcastConfig(cfg);
                return null;
            }
            case "widget.info":
            {
                if (!_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));
                return new { url = $"http://127.0.0.1:{_widget.Port}/widget", port = _widget.Port, running = _widget.Running };
            }

            /* ---------- глобальные хоткеи ---------- */
            case "hotkeys.apply":
            {
                var map = new Dictionary<string, string>();
                if (a.Length > 0 && ToNode(a[0]) is JsonObject o)
                    foreach (var kv in o) map[kv.Key] = kv.Value?.GetValue<string>() ?? "";
                _win.BeginInvoke(() => _win.ApplyHotkeys(map));
                return null;
            }

            /* ---------- отправка сообщения в чат (ответы команд бота) ---------- */
            case "chat.send":
            {
                var platform = Str(a, 0) ?? "";
                var channel = (Str(a, 1) ?? "").Trim().TrimStart('@', '#');
                var text = Str(a, 2) ?? "";
                if (text.Length == 0) return null;
                await SendChatAsync(platform, channel, text);
                return new { ok = true };
            }

            /* ---------- реальная модерация на площадке ---------- */
            case "moderation.run":
            {
                var req = ToNode(a.ElementAtOrDefault(0))
                    ?? throw new InvalidOperationException("moderation.run: нет параметров");
                return await RunModerationAsync(req);
            }

            /* ---------- авторизация чат-бота ---------- */
            case "bot.login":
            {
                // автоматический вход: браузер → площадка → приложение
                var platform = Str(a, 0) ?? "";
                // VK работает только со своим приложением пользователя (Standalone)
                // ID приложения VK ID вшит в приложение; настройка оставлена
                // только как аварийное переопределение (в интерфейсе скрыта).
                var vkOverride = (_settings.TryGetPropertyValue("vkClientId", out var vkId)
                    ? vkId?.GetValue<string>() : null) ?? "";
                if (!string.IsNullOrWhiteSpace(vkOverride)) AppAuth.VkClientId = vkOverride;
                AppAuth.VkServiceToken = (_settings.TryGetPropertyValue("vkServiceToken", out var vkSecret)
                    ? vkSecret?.GetValue<string>() : null) ?? "";
                AppAuth.VkChannelOverride = (_settings.TryGetPropertyValue("vkChannel", out var vkCh)
                    ? vkCh?.GetValue<string>() : null) ?? "";
                var res = await AppAuth.AuthorizeAsync(platform);
                _settings[$"botToken:{platform}"] = res.Token;
                _settings.Remove($"botUserId:{platform}");   // id пересчитается под новый токен
                SaveSettings();
                if (platform == "twitch")
                {
                    // сразу включаем права бота в уже поднятых коннекторах
                    ConnectorManager.BotToken = res.Token;
                    ConnectorManager.BotLogin = res.Account;
                    _connectors.RefreshTwitchAuth();
                }
                else if (platform == "vkplay")
                {
                    // с токеном VK начинает присылать приватные события канала
                    ConnectorManager.VkToken = res.Token;
                    _connectors.RefreshAuth("vkplay");
                }
                // интерфейс сам добавит канал авторизованного аккаунта
                _win.SendEvent("bot.authorized", new
                {
                    platform,
                    account = res.Account,
                    // канал площадки: у VK это slug live.vkvideo.ru, не ник
                    channel = string.IsNullOrWhiteSpace(res.Channel) ? res.Account : res.Channel,
                });
                return new { account = res.Account };
            }
            case "bot.verify":
            {
                // запасной путь: пользователь вставил токен вручную
                var platform = Str(a, 0) ?? "";
                var token = (Str(a, 1) ?? "").Trim();
                if (token.Length == 0) throw new InvalidOperationException("Пустой токен");
                var account = await AppAuth.VerifyAsync(platform, token);
                _settings[$"botToken:{platform}"] = token;
                _settings.Remove($"botUserId:{platform}");
                SaveSettings();
                if (platform == "twitch")
                {
                    ConnectorManager.BotToken = token.Replace("oauth:", "", StringComparison.OrdinalIgnoreCase);
                    ConnectorManager.BotLogin = account;
                    _connectors.RefreshTwitchAuth();
                }
                else if (platform == "vkplay")
                {
                    ConnectorManager.VkToken = token;
                    _connectors.RefreshAuth("vkplay");
                }
                _win.SendEvent("bot.authorized", new { platform, account, channel = account });
                return new { account, token };
            }
            case "bot.logout":
            {
                var platform = Str(a, 0) ?? "";
                _settings.Remove($"botToken:{platform}");
                _settings.Remove($"botUserId:{platform}");
                SaveSettings();
                if (platform == "twitch")
                {
                    ConnectorManager.BotToken = "";
                    ConnectorManager.BotLogin = "";
                    _connectors.RefreshTwitchAuth();
                }
                return null;
            }

            /* ---------- система ---------- */
            case "clipboard.set":
                _win.BeginInvoke(() => { try { Clipboard.SetText(Str(a, 0) ?? ""); } catch { } });
                return null;
            case "shell.openExternal":
                Process.Start(new ProcessStartInfo(Str(a, 0) ?? "") { UseShellExecute = true });
                return null;

            default:
                throw new InvalidOperationException($"unknown method {method}");
        }
    }

    /// Реальные коннекторы (Twitch IRC, Kick pusher, VK/TikTok WS) вызывают это —
    /// сообщение уходит в ленту, оверлей и виджет, как electron-канал "chat".
    /// <summary>
    /// Единая точка входа реального чата. ВАЖНО: вызывается из фоновых потоков
    /// коннекторов, поэтому обращение к WebView2 обязано быть потокобезопасным
    /// и полностью защищённым — иначе исключение убивало коннектор
    /// (Twitch «переподключался» на каждом сообщении) и ломало доставку в оверлей.
    /// </summary>
    /* Потокобезопасный транспорт сообщений. Один JSON/PostMessage на пачку
       вместо трёх сериализаций каждого сообщения (главное окно/оверлей/OBS). */
    private readonly System.Collections.Concurrent.ConcurrentQueue<object> _chatPending = new();
    private readonly System.Threading.Timer _chatFlushTimer;
    private int _chatFlushScheduled;

    public void PushChatMessage(object message)
    {
        _chatPending.Enqueue(message);
        if (Interlocked.CompareExchange(ref _chatFlushScheduled, 1, 0) == 0)
            _chatFlushTimer.Change(80, Timeout.Infinite);
    }

    private void FlushChatBatch()
    {
        var list = new List<object>(32);
        while (list.Count < 256 && _chatPending.TryDequeue(out var item)) list.Add(item);

        Interlocked.Exchange(ref _chatFlushScheduled, 0);
        if (list.Count > 0)
        {
            var batch = list.ToArray();
            try { _win.SendEvent("chat.batch", batch); } catch { }
            try { _overlay?.Forward("chat.batch", batch); } catch { }
            try { _widget.Push("chat.batch", batch); } catch { }
        }

        // Сообщения могли прийти ровно во время сброса — запускаем следующий кадр.
        if (!_chatPending.IsEmpty && Interlocked.CompareExchange(ref _chatFlushScheduled, 1, 0) == 0)
            _chatFlushTimer.Change(80, Timeout.Infinite);
    }

    /* ---------- общие ресурсы Twitch API (без пересоздания на каждый вызов) ---------- */
    private static HttpClient? _twitchHttp;
    private static string _twitchHttpToken = "";
    private static readonly object _twitchHttpGate = new();
    private static readonly Dictionary<string, string> _twitchUserIds = new(StringComparer.OrdinalIgnoreCase);
    private static (string modId, string login, HashSet<string> scopes) _twitchIdentity;
    private static string _twitchIdentityToken = "";
    private static DateTime _twitchIdentityAt;

    private static HttpClient TwitchHttp(string token)
    {
        lock (_twitchHttpGate)
        {
            if (_twitchHttp != null && _twitchHttpToken == token) return _twitchHttp;
            _twitchHttp?.Dispose();
            var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
            http.DefaultRequestHeaders.Add("Client-Id", AppAuth.TwitchClientId);
            _twitchHttp = http;
            _twitchHttpToken = token;
            return http;
        }
    }

    /// user_id, login и scope токена. Кэш на 5 минут — /validate больше
    /// не вызывается на каждое действие модерации.
    private static async Task<(string, string, HashSet<string>)> TwitchIdentityAsync(string token)
    {
        if (_twitchIdentityToken == token && (DateTime.UtcNow - _twitchIdentityAt).TotalMinutes < 5)
            return _twitchIdentity;

        using var vh = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        vh.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
        var res = await vh.GetAsync("https://id.twitch.tv/oauth2/validate");
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException("Токен Twitch истёк — выйдите и войдите заново");

        using var doc = JsonDocument.Parse(body);
        var modId = Net.FindString(doc.RootElement, "user_id") ?? "";
        var login = (Net.FindString(doc.RootElement, "login") ?? "").ToLowerInvariant();
        var scopes = doc.RootElement.TryGetProperty("scopes", out var sa) && sa.ValueKind == JsonValueKind.Array
            ? sa.EnumerateArray().Select(x => x.GetString() ?? "").ToHashSet(StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);

        _twitchIdentity = (modId, login, scopes);
        _twitchIdentityToken = token;
        _twitchIdentityAt = DateTime.UtcNow;
        return _twitchIdentity;
    }

    /// <summary>
    /// Отправка сообщения в чат от имени авторизованного аккаунта.
    /// Twitch: Helix Send Chat Message (IRC-отправка требует отдельного
    /// подключения бота и часто блокируется, Helix надёжнее).
    /// </summary>
    private async Task SendChatAsync(string platform, string channel, string text)
    {
        if (platform != "twitch")
            throw new InvalidOperationException("Ответы бота пока поддержаны только для Twitch");

        var token = (_settings["botToken:twitch"]?.GetValue<string>() ?? "")
            .Replace("oauth:", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (token.Length == 0)
            throw new InvalidOperationException("Войдите через Twitch в разделе «Чат-бот»");

        var log = Path.Combine(Program.AppDir, "bot.log");
        void Log(string line)
        {
            try { File.AppendAllText(log, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}{Environment.NewLine}"); }
            catch { }
        }

        // 1) ОСНОВНОЙ путь — IRC: тому же соединению, что читает чат, достаточно
        // права chat:edit, которое есть и у старых токенов. Helix требует
        // user:write:chat, из-за чего ответы молча не отправлялись.
        if (await TwitchIrcConnector.TrySendAsync(channel, text))
        {
            Log($"IRC -> #{channel}: {text}");
            return;
        }

        // 2) Запасной путь — Helix (если IRC-подключение ещё не поднялось)
        var http = TwitchHttp(token);
        var (senderId, _, scopes) = await TwitchIdentityAsync(token);
        if (!scopes.Contains("user:write:chat"))
        {
            Log($"IRC недоступен, в токене нет user:write:chat (канал {channel})");
            throw new InvalidOperationException(
                "Бот не подключён к чату канала. Переподключите канал или войдите в Twitch заново");
        }

        var broadcasterId = await TwitchUserIdAsync(http, channel);
        if (broadcasterId.Length == 0)
            throw new InvalidOperationException($"Twitch не нашёл канал «{channel}»");

        var payload = JsonSerializer.Serialize(new
        {
            broadcaster_id = broadcasterId,
            sender_id = senderId,
            message = text.Length > 480 ? text[..480] : text,
        });
        using var content = new StringContent(payload, System.Text.Encoding.UTF8, "application/json");
        var res = await http.PostAsync("https://api.twitch.tv/helix/chat/messages", content);
        var body = await res.Content.ReadAsStringAsync();
        Log($"Helix -> #{channel}: {(int)res.StatusCode} {body}");
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Twitch ({(int)res.StatusCode}): {body}");
    }

    /// ID пользователя Twitch по логину (с общим кэшем).
    private static async Task<string> TwitchUserIdAsync(HttpClient http, string login)
    {
        login = login.Trim().ToLowerInvariant();
        if (login.Length == 0) return "";
        lock (_twitchUserIds)
            if (_twitchUserIds.TryGetValue(login, out var cached)) return cached;

        var r = await http.GetAsync($"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}");
        var body = await r.Content.ReadAsStringAsync();
        if (!r.IsSuccessStatusCode)
            throw new InvalidOperationException($"Twitch users API ({(int)r.StatusCode}): {body}");
        using var d = JsonDocument.Parse(body);
        if (!d.RootElement.TryGetProperty("data", out var arr) || arr.GetArrayLength() == 0) return "";
        var id = Net.FindString(arr[0], "id") ?? "";
        if (id.Length > 0) lock (_twitchUserIds) _twitchUserIds[login] = id;
        return id;
    }

    /// <summary>
    /// Настоящая модерация Twitch через Helix API. Не доверяем IRC-тегам:
    /// broadcaster_id, moderator_id и target user_id проверяются/получаются
    /// через Helix. Каждый запрос и ответ пишутся в moderation.log (без токена).
    /// </summary>
    private async Task<object?> RunModerationAsync(JsonNode req)
    {
        var action = req["action"]?.GetValue<string>() ?? "";
        var platform = req["platform"]?.GetValue<string>() ?? "";
        var channel = (req["channel"]?.GetValue<string>() ?? "").Trim().TrimStart('@', '#').ToLowerInvariant();
        var author = (req["author"]?.GetValue<string>() ?? "").Trim().ToLowerInvariant();
        var msgId = req["msgId"]?.GetValue<string>();
        var userId = req["userId"]?.GetValue<string>();
        var seconds = req["seconds"] is JsonValue sv && sv.TryGetValue<double>(out var sd) ? (int)sd : 0;

        if (platform != "twitch")
            throw new InvalidOperationException("Модерация пока поддержана только для Twitch");

        var token = _settings["botToken:twitch"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Сначала войдите через Twitch в разделе «Чат-бот»");

        var logPath = Path.Combine(Program.AppDir, "moderation.log");
        void Log(string text)
        {
            try { File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {text}{Environment.NewLine}"); }
            catch { }
        }

        // ОДИН переиспользуемый HttpClient на процесс: раньше на каждое
        // действие создавались новые клиенты и три подряд сетевых запроса —
        // отсюда «работает через раз» и http timeout.
        var http = TwitchHttp(token!);

        // 1) Валидация токена и scope кэшируется на 5 минут для того же токена.
        var (modId, tokenLogin, scopes) = await TwitchIdentityAsync(token!);

        string requiredScope = action switch
        {
            "delete" or "mode-clear" => "moderator:manage:chat_messages",
            "ban" or "timeout" or "unban" => "moderator:manage:banned_users",
            var m when m.StartsWith("mode-") => "moderator:manage:chat_settings",
            _ => "",
        };
        if (requiredScope.Length > 0 && !scopes.Contains(requiredScope))
            throw new InvalidOperationException($"В токене нет права {requiredScope} — выйдите из Twitch и войдите заново");

        // 2) ID пользователя по login через Helix (с кэшем, чтобы не ходить
        // в сеть на каждое действие).
        async Task<string> UserIdByLogin(string login)
        {
            login = login.Trim().ToLowerInvariant();
            if (login.Length == 0) return "";
            lock (_twitchUserIds)
                if (_twitchUserIds.TryGetValue(login, out var cached)) return cached;

            var r = await http.GetAsync($"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}");
            var body = await r.Content.ReadAsStringAsync();
            if (!r.IsSuccessStatusCode)
                throw new InvalidOperationException($"Twitch users API ({(int)r.StatusCode}): {body}");
            using var d = JsonDocument.Parse(body);
            if (!d.RootElement.TryGetProperty("data", out var arr) || arr.GetArrayLength() == 0) return "";
            var id = Net.FindString(arr[0], "id") ?? "";
            if (id.Length > 0) lock (_twitchUserIds) _twitchUserIds[login] = id;
            return id;
        }

        var broadcasterId = await UserIdByLogin(channel);
        if (broadcasterId.Length == 0)
            throw new InvalidOperationException($"Twitch не нашёл канал «{channel}»");
        if (modId.Length == 0)
            throw new InvalidOperationException("Twitch не вернул id авторизованного аккаунта");

        // Владелец канала — допустимый moderator_id. Для чужого канала аккаунт
        // должен быть модератором. Этот факт проверит сам Helix точным 403.
        if (string.IsNullOrWhiteSpace(userId) && author.Length > 0)
            userId = await UserIdByLogin(author);

        // Ограничение Twitch API: даже владелец НЕ МОЖЕТ удалить собственное
        // сообщение через Delete Chat Messages. Это не баг приложения.
        if (action == "delete" && userId == broadcasterId)
            throw new InvalidOperationException("Twitch запрещает удалять собственные сообщения владельца — проверьте на сообщении зрителя");

        var baseQuery =
            $"broadcaster_id={Uri.EscapeDataString(broadcasterId)}&moderator_id={Uri.EscapeDataString(modId)}";
        HttpResponseMessage res;
        string requestDesc;

        switch (action)
        {
            case "delete":
                if (string.IsNullOrWhiteSpace(msgId))
                    throw new InvalidOperationException("У сообщения нет id Twitch — переподключите канал и проверьте новое сообщение");
                requestDesc = $"DELETE chat message={msgId} channel={channel} moderator={tokenLogin}";
                res = await http.DeleteAsync(
                    $"https://api.twitch.tv/helix/moderation/chat?{baseQuery}&message_id={Uri.EscapeDataString(msgId)}");
                break;

            case "mode-clear":
                requestDesc = $"DELETE all chat channel={channel} moderator={tokenLogin}";
                res = await http.DeleteAsync($"https://api.twitch.tv/helix/moderation/chat?{baseQuery}");
                break;

            case "ban":
            case "timeout":
            {
                if (string.IsNullOrWhiteSpace(userId))
                    throw new InvalidOperationException($"Twitch не нашёл пользователя «{author}»");
                if (userId == broadcasterId)
                    throw new InvalidOperationException("Нельзя забанить владельца канала");
                var payload = action == "timeout"
                    ? $"{{\"data\":{{\"user_id\":\"{userId}\",\"duration\":{Math.Clamp(seconds, 1, 1_209_600)}}}}}"
                    : $"{{\"data\":{{\"user_id\":\"{userId}\"}}}}";
                requestDesc = $"POST {action} user={author} channel={channel} moderator={tokenLogin}";
                res = await http.PostAsync($"https://api.twitch.tv/helix/moderation/bans?{baseQuery}",
                    new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));
                break;
            }

            case "unban":
                if (string.IsNullOrWhiteSpace(userId)) userId = await UserIdByLogin(author);
                if (string.IsNullOrWhiteSpace(userId))
                    throw new InvalidOperationException($"Twitch не нашёл пользователя «{author}»");
                requestDesc = $"DELETE unban user={author} channel={channel} moderator={tokenLogin}";
                res = await http.DeleteAsync(
                    $"https://api.twitch.tv/helix/moderation/bans?{baseQuery}&user_id={Uri.EscapeDataString(userId)}");
                break;

            case "mode-slow":
            case "mode-emote":
            case "mode-followers":
            case "mode-subs":
            case "mode-slow-off":
            case "mode-emote-off":
            case "mode-followers-off":
            case "mode-subs-off":
            {
                var body = action switch
                {
                    "mode-slow" => $"{{\"slow_mode\":true,\"slow_mode_wait_time\":{Math.Clamp(seconds <= 0 ? 10 : seconds, 3, 1800)}}}",
                    "mode-slow-off" => "{\"slow_mode\":false}",
                    "mode-emote" => "{\"emote_mode\":true}",
                    "mode-emote-off" => "{\"emote_mode\":false}",
                    "mode-followers" => "{\"follower_mode\":true}",
                    "mode-followers-off" => "{\"follower_mode\":false}",
                    "mode-subs" => "{\"subscriber_mode\":true}",
                    _ => "{\"subscriber_mode\":false}",
                };
                requestDesc = $"PATCH {action} channel={channel} moderator={tokenLogin}";
                var patch = new HttpRequestMessage(HttpMethod.Patch,
                    $"https://api.twitch.tv/helix/chat/settings?{baseQuery}")
                {
                    Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
                };
                res = await http.SendAsync(patch);
                break;
            }

            default:
                throw new InvalidOperationException($"Неизвестное действие модерации {action}");
        }

        var responseBody = await res.Content.ReadAsStringAsync();
        Log($"{requestDesc} -> {(int)res.StatusCode} {responseBody}");
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Twitch ({(int)res.StatusCode}): {responseBody}");

        // Это событие подтверждено реальным успешным HTTP-ответом Twitch (204/200).
        _win.SendEvent("moderation.result", new
        {
            ok = true, action, platform, channel, msgId, userId, author,
        });
        return new { ok = true, status = (int)res.StatusCode };
    }

    /* ---------- settings.json ---------- */
    private void LoadSettings()
    {
        try
        {
            if (File.Exists(_settingsPath))
                _settings = JsonNode.Parse(File.ReadAllText(_settingsPath)) as JsonObject ?? new JsonObject();
        }
        catch { _settings = new JsonObject(); }
    }

    private void SaveSettings()
    {
        try { File.WriteAllText(_settingsPath, _settings.ToJsonString(new JsonSerializerOptions { WriteIndented = true })); }
        catch { /* readonly fs и т.п. — не критично */ }
    }

    private int IntSetting(string key, int fallback) =>
        _settings.TryGetPropertyValue(key, out var n) && n is JsonValue v && v.TryGetValue<int>(out var i) ? i : fallback;

    /* ---------- утилиты аргументов ---------- */
    private static JsonNode? ToNode(object? v)
    {
        if (v is JsonElement el) return el.ValueKind == JsonValueKind.Undefined || el.ValueKind == JsonValueKind.Null ? null : JsonNode.Parse(el.GetRawText());
        if (v is JsonNode n) return n;
        return v == null ? null : JsonValue.Create(v);
    }
    private static string? Str(object?[] a, int i) =>
        a.ElementAtOrDefault(i) is JsonElement el && el.ValueKind == JsonValueKind.String ? el.GetString() : null;
    private static bool Bool(object?[] a, int i) =>
        a.ElementAtOrDefault(i) is JsonElement el && el.ValueKind == JsonValueKind.True;
    private static int Int(object?[] a, int i) =>
        a.ElementAtOrDefault(i) is JsonElement el && el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var n) ? n : 0;

    public void Dispose()
    {
        try { _chatFlushTimer.Dispose(); } catch { }
        while (_chatPending.TryDequeue(out _)) { }
        _connectors.Dispose();
        _tts.Dispose();
        _edge.Dispose();
        _widget.Dispose();
        _overlay?.ForceClose();
        lock (_twitchHttpGate)
        {
            try { _twitchHttp?.Dispose(); } catch { }
            _twitchHttp = null;
            _twitchHttpToken = "";
        }
        lock (_twitchUserIds) _twitchUserIds.Clear();
    }
}
