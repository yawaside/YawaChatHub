using System.Drawing;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace YawaChatHub;

/// <summary>
/// Игровой оверлей: второе окно WebView2 поверх всех окон, прозрачное и
/// «клик-сквозь» (аналог electron-окна с setIgnoreMouseEvents).
/// Живая страница — тот же рендерер по адресу #/overlay.
/// </summary>
public sealed class OverlayWindow : Form
{
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly HostApi _api;
    private bool _clickThrough = true;
    private bool _freePosition;
    private bool _locked;
    private JsonObject? _pendingConfig;   // конфиг, пришедший до готовности WebView2
    private JsonNode? _lastStats;
    private readonly Queue<string> _pendingEvents = new();
    private readonly object _eventGate = new();
    private bool _ready;

    /* --- нативное перетаскивание по курсору --- */
    private readonly System.Windows.Forms.Timer _dragTimer = new() { Interval = 15 };
    private bool _dragging;
    private Point _grabOffset;
    /* --- изменение размера окна за края (запускает страница оверлея) --- */
    private bool _resizing;
    private string _resizeDir = "";
    private Point _resizeStart;
    private Size _resizeBase;

    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT lpPoint);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x20, WS_EX_LAYERED = 0x80000,
                      WS_EX_TOOLWINDOW = 0x80, WS_EX_TOPMOST = 0x8, WS_EX_NOACTIVATE = 0x8000000;
    private const int VK_LBUTTON = 0x01;

    public OverlayWindow(HostApi api)
    {
        _api = api;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        var scr = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Bounds = new Rectangle(scr.Right - 420, scr.Top + 24, 400, scr.Height / 2);
        BackColor = Color.Black;
        TransparencyKey = Color.Black;
        Controls.Add(_web);

        // ПЕРЕТАСКИВАНИЕ: WebView2 создаёт дочернее окно, которое забирает себе
        // все сообщения мыши — поэтому WM_NCHITTEST/HTCAPTION у формы не срабатывает.
        // Надёжное решение: опрашиваем позицию курсора и состояние ЛКМ напрямую.
        _dragTimer.Tick += (_, _) => DragTick();

        Load += async (_, _) =>
        {
            // общее окружение из AppData (иначе окно создаёт профиль рядом с exe)
            await _web.EnsureCoreWebView2Async(await Program.WebViewEnvAsync());
            _web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _web.DefaultBackgroundColor = Color.Transparent;

            // ВАЖНО: окно оверлея тоже должно общаться с хостом (settings.get и пр.),
            // иначе страница не получает свои настройки и работает на умолчаниях.
            _web.CoreWebView2.WebMessageReceived += (_, e) =>
            {
                try
                {
                    using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                    var root = doc.RootElement;
                    var method = root.GetProperty("method").GetString() ?? "";
                    var id = root.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0;
                    var args = root.TryGetProperty("args", out var a)
                        ? a.EnumerateArray().Select(x => (object?)x.Clone()).ToArray()
                        : Array.Empty<object?>();
                    _ = _api.DispatchAsync(id, method, args, Reply);
                }
                catch { /* мусорные сообщения игнорируем */ }
            };

            _web.CoreWebView2.NavigationCompleted += (_, _) =>
            {
                _ready = true;
                if (_pendingConfig != null) Forward("overlay.config", _pendingConfig);
                if (_lastStats != null) Forward("overlay.stats", _lastStats);

                string[] queued;
                lock (_eventGate)
                {
                    queued = _pendingEvents.ToArray();
                    _pendingEvents.Clear();
                }
                foreach (var json in queued)
                {
                    try { _web.CoreWebView2.PostWebMessageAsJson(json); } catch { }
                }
            };
            _web.CoreWebView2.Navigate(Program.RendererUrl(false, "/overlay"));
            UpdateExStyle();
        };
        VisibleChanged += (_, _) =>
        {
            try
            {
                if (_web.CoreWebView2 != null)
                    _web.CoreWebView2.MemoryUsageTargetLevel = Visible
                        ? CoreWebView2MemoryUsageTargetLevel.Normal
                        : CoreWebView2MemoryUsageTargetLevel.Low;
            }
            catch { }
        };
        FormClosing += (_, e) => { if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } };
    }

    /// Ответ на JSON-RPC вызов страницы оверлея.
    public void Reply(int id, bool ok, object? result, string? error)
    {
        if (_web.CoreWebView2 == null) return;
        var payload = JsonSerializer.Serialize(new { id, ok, result, error });
        BeginInvoke(() =>
        {
            try { _web.CoreWebView2?.PostWebMessageAsJson(payload); } catch { }
        });
    }

    /// <summary>
    /// ГЛОБАЛЬНЫЙ ОПРОС МЫШИ — единственный надёжный способ управлять окном.
    ///
    /// Почему нельзя ловить клики по окну: TransparencyKey делает прозрачные
    /// пиксели «дырявыми» для мыши на уровне Windows, поэтому клики проходят
    /// сквозь весь оверлей. Перетаскивание и ресайз определяются ТОЛЬКО по
    /// позиции курсора и состоянию ЛКМ. Таймер активен в интерактивном режиме
    /// и полностью остановлен при сквозном клике (0% CPU).
    /// </summary>
    private void DragTick()
    {
        if (!GetCursorPos(out var pr)) return;
        var cur = new Point(pr.X, pr.Y);
        bool held = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;

        // --- идёт изменение размера ---
        if (_resizing)
        {
            if (held)
            {
                if (_dragTimer.Interval != 15) _dragTimer.Interval = 15;
                var dx = cur.X - _resizeStart.X;
                var dy = cur.Y - _resizeStart.Y;
                var w = _resizeDir.Contains('e') ? _resizeBase.Width + dx : _resizeBase.Width;
                var h = _resizeDir.Contains('s') ? _resizeBase.Height + dy : _resizeBase.Height;
                var scr = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
                Size = new Size(Math.Clamp(w, 240, scr.Width), Math.Clamp(h, 90, scr.Height - 40));
            }
            else
            {
                _resizing = false;
                _resizeDir = "";
                _dragTimer.Interval = 100;
                SizeChangedByUser?.Invoke(Width, Height);
            }
            return;
        }

        // --- идёт перетаскивание ---
        if (_dragging)
        {
            if (held)
            {
                if (_dragTimer.Interval != 15) _dragTimer.Interval = 15;
                Location = new Point(cur.X - _grabOffset.X, cur.Y - _grabOffset.Y);
            }
            else
            {
                _dragging = false;
                _dragTimer.Interval = 100;
                PositionChanged?.Invoke(Left, Top);
            }
            return;
        }

        // --- ничего не происходит: ищем начало действия внутри окна ---
        if (!held || !Bounds.Contains(cur)) return;

        int relX = cur.X - Left;
        int relY = cur.Y - Top;
        bool nearRight = Width - relX <= ResizeZone;
        bool nearBottom = Height - relY <= ResizeZone;

        if (nearRight || nearBottom)
        {
            _resizing = true;
            _resizeDir = (nearRight ? "e" : "") + (nearBottom ? "s" : "");
            _resizeStart = cur;
            _resizeBase = Size;
        }
        else
        {
            _dragging = true;
            _grabOffset = new Point(relX, relY);
        }
    }

    /// Ширина зоны захвата края окна, px
    private const int ResizeZone = 12;

    /// <summary>
    /// Применить конфиг из рендерера.
    /// ВАЖНО: прозрачность окна всегда 1 — за прозрачность отвечает ПОДЛОЖКА
    /// внутри страницы (rgba), поэтому текст остаётся полностью чётким
    /// даже при подложке 0%.
    /// </summary>
    public void Apply(JsonNode? cfg)
    {
        if (cfg is not JsonObject o) return;
        _pendingConfig = (JsonObject)o.DeepClone();

        if (o.TryGetPropertyValue("clickThrough", out var ct) && ct is JsonValue cv && cv.TryGetValue<bool>(out var b))
            _clickThrough = b;

        // геометрия: угол экрана + отступы + ширина, либо свободная позиция
        var corner = o.TryGetPropertyValue("corner", out var cr) ? cr?.GetValue<string>() ?? "top-left" : "top-left";
        int width = ReadInt(o, "width", 400);
        int offX = ReadInt(o, "offsetX", 16);
        int offY = ReadInt(o, "offsetY", 16);
        int fontSize = ReadInt(o, "fontSize", 14);
        int maxMsg = ReadInt(o, "maxMessages", 6);
        bool showStats = !o.TryGetPropertyValue("showStats", out var ss) || (ss as JsonValue)?.GetValue<bool>() != false;
        _freePosition = o.TryGetPropertyValue("freePosition", out var fp) && (fp as JsonValue)?.GetValue<bool>() == true;
        _locked = o.TryGetPropertyValue("locked", out var lk) && (lk as JsonValue)?.GetValue<bool>() == true;

        var scr = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        // Высота — САМОСТОЯТЕЛЬНАЯ настройка окна. Раньше она считалась из
        // размера шрифта и числа сообщений, поэтому окно скакало при правке
        // содержимого строки. Значение по умолчанию — только для первого запуска.
        int fallbackHeight = (int)((maxMsg + (showStats ? 1.4 : 0)) * (fontSize * 2.35) + 28);
        int height = ReadInt(o, "height", fallbackHeight);
        height = Math.Clamp(height, 90, scr.Height - 40);
        width = Math.Clamp(width, 240, scr.Width);

        // Позиция сохраняется ВСЕГДА: больше не сбрасываем окно в угол
        // при выключении свободного перемещения.
        int px = ReadInt(o, "posX", Left > 0 ? Left : scr.Left + 24);
        int py = ReadInt(o, "posY", Top > 0 ? Top : scr.Top + 24);
        px = Math.Clamp(px, scr.Left - width + 80, scr.Right - 80);
        py = Math.Clamp(py, scr.Top - 10, scr.Bottom - 60);
        Bounds = new Rectangle(px, py, width, height);

        Opacity = 1;
        SetMovable(_freePosition && !_locked && !_clickThrough);
        UpdateExStyle();

        if (_ready) Forward("overlay.config", _pendingConfig);
    }

    /// <summary>
    /// Режим перемещения. КЛЮЧЕВОЙ МОМЕНТ: обычно окно использует chroma-key
    /// (TransparencyKey), из-за чего прозрачные пиксели пропускают мышь НАСКВОЗЬ —
    /// схватить оверлей невозможно даже без WS_EX_TRANSPARENT.
    /// Поэтому на время перетаскивания chroma-key отключается: окно становится
    /// сплошным прямоугольником, который ловит мышь. После фиксации всё возвращается.
    /// </summary>
    private void SetMovable(bool movable)
    {
        BackColor = Color.Black;
        TransparencyKey = Color.Black;
        Opacity = 1;
        if (movable)
        {
            // в ожидании — 10 опросов/сек; во время движения DragTick
            // временно поднимает частоту до 15 мс для плавности
            _dragTimer.Interval = 100;
            _dragTimer.Start();
        }
        else
        {
            // сквозной клик или фиксация: таймер полностью остановлен — 0% CPU
            _dragging = false;
            _resizing = false;
            _dragTimer.Stop();
        }
    }

    public void BeginDrag()
    {
        if (_locked || !_freePosition || _clickThrough) return;
        if (!GetCursorPos(out var p)) return;
        _dragging = true;
        _grabOffset = new Point(p.X - Left, p.Y - Top);
        _dragTimer.Start();
    }

    /// <summary>
    /// Начать изменение размера окна за край ("e", "s", "se").
    /// Вызывается при зажатии ЛКМ над зоной края.
    /// </summary>
    public void BeginResize(string dir)
    {
        if (_locked || _clickThrough) return;
        if (!GetCursorPos(out var p)) return;
        _resizing = true;
        _resizeDir = string.IsNullOrEmpty(dir) ? "se" : dir;
        _resizeStart = new Point(p.X, p.Y);
        _resizeBase = Size;
        _dragTimer.Start();
    }

    /// Пользователь изменил размер окна — хост сохранит его в настройках.
    public event Action<int, int>? SizeChangedByUser;

    /// Окно оверлея никогда не забирает фокус у игры.
    protected override bool ShowWithoutActivation => true;

    /// Вернуть окно в центр основного экрана.
    public void CenterOnScreen()
    {
        var scr = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Location = new Point(scr.Left + (scr.Width - Width) / 2, scr.Top + (scr.Height - Height) / 2);
        PositionChanged?.Invoke(Left, Top);
    }

    /// Хост подписывается, чтобы сохранить posX/posY в settings.json.
    public event Action<int, int>? PositionChanged;

    /// Статистика площадок для шапки оверлея (донаты первыми).
    public void SetStats(JsonNode? stats)
    {
        _lastStats = stats?.DeepClone();
        if (_ready && _lastStats != null) Forward("overlay.stats", _lastStats);
    }

    private static int ReadInt(JsonObject o, string key, int fallback) =>
        o.TryGetPropertyValue(key, out var n) && n is JsonValue v && v.TryGetValue<double>(out var d)
            ? (int)Math.Round(d)
            : fallback;

    /// Событие странице оверлея. Вызывается из потоков коннекторов,
    /// поэтому всегда переключаемся в UI-поток окна.
    public void Forward(string type, object payload)
    {
        var json = JsonSerializer.Serialize(new { @event = type, payload });
        if (!_ready)
        {
            lock (_eventGate)
            {
                // Не теряем сообщения, пришедшие в момент загрузки страницы.
                _pendingEvents.Enqueue(json);
                while (_pendingEvents.Count > 100) _pendingEvents.Dequeue();
            }
            return;
        }
        if (IsDisposed || !IsHandleCreated) return;
        try
        {
            BeginInvoke(() =>
            {
                try { _web.CoreWebView2?.PostWebMessageAsJson(json); } catch { }
            });
        }
        catch { /* окно закрывается */ }
    }

    public void ForceClose() { FormClosing -= null; Dispose(); }

    private void UpdateExStyle()
    {
        int ex = GetWindowLong(Handle, GWL_EXSTYLE);
        // NOACTIVATE — окно не перехватывает фокус у полноэкранной игры
        ex |= WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE;
        ex = _clickThrough ? ex | WS_EX_TRANSPARENT : ex & ~WS_EX_TRANSPARENT;
        SetWindowLong(Handle, GWL_EXSTYLE, ex);
    }
}

/// <summary>
/// Сервер виджета для OBS Browser Source (замена electron-сервера виджета):
/// отдаёт страницу #/widget и стримит сообщения по SSE /widget/events.
/// </summary>
public sealed class WidgetServer : IDisposable
{
    private HttpListener? _listener;
    private CancellationTokenSource? _cts;
    private readonly List<HttpListenerResponse> _sseClients = new();
    public int Port = 8085;
    public bool Running => _listener?.IsListening == true;

    public void Start(int port)
    {
        try
        {
            Port = port;
            _cts = new CancellationTokenSource();
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
            _listener.Start();
            _ = Task.Run(() => Loop(_cts.Token));
        }
        catch { /* порт занят — виджет недоступен, приложение живёт дальше */ }
    }

    private async Task Loop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener!.GetContextAsync(); }
            catch { return; }
            _ = Task.Run(() => Serve(ctx));
        }
    }

    private async Task Serve(HttpListenerContext ctx)
    {
        var path = ctx.Request.Url?.AbsolutePath ?? "/";
        try
        {
            // Локальный MP3 озвучки: браузер OBS читает его напрямую,
            // без Base64/JSON и лишнего декодирования большой SSE-строки.
            if (path.StartsWith("/widget/tts/", StringComparison.OrdinalIgnoreCase))
            {
                var id = path["/widget/tts/".Length..].Trim('/');
                byte[]? audio;
                lock (_ttsAudio) _ttsAudio.TryGetValue(id, out audio);
                if (audio == null)
                {
                    ctx.Response.StatusCode = 404;
                    ctx.Response.Close();
                    return;
                }
                ctx.Response.ContentType = "audio/mpeg";
                ctx.Response.Headers.Add("Cache-Control", "no-store");
                ctx.Response.ContentLength64 = audio.Length;
                await ctx.Response.OutputStream.WriteAsync(audio);
                ctx.Response.Close();
                return;
            }

            if (path.StartsWith("/widget/events"))
            {
                ctx.Response.ContentType = "text/event-stream";
                ctx.Response.Headers.Add("Cache-Control", "no-cache");
                lock (_sseClients) _sseClients.Add(ctx.Response);
                // Новый источник OBS сразу получает текущее оформление,
                // поэтому ссылка остаётся постоянной, а настройки — живыми.
                if (_lastConfig != null) SendTo(ctx.Response, "widget.config", _lastConfig);
                return; // соединение держим открытым
            }

            // dist собран single-file — обслуживаемый файл всегда один: index.html
            RendererFiles.EnsureExtracted();
            var local = Path.GetFullPath(Path.Combine(RendererFiles.Dir, "index.html"));
            if (!File.Exists(local))
            {
                ctx.Response.StatusCode = 404;
                ctx.Response.Close();
                return;
            }
            var bytes = await File.ReadAllBytesAsync(local);
            // Холст Browser Source ВСЕГДА прозрачный: тёмный фон из index.html
            // перекрываем до запуска React, иначе OBS показывает чёрный прямоугольник.
            const string injection =
                "<style id=\"yawa-widget-transparent\">" +
                "html,body,#root,#boot{background:transparent!important;background-color:transparent!important}" +
                "#boot{display:none!important}" +
                "</style>" +
                "<script>if(!location.hash.startsWith('#/widget'))location.hash='#/widget'+location.search</script>";
            var html = Encoding.UTF8.GetString(bytes).Replace("</head>", injection + "</head>");
            bytes = Encoding.UTF8.GetBytes(html);

            ctx.Response.ContentType = "text/html; charset=utf-8";
            // OBS не должен держать старую страницу после обновления приложения
            ctx.Response.Headers.Add("Cache-Control", "no-store, no-cache, must-revalidate");
            ctx.Response.ContentLength64 = bytes.Length;
            await ctx.Response.OutputStream.WriteAsync(bytes);
            ctx.Response.Close();
        }
        catch { try { ctx.Response.Abort(); } catch { } }
    }

    private object? _lastConfig;
    /* Последние три TTS-файла для OBS: короткий локальный URL вместо Base64
       в SSE. Память строго ограничена, старые файлы удаляются. */
    private readonly Dictionary<string, byte[]> _ttsAudio = new();
    private readonly Queue<string> _ttsOrder = new();

    /// Оформление виджета → всем источникам БЕЗ смены ссылки в OBS.
    public void BroadcastConfig(object? cfg)
    {
        if (cfg == null) return;
        _lastConfig = cfg;
        Push("widget.config", cfg);
    }

    /// <summary>
    /// Озвучка текста сообщения → в источник OBS Browser Source по SSE.
    /// Когда в OBS включена опция «Управлять аудио через OBS», эта озвучка
    /// попадает в микшер OBS и слышна на стриме.
    /// </summary>
    public void BroadcastTts(byte[] mp3Bytes, int volumePercent)
    {
        if (mp3Bytes.Length == 0) return;
        var id = Guid.NewGuid().ToString("N");
        lock (_ttsAudio)
        {
            _ttsAudio[id] = mp3Bytes;
            _ttsOrder.Enqueue(id);
            while (_ttsOrder.Count > 3)
            {
                var old = _ttsOrder.Dequeue();
                _ttsAudio.Remove(old);
            }
        }
        var vol = Math.Clamp(volumePercent / 100.0, 0.0, 1.0);
        Push("tts.audio", new { url = $"/widget/tts/{id}", volume = vol });
    }

    private static void SendTo(HttpListenerResponse response, string type, object payload)
    {
        try
        {
            var data = $"data: {JsonSerializer.Serialize(new { @event = type, payload })}\n\n";
            var bytes = Encoding.UTF8.GetBytes(data);
            response.OutputStream.Write(bytes);
            response.OutputStream.Flush();
        }
        catch { }
    }

    /// Новое сообщение чата → всем открытым OBS-источникам.
    public void Broadcast(object message) => Push("chat.message", message);

    public void Push(string type, object payload)
    {
        var data = $"data: {JsonSerializer.Serialize(new { @event = type, payload })}\n\n";
        var bytes = Encoding.UTF8.GetBytes(data);
        List<HttpListenerResponse> dead = new();
        lock (_sseClients)
        {
            foreach (var r in _sseClients)
            {
                try { r.OutputStream.Write(bytes); r.OutputStream.Flush(); }
                catch { dead.Add(r); }
            }
            foreach (var d in dead) _sseClients.Remove(d);
        }
    }

    public void Dispose()
    {
        _cts?.Cancel();
        try { _listener?.Stop(); } catch { }
        lock (_ttsAudio)
        {
            _ttsAudio.Clear();
            _ttsOrder.Clear();
        }
    }
}
