using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace YawaChatHub;

/// <summary>
/// Точка входа WebView2-оболочки. Заменяет desktop/electron/main.js:
/// то же безрамочное окно, тот же интерфейс (Vite-сборка → renderer/index.html),
/// трей, глобальные хоткеи, перетаскивание за кастомную шапку.
/// </summary>
internal static class Program
{
    public static readonly string AppDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YawaChatHub");

    [STAThread]
    private static void Main()
    {
        // Как в рабочем релизе v1.2.4: не переопределяем глобально фон и
        // browser-arguments WebView2 — OverlayWindow сам задаёт прозрачность.
        // ВСЕ дочерние процессы (msedgewebview2.exe оверлея, окна приложения,
        // виджет-сервера и пр.) привязываем к job-объекту с флагом
        // KILL_ON_JOB_CLOSE: когда наш процесс завершается — любым способом,
        // включая аварийный, — Windows гарантированно закрывает и их.
        // Иначе после выхода в диспетчере оставались висеть процессы WebView2.
        ChildProcessJob.AttachCurrentProcess();
        // одна запись «YawaChatHub» в диспетчере вместо россыпи процессов
        ChildProcessJob.SetAppUserModelId();

        ApplicationConfiguration.Initialize();
        Directory.CreateDirectory(AppDir);
        Directory.CreateDirectory(Path.Combine(AppDir, "webview2")); // user data folder WebView2
        Application.Run(new MainWindow());

        // Подстраховка на случай, что живы фоновые потоки коннекторов/TTS:
        // закрываем процесс целиком, job добьёт дочерние.
        Environment.Exit(0);
    }

    /// <summary>
    /// ЕДИНОЕ окружение WebView2 для всех окон приложения.
    /// Без него каждое окно создаёт папку профиля РЯДОМ С EXE
    /// (YawaChatHub.exe.WebView2) — теперь все данные живут в AppData.
    /// </summary>
    private static Task<CoreWebView2Environment>? _envTask;
    public static Task<CoreWebView2Environment> WebViewEnvAsync()
    {
        // ЕДИНЫЙ процесс движка для всех окон: без этих флагов каждое окно
        // (главное, оверлей) поднимало собственный набор msedgewebview2.exe,
        // и в диспетчере они выглядели как несвязанные процессы.
        var options = new CoreWebView2EnvironmentOptions
        {
            // Безопасный минимум процессов: один рендерер, один процесс на
            // сайт, без расширений. GPU/аудио/сеть оставляем штатными —
            // принудительный in-process режим может ломать OBS и WebView2.
            AdditionalBrowserArguments =
                "--renderer-process-limit=1 " +
                "--process-per-site " +
                "--disable-site-isolation-trials " +
                "--disable-extensions " +
                "--disable-component-extensions-with-background-pages " +
                "--disable-sync --no-first-run " +
                // КРИТИЧНО для TikTok-ридера: его окно невидимо, и без этих
                // флагов Chromium помечает его как occluded и ПОЛНОСТЬЮ
                // останавливает рендеринг — DOM не обновляется, чат не приходит.
                // На видимое главное окно эти флаги не влияют.
                "--disable-backgrounding-occluded-windows " +
                "--disable-renderer-backgrounding",
        };

        return _envTask ??= CoreWebView2Environment.CreateAsync(
            browserExecutableFolder: null,
            userDataFolder: Path.Combine(AppDir, "webview2"),
            options: options);
    }

    /// Расположение интерфейса: встроенный в exe рендерер, извлечённый в AppDir,
    /// либо dev-сервер Vite при --dev.
    public static string RendererUrl(bool dev, string fragment = "/app")
    {
        if (dev) return $"http://localhost:5173/#{fragment}";
        return RendererFiles.IndexFileUri() + "#" + fragment;
    }
}

/// <summary>
/// Job-объект Windows: всё, что запустит приложение (процессы WebView2 окна,
/// оверлея, виджета), умирает вместе с ним. Работает и при штатном выходе,
/// и при снятии задачи, поэтому «хвостов» в диспетчере не остаётся.
/// </summary>
internal static class ChildProcessJob
{
    private static IntPtr _job = IntPtr.Zero;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string? name);
    [DllImport("kernel32.dll")]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll")]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }

    /// <summary>
    /// Явная группировка в диспетчере задач. Windows объединяет процессы в
    /// одну запись по AppUserModelID: без него msedgewebview2.exe показывался
    /// отдельными строками, а не под YawaChatHub.
    /// </summary>
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SetCurrentProcessExplicitAppUserModelID(
        [MarshalAs(UnmanagedType.LPWStr)] string appID);

    public static void SetAppUserModelId()
    {
        try { SetCurrentProcessExplicitAppUserModelID("YawaChatHub"); }
        catch { /* старые системы — не критично */ }
    }

    public static void AttachCurrentProcess()
    {
        try
        {
            _job = CreateJobObject(IntPtr.Zero, null);
            if (_job == IntPtr.Zero) return;

            var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            int size = Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
            var ptr = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(info, ptr, false);
                SetInformationJobObject(_job, JobObjectExtendedLimitInformation, ptr, (uint)size);
                AssignProcessToJobObject(_job, GetCurrentProcess());
            }
            finally { Marshal.FreeHGlobal(ptr); }
        }
        catch { /* среда без поддержки job-объектов — не критично */ }
    }
}

/// <summary>
/// Интерфейс встроен в exe как EmbeddedResource (Vite собирает единый index.html).
/// Перед первым запуском извлекаем его в %LOCALAPPDATA%\YawaChatHub\renderer\ —
/// благодаря этому zip с одним YawaChatHub.exe полностью самодостаточен.
/// </summary>
internal static class RendererFiles
{
    private const string ResourceName = "yawa-renderer-index.html";

    public static string Dir => Path.Combine(Program.AppDir, "renderer");
    public static string ExtractedPath => Path.Combine(Dir, "index.html");

    /// file://-URI через Uri.AbsoluteUri — корректно кодирует пробелы и кириллицу в пути профиля.
    public static string IndexFileUri() => new Uri(EnsureExtracted()).AbsoluteUri;

    public static string EnsureExtracted()
    {
        Directory.CreateDirectory(Dir);
        var target = ExtractedPath;

        using var res = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                "Интерфейс не встроен в exe: выполните 'npm run build' перед 'dotnet publish'.");
        using var ms = new MemoryStream();
        res.CopyTo(ms);
        var bytes = ms.ToArray();

        // перезаписываем только если сборка интерфейса изменилась (добавляем 1 байт-соль от размера)
        if (!File.Exists(target) || new FileInfo(target).Length != bytes.Length)
            File.WriteAllBytes(target, bytes);

        return target;
    }
}

public sealed class MainWindow : Form
{
    private readonly WebView2 _web = new()
    {
        Dock = DockStyle.Fill,
        // цвет приложения вместо белого фона до первой отрисовки
        DefaultBackgroundColor = Color.FromArgb(10, 11, 19),
    };
    private readonly HostApi _api;
    private readonly NotifyIcon _tray;
    private bool _closeToTray;
    private readonly bool _startHidden;

    // ---- Win32 ----
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    // Скругление окна: DWM на Windows 11, Region — запасной путь на Windows 10.
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int w, int h);

    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWCP_ROUND = 2;
    /// Толщина полосы формы вокруг WebView2 — за неё тянется ресайз.
    private const int ResizeBorder = 6;
    private const int CornerRadius = 12;

    private const int WM_NCLBUTTONDOWN = 0xA1, HTCAPTION = 0x2, WM_HOTKEY = 0x0312, WM_NCHITTEST = 0x84;

    public MainWindow()
    {
        bool dev = Environment.GetCommandLineArgs().Contains("--dev");
        _startHidden = Environment.GetCommandLineArgs().Contains("--hidden");

        Text = "YawaChatHub";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1180, 760);
        MinimumSize = new Size(880, 560);
        Icon = AppIcon;
        // окно не показываем, пока интерфейс не отрисован (см. InitWeb)
        Opacity = 0;
        FormBorderStyle = FormBorderStyle.None; // окно без системной рамки
        BackColor = Color.FromArgb(10, 11, 19);
        // WebView2 накрывает форму целиком и забирает мышь, поэтому оставляем
        // тонкую полосу самой формы по периметру — именно она ловит ресайз.
        Padding = new Padding(ResizeBorder);
        Controls.Add(_web);

        _api = new HostApi(this, _web);

        // трей (аналог electron.tray)
        _tray = new NotifyIcon
        {
            Text = "YawaChatHub — чат всех стримов",
            Icon = AppIcon ?? SystemIcons.Application,
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip()
        };
        _tray.ContextMenuStrip.Items.Add("Показать", null, (_, _) => RestoreFromTray());
        _tray.ContextMenuStrip.Items.Add("Выход", null, (_, _) => { _closeToTray = false; Close(); });
        _tray.DoubleClick += (_, _) => RestoreFromTray();

        Load += async (_, _) => await InitWeb(dev);
        Shown += (_, _) => ApplyRoundedCorners();
        Resize += (_, _) => ApplyRoundedCorners();
        // Пока пользователь в игре/OBS, UI неактивен: официальный Low-режим
        // сбрасывает лишние кэши/RAM, не останавливая JS и коннекторы.
        Activated += (_, _) => SetWebMemoryTarget(true);
        Deactivate += (_, _) => SetWebMemoryTarget(false);
        VisibleChanged += (_, _) => SetWebMemoryTarget(Visible && ContainsFocus);
        FormClosing += (_, e) =>
        {
            // «крестик» → трей, если включено в настройках интерфейса
            if (_closeToTray && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
            else
            {
                ShutdownEverything();
            }
        };
        // Выход из Windows/сеанса тоже должен гасить оверлей, виджет и коннекторы
        Application.ApplicationExit += (_, _) => ShutdownEverything();
    }

    private bool _shutdownDone;

    /// <summary>
    /// Полное завершение: трей, окно оверлея, сервер виджета, коннекторы
    /// площадок, TTS и процессы WebView2. Вызывается один раз при любом
    /// сценарии выхода; остальное добивает job-объект процесса.
    /// </summary>
    private void ShutdownEverything()
    {
        if (_shutdownDone) return;
        _shutdownDone = true;

        try { _tray.Visible = false; _tray.Dispose(); } catch { }
        try { _api.Dispose(); } catch { }
        try { _web.Dispose(); } catch { }
    }

    public void SetCloseToTray(bool v) => _closeToTray = v;

    private void SetWebMemoryTarget(bool active)
    {
        try
        {
            if (_web.CoreWebView2 == null) return;
            _web.CoreWebView2.MemoryUsageTargetLevel = active
                ? CoreWebView2MemoryUsageTargetLevel.Normal
                : CoreWebView2MemoryUsageTargetLevel.Low;
        }
        catch { }
    }

    /// Иконка приложения из встроенного ресурса (одна для exe, окна и трея).
    private static Icon? _appIcon;
    public static Icon? AppIcon
    {
        get
        {
            if (_appIcon != null) return _appIcon;
            try
            {
                using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("yawa-icon.ico");
                if (s != null) _appIcon = new Icon(s);
            }
            catch { }
            return _appIcon;
        }
    }

    /// <summary>Скруглённые углы окна.</summary>
    // Углы настраиваются ОДИН раз: DWM запоминает настройку, а событие Resize
    // приходит десятки раз в секунду при перетаскивании — раньше каждый вызов
    // заново ставил атрибут DWM и создавал GDI-регион, что грузило CPU.
    private bool _cornersApplied;
    private void ApplyRoundedCorners()
    {
        if (!IsHandleCreated || _cornersApplied) return;

        if (WindowState == FormWindowState.Maximized)
        {
            Region = null;
            Padding = new Padding(0);
            return;
        }

        Padding = new Padding(ResizeBorder);

        var preference = DWMWCP_ROUND;
        var dwmOk = false;
        try
        {
            dwmOk = DwmSetWindowAttribute(
                Handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref preference, sizeof(int)) == 0;
        }
        catch { }

        if (dwmOk) { Region = null; _cornersApplied = true; return; }

        try
        {
            var rgn = CreateRoundRectRgn(0, 0, Width, Height, CornerRadius * 2, CornerRadius * 2);
            if (rgn != IntPtr.Zero)
            {
                Region = System.Drawing.Region.FromHrgn(rgn);
                _cornersApplied = true;
            }
        }
        catch { }
    }

    private async Task InitWeb(bool dev)
    {
        await _web.EnsureCoreWebView2Async(await Program.WebViewEnvAsync());

        var s = _web.CoreWebView2.Settings;
        s.AreDefaultContextMenusEnabled = dev;
        s.AreDefaultScriptDialogsEnabled = false;
        s.IsStatusBarEnabled = false;
        s.AreDevToolsEnabled = dev;
        s.IsZoomControlEnabled = false;
        // ГЛАВНОЕ: гасим браузерные сочетания WebView2 (Ctrl+Shift+G — поиск,
        // Ctrl+F, Ctrl+P, Ctrl+R и пр.). В приложении их быть не должно.
        s.AreBrowserAcceleratorKeysEnabled = false;
        s.IsGeneralAutofillEnabled = false;
        s.IsPasswordAutosaveEnabled = false;

        // перетаскивание окна за кастомную шапку рендерера (.drag-region)
        await _web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("""
            document.addEventListener('mousedown', (e) => {
              if (e.button !== 0) return;
              const drag = e.target.closest && e.target.closest('.drag-region');
              if (!drag) return;
              if (e.target.closest('.no-drag, button, input, select, a, [role="button"]')) return;
              window.chrome.webview.postMessage({ method: 'window.drag' });
            });
        """);

        // ЗАЩИТА ОТ «ПУСТОГО ОКНА»: рендерер не должен никуда уходить со своей страницы.
        // Любая посторонняя навигация (submit формы, внешняя ссылка) отменяется,
        // http/https-адреса открываются в браузере по умолчанию.
        _web.CoreWebView2.NavigationStarting += (_, e) =>
        {
            var target = e.Uri ?? "";
            var allowed = target.StartsWith("file:", StringComparison.OrdinalIgnoreCase)
                          || target.StartsWith("http://localhost:5173", StringComparison.OrdinalIgnoreCase)
                          || target.StartsWith("about:", StringComparison.OrdinalIgnoreCase);
            if (allowed) return;
            e.Cancel = true;
            if (target.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                try { System.Diagnostics.Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); } catch { }
        };
        _web.CoreWebView2.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            if (!string.IsNullOrEmpty(e.Uri))
                try { System.Diagnostics.Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
        };
        // если процесс рендерера упал — перезагружаем интерфейс, а не оставляем пустое окно
        _web.CoreWebView2.ProcessFailed += (_, _) =>
        {
            try { _web.CoreWebView2.Navigate(Program.RendererUrl(dev)); } catch { }
        };

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
                _ = _api.DispatchAsync(id, method, args);
            }
            catch { /* мусорные сообщения игнорируем */ }
        };

        // ПЛАВНЫЙ СТАРТ: окно проявляется только когда интерфейс уже отрисован,
        // поэтому пустого белого окна на секунду больше нет.
        // ВАЖНО: DefaultBackgroundColor — свойство контрола WebView2,
        // у CoreWebView2 его нет.
        _web.DefaultBackgroundColor = Color.FromArgb(10, 11, 19);
        var shown = false;
        void reveal()
        {
            if (shown) return;
            shown = true;
            BeginInvoke(() =>
            {
                if (_startHidden) { Hide(); Opacity = 1; return; }
                Opacity = 1;
                Activate();
            });
        }
        _web.CoreWebView2.DOMContentLoaded += (_, _) => reveal();
        // страховка, если событие почему-то не придёт
        var failsafe = new System.Windows.Forms.Timer { Interval = 2500 };
        failsafe.Tick += (_, _) => { failsafe.Stop(); reveal(); };
        failsafe.Start();

        _web.CoreWebView2.Navigate(Program.RendererUrl(dev));
    }

    /// Ответ рендереру на JSON-RPC вызов (bridge.ts ждёт {id, ok, result}).
    public void Reply(int id, bool ok, object? result, string? error = null)
    {
        var payload = JsonSerializer.Serialize(new { id, ok, result, error });
        BeginInvoke(() =>
        {
            if (_web.CoreWebView2 != null) _web.CoreWebView2.PostWebMessageAsJson(payload);
        });
    }

    /// Событие от хоста к рендереру: hotkey, chat.message и т.п.
    public void SendEvent(string type, object? payload)
    {
        var json = JsonSerializer.Serialize(new { @event = type, payload });
        BeginInvoke(() =>
        {
            if (_web.CoreWebView2 != null) _web.CoreWebView2.PostWebMessageAsJson(json);
        });
    }

    public void BeginDrag()
    {
        ReleaseCapture();
        SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
    }

    public void ToggleMaximize() =>
        WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;

    private void RestoreFromTray() { Show(); WindowState = FormWindowState.Normal; Activate(); }

    // глобальные хоткеи (аналог electron globalShortcut)
    private readonly Dictionary<int, string> _hotkeys = new();
    /// Последняя карта клавиш: нужна для перерегистрации, если Windows
    /// пересоздаст дескриптор окна (тогда все прежние хоткеи теряются).
    private Dictionary<string, string> _hotkeyMap = new();

    public void ApplyHotkeys(Dictionary<string, string> map)
    {
        _hotkeyMap = new Dictionary<string, string>(map);
        RegisterHotkeys();
    }

    private void RegisterHotkeys()
    {
        if (!IsHandleCreated) return;   // до создания окна регистрация невозможна

        foreach (var id in _hotkeys.Keys) UnregisterHotKey(Handle, id);
        _hotkeys.Clear();

        var failed = new List<string>();
        int i = 9000;
        foreach (var (action, combo) in _hotkeyMap)
        {
            var (mod, vk) = KeyParser.Parse(combo);
            if (vk == 0) continue;
            // MOD_NOREPEAT (0x4000) — одно срабатывание на удержание
            if (RegisterHotKey(Handle, i, mod | 0x4000, vk)) _hotkeys[i] = action;
            else failed.Add($"{action}:{combo}");   // клавишу занял другой процесс
            i++;
        }

        // Раньше отказ регистрации проходил молча, и пользователь не понимал,
        // почему клавиша «не работает». Сообщаем в интерфейс.
        if (failed.Count > 0) SendEvent("hotkeys.failed", failed.ToArray());
    }

    /// Windows пересоздаёт дескриптор при смене стилей окна — регистрируем заново.
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (_hotkeyMap.Count > 0) BeginInvoke(RegisterHotkeys);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY && _hotkeys.TryGetValue(m.WParam.ToInt32(), out var action))
        {
            SendEvent("hotkey", action);
            return;
        }
        // ресайз безрамочного окна за края
        if (m.Msg == WM_NCHITTEST && WindowState == FormWindowState.Normal)
        {
            base.WndProc(ref m);
            if (m.Result == (IntPtr)1) // HTCLIENT
            {
                const int grip = ResizeBorder + 2;
                var p = PointToClient(Cursor.Position);
                int hit = 1;
                if (p.Y <= grip) hit = p.X <= grip ? 13 : p.X >= Width - grip ? 14 : 12;   // top
                else if (p.Y >= Height - grip) hit = p.X <= grip ? 16 : p.X >= Width - grip ? 17 : 15; // bottom
                else if (p.X <= grip) hit = 10;  // left
                else if (p.X >= Width - grip) hit = 11; // right
                m.Result = (IntPtr)hit;
            }
            return;
        }
        base.WndProc(ref m);
    }

    /// <summary>
    /// Разбор сочетания. Клавиша приходит как ФИЗИЧЕСКИЙ код (KeyG, Digit5,
    /// Numpad3, F9) — так хоткей не зависит от раскладки: русская «П» на той же
    /// клавише, что латинская «G», даёт один и тот же VK_G.
    /// </summary>
    private sealed class KeyParser
    {
        public static (uint mod, uint vk) Parse(string combo)
        {
            uint mod = 0, vk = 0;
            foreach (var part in combo.Split('+', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                switch (part.ToLowerInvariant())
                {
                    case "ctrl": case "control": mod |= 0x0002; break;  // MOD_CONTROL
                    case "alt": mod |= 0x0001; break;                   // MOD_ALT
                    case "shift": mod |= 0x0004; break;                 // MOD_SHIFT
                    case "meta": case "win": mod |= 0x0008; break;      // MOD_WIN
                    default: vk = KeyToVk(part); break;
                }
            }
            return (mod, vk);
        }

        private static uint KeyToVk(string key)
        {
            // физические коды браузера (KeyboardEvent.code)
            if (key.StartsWith("Key", StringComparison.OrdinalIgnoreCase) && key.Length == 4)
                return char.ToUpperInvariant(key[3]);                       // KeyG → VK_G
            if (key.StartsWith("Digit", StringComparison.OrdinalIgnoreCase) && key.Length == 6)
                return key[5];                                              // Digit5 → VK_5
            if (key.StartsWith("Numpad", StringComparison.OrdinalIgnoreCase) &&
                key.Length == 7 && char.IsDigit(key[6]))
                return (uint)(0x60 + (key[6] - '0'));                       // Numpad3 → VK_NUMPAD3
            if ((key.StartsWith('F') || key.StartsWith('f')) &&
                int.TryParse(key[1..], out int f) && f is >= 1 and <= 24)
                return (uint)(0x70 + f - 1);                                // F9 → VK_F9

            return key.ToLowerInvariant() switch
            {
                "space" => 0x20,
                "enter" => 0x0D,
                "tab" => 0x09,
                "escape" => 0x1B,
                "insert" => 0x2D,
                "delete" => 0x2E,
                "home" => 0x24,
                "end" => 0x23,
                "pageup" => 0x21,
                "pagedown" => 0x22,
                "arrowup" => 0x26,
                "arrowdown" => 0x28,
                "arrowleft" => 0x25,
                "arrowright" => 0x27,
                "backquote" => 0xC0,
                "minus" => 0xBD,
                "equal" => 0xBB,
                "bracketleft" => 0xDB,
                "bracketright" => 0xDD,
                "semicolon" => 0xBA,
                "quote" => 0xDE,
                "comma" => 0xBC,
                "period" => 0xBE,
                "slash" => 0xBF,
                "backslash" => 0xDC,
                _ => key.Length == 1 ? char.ToUpperInvariant(key[0]) : 0u,
            };
        }
    }
}
