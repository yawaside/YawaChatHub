using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace YawaChatHub;

/// <summary>
/// Проверка компонентов, без которых приложение не запустится.
///
/// Сейчас внешний компонент ровно один — <b>Microsoft Edge WebView2 Runtime</b>
/// (движок, который рисует весь интерфейс). Node.js и модули TikTok встроены
/// в exe, .NET тоже (self-contained сборка), поэтому отдельных проверок для
/// них не нужно.
///
/// Раньше при отсутствии WebView2 приложение падало с системным окном
/// необработанного исключения — пользователь видел стек .NET и ничего не
/// понимал. Теперь показывается человеческое окно с кнопкой «Установить»,
/// которое само скачивает официальный установщик Microsoft и ставит компонент.
/// </summary>
internal static class Prerequisites
{
    /// Официальный Evergreen Bootstrapper (≈2 МБ): сам определяет разрядность
    /// системы и ставит подходящий Runtime. Ссылка «Get the Link» из
    /// документации Microsoft по распространению WebView2.
    public const string BootstrapperUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    /// Страница ручной загрузки для пользователя (если авто-установка не прошла).
    public const string ManualDownloadUrl =
        "https://developer.microsoft.com/microsoft-edge/webview2/consumer/";

    /// Версия Runtime, ниже которой приложение предлагает обновиться.
    /// Это НЕ жёсткое требование: работать обычно будет и на более старой,
    /// поэтому показываем мягкое предупреждение с кнопкой «Продолжить».
    private const string RecommendedVersion = "100.0.0.0";

    /// GUID клиента WebView2 Runtime в EdgeUpdate (из документации Microsoft).
    private const string RuntimeClientId = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    public sealed record WebView2State(bool Installed, string Version, bool Outdated);

    /// <summary>
    /// Определение WebView2 Runtime двумя официальными способами:
    /// 1) GetAvailableBrowserVersionString (API загрузчика);
    /// 2) ключ pv в EdgeUpdate\Clients\{...} — per-machine и per-user.
    /// Второй способ нужен, когда рядом с exe нет WebView2Loader.dll или API
    /// бросает исключение на «урезанных» сборках Windows.
    /// </summary>
    public static WebView2State Detect()
    {
        var version = "";

        try { version = CoreWebView2Environment.GetAvailableBrowserVersionString() ?? ""; }
        catch { version = ""; }

        if (!IsRealVersion(version)) version = ReadRegistryVersion();
        if (!IsRealVersion(version)) return new WebView2State(false, "", false);

        return new WebView2State(true, version, IsOlderThan(version, RecommendedVersion));
    }

    private static bool IsRealVersion(string? v) =>
        !string.IsNullOrWhiteSpace(v) && v.Trim() != "0.0.0.0";

    private static string ReadRegistryVersion()
    {
        // 64-битная и 32-битная ветки, машинная и пользовательская установка
        string[] subKeys =
        {
            @"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\" + RuntimeClientId,
            @"SOFTWARE\Microsoft\EdgeUpdate\Clients\" + RuntimeClientId,
        };

        foreach (var hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
        {
            foreach (var sub in subKeys)
            {
                try
                {
                    using var key = hive.OpenSubKey(sub);
                    var pv = key?.GetValue("pv") as string;
                    if (IsRealVersion(pv)) return pv!.Trim();
                }
                catch { /* нет доступа к ветке реестра — пробуем следующую */ }
            }
        }
        return "";
    }

    private static bool IsOlderThan(string version, string other)
    {
        try { return CoreWebView2Environment.CompareBrowserVersions(version, other) < 0; }
        catch { return false; }
    }

    /// <summary>
    /// Главная точка: вызывается до создания окна приложения.
    /// Возвращает true, если можно запускаться, и false, если пользователь
    /// закрыл окно установки (тогда приложение просто выходит без падения).
    /// </summary>
    public static bool EnsureReady()
    {
        var state = Detect();
        if (state.Installed && !state.Outdated) return true;

        using var dialog = new PrerequisiteWindow(state);
        dialog.ShowDialog();
        return dialog.CanContinue;
    }
}

/// <summary>
/// Окно «нужен компонент» в тёмном стиле приложения. Написано на чистом
/// WinForms и НЕ использует WebView2 — иначе его нельзя было бы показать
/// как раз в том случае, ради которого оно существует.
/// </summary>
internal sealed class PrerequisiteWindow : Form
{
    private static readonly Color Bg = Color.FromArgb(14, 15, 26);
    private static readonly Color Panel = Color.FromArgb(22, 24, 38);
    private static readonly Color Line = Color.FromArgb(40, 44, 66);
    private static readonly Color TextMain = Color.FromArgb(232, 234, 245);
    private static readonly Color TextDim = Color.FromArgb(150, 156, 184);
    private static readonly Color Accent = Color.FromArgb(124, 92, 255);
    private static readonly Color Danger = Color.FromArgb(248, 113, 113);
    private static readonly Color Ok = Color.FromArgb(74, 222, 128);

    private readonly Prerequisites.WebView2State _state;
    private readonly Label _status = new();
    private readonly ProgressBar _progress = new();
    private readonly Button _install = new();
    private readonly Button _manual = new();
    private readonly Button _recheck = new();
    private readonly Button _exit = new();

    /// true — компонент на месте (или пользователь решил продолжить).
    public bool CanContinue { get; private set; }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

    public PrerequisiteWindow(Prerequisites.WebView2State state)
    {
        _state = state;

        Text = "YawaChatHub — требуется компонент";
        Icon = MainWindow.AppIcon;
        BackColor = Bg;
        ForeColor = TextMain;
        Font = new Font("Segoe UI", 9F);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = true;
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(560, 330);

        BuildLayout();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // тёмная системная рамка, чтобы окно не выглядело «белой заплаткой»
        try
        {
            var dark = 1;
            DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref dark, sizeof(int));
        }
        catch { /* старые сборки Windows — не критично */ }
    }

    private void BuildLayout()
    {
        var outdated = _state.Installed && _state.Outdated;

        /* ---------- заголовок ---------- */
        var title = new Label
        {
            Text = outdated
                ? "Компонент Microsoft Edge WebView2 устарел"
                : "Не хватает компонента Microsoft Edge WebView2",
            ForeColor = TextMain,
            Font = new Font("Segoe UI Semibold", 13F, FontStyle.Bold),
            AutoSize = false,
            Bounds = new Rectangle(70, 22, 470, 30),
        };

        var subtitle = new Label
        {
            Text = outdated
                ? $"Установлена версия {_state.Version} — рекомендуем обновить."
                : "Без него приложение не может отобразить интерфейс.",
            ForeColor = outdated ? Color.FromArgb(251, 191, 36) : Danger,
            AutoSize = false,
            Bounds = new Rectangle(70, 52, 470, 20),
        };

        // цветной кружок-индикатор вместо иконки — рисуется всегда одинаково
        var badge = new Panel { Bounds = new Rectangle(24, 26, 32, 32), BackColor = Bg };
        badge.Paint += (_, e) =>
        {
            e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var brush = new SolidBrush(outdated ? Color.FromArgb(251, 191, 36) : Danger);
            using var font = new Font("Segoe UI", 16F, FontStyle.Bold);
            e.Graphics.FillEllipse(brush, 0, 0, 31, 31);
            TextRenderer.DrawText(e.Graphics, "!", font, new Rectangle(0, 2, 31, 29),
                Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        };

        /* ---------- пояснение ---------- */
        var body = new Label
        {
            Text = outdated
                ? "YawaChatHub рисует окно, оверлей и виджет через Microsoft Edge WebView2. " +
                  "Старая версия может работать нестабильно: возможны пустое окно, пропавший " +
                  "оверлей или сбои озвучки.\r\n\r\n" +
                  "Нажмите «Обновить» — приложение скачает официальный установщик Microsoft " +
                  "(около 2 МБ) и обновит компонент. Можно продолжить и без обновления."
                : "YawaChatHub рисует окно, оверлей и виджет через Microsoft Edge WebView2. " +
                  "В Windows 11 он есть по умолчанию, но на этом компьютере компонент не найден.\r\n\r\n" +
                  "Нажмите «Установить» — приложение скачает официальный установщик Microsoft " +
                  "(около 2 МБ) и всё сделает само. Интернет нужен только на время установки.",
            ForeColor = TextDim,
            AutoSize = false,
            Bounds = new Rectangle(24, 86, 512, 96),
        };

        /* ---------- прогресс и статус ---------- */
        _progress.Bounds = new Rectangle(24, 190, 512, 6);
        _progress.Style = ProgressBarStyle.Continuous;
        _progress.Minimum = 0;
        _progress.Maximum = 100;
        _progress.Visible = false;
        _progress.ForeColor = Accent;

        _status.Bounds = new Rectangle(24, 202, 512, 40);
        _status.ForeColor = TextDim;
        _status.AutoSize = false;
        _status.Text = "";

        /* ---------- кнопки ---------- */
        StyleButton(_install, outdated ? "Обновить" : "Установить", primary: true);
        _install.Bounds = new Rectangle(24, 256, 150, 40);
        _install.Click += async (_, _) => await RunInstallAsync();

        StyleButton(_manual, "Скачать вручную", primary: false);
        _manual.Bounds = new Rectangle(184, 256, 140, 40);
        _manual.Click += (_, _) => OpenUrl(Prerequisites.ManualDownloadUrl);

        StyleButton(_recheck, "Проверить снова", primary: false);
        _recheck.Bounds = new Rectangle(334, 256, 130, 40);
        _recheck.Click += (_, _) => Recheck(manual: true);

        StyleButton(_exit, outdated ? "Продолжить" : "Выход", primary: false);
        _exit.Bounds = new Rectangle(474, 256, 62, 40);
        if (outdated) _exit.ForeColor = Ok;
        _exit.Click += (_, _) =>
        {
            // «Продолжить» при устаревшей версии — запускаем приложение как есть
            CanContinue = outdated;
            Close();
        };

        Controls.AddRange(new Control[]
        {
            badge, title, subtitle, body, _progress, _status,
            _install, _manual, _recheck, _exit,
        });

        AcceptButton = _install;
    }

    private static void StyleButton(Button b, string text, bool primary)
    {
        b.Text = text;
        b.FlatStyle = FlatStyle.Flat;
        b.BackColor = primary ? Accent : Panel;
        b.ForeColor = primary ? Color.White : TextMain;
        b.FlatAppearance.BorderColor = primary ? Accent : Line;
        b.FlatAppearance.BorderSize = 1;
        b.Font = new Font("Segoe UI Semibold", 9F, primary ? FontStyle.Bold : FontStyle.Regular);
        b.Cursor = Cursors.Hand;
        b.UseVisualStyleBackColor = false;
    }

    private void SetBusy(bool busy)
    {
        _install.Enabled = !busy;
        _manual.Enabled = !busy;
        _recheck.Enabled = !busy;
        _progress.Visible = busy;
        Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
    }

    private void Say(string text, Color? color = null)
    {
        _status.ForeColor = color ?? TextDim;
        _status.Text = text;
        _status.Refresh();
    }

    /// Повторная проверка: после ручной установки или сообщения об ошибке.
    private void Recheck(bool manual)
    {
        var state = Prerequisites.Detect();
        if (state.Installed && !state.Outdated)
        {
            CanContinue = true;
            Say($"Компонент найден: версия {state.Version}. Запускаем…", Ok);
            Application.DoEvents();
            Thread.Sleep(650);
            Close();
            return;
        }

        if (state.Installed && state.Outdated)
        {
            Say($"Найдена версия {state.Version} — она устарела, но запустить приложение можно.",
                Color.FromArgb(251, 191, 36));
            return;
        }

        if (manual) Say("Компонент всё ещё не найден. Установите его и нажмите «Проверить снова».", Danger);
    }

    private async Task RunInstallAsync()
    {
        SetBusy(true);
        try
        {
            /* --- 1. скачиваем официальный bootstrapper --- */
            Say("Загрузка установщика Microsoft…");
            _progress.Value = 0;

            var file = Path.Combine(Path.GetTempPath(),
                $"MicrosoftEdgeWebview2Setup_{Environment.ProcessId}.exe");

            try
            {
                await DownloadAsync(Prerequisites.BootstrapperUrl, file);
            }
            catch (Exception ex)
            {
                Say("Не удалось скачать установщик: " + Short(ex.Message) +
                    "\r\nПроверьте интернет или нажмите «Скачать вручную».", Danger);
                SetBusy(false);
                return;
            }

            /* --- 2. тихая установка --- */
            Say("Установка компонента… Это может занять пару минут.");
            _progress.Style = ProgressBarStyle.Marquee;

            var code = await RunSetupAsync(file, elevated: false);

            // Ненулевой код — частая причина: нужны права администратора.
            // Пробуем ещё раз с запросом UAC, а не сдаёмся молча.
            if (code != 0)
            {
                Say("Требуются права администратора — подтвердите запрос Windows…");
                code = await RunSetupAsync(file, elevated: true);
            }

            _progress.Style = ProgressBarStyle.Continuous;
            _progress.Value = 100;
            try { File.Delete(file); } catch { /* временный файл — не критично */ }

            /* --- 3. проверяем результат --- */
            var state = Prerequisites.Detect();
            if (state.Installed)
            {
                CanContinue = true;
                Say($"Готово! Установлена версия {state.Version}. Запускаем приложение…", Ok);
                Application.DoEvents();
                await Task.Delay(900);
                Close();
                return;
            }

            Say(code == 1223
                    ? "Установка отменена в окне Windows. Нажмите «Установить» ещё раз."
                    : $"Установка не завершилась (код {code}). Попробуйте «Скачать вручную».",
                Danger);
            SetBusy(false);
        }
        catch (Exception ex)
        {
            _progress.Style = ProgressBarStyle.Continuous;
            Say("Ошибка установки: " + Short(ex.Message), Danger);
            SetBusy(false);
        }
    }

    /// Загрузка с индикатором прогресса (bootstrapper небольшой, но сеть бывает медленной).
    private async Task DownloadAsync(string url, string target)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("YawaChatHub");

        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength ?? 0L;
        await using var input = await response.Content.ReadAsStreamAsync();
        await using var output = File.Create(target);

        var buffer = new byte[81920];
        long done = 0;
        int read;
        while ((read = await input.ReadAsync(buffer)) > 0)
        {
            await output.WriteAsync(buffer.AsMemory(0, read));
            done += read;
            if (total > 0)
            {
                var percent = (int)Math.Clamp(done * 100 / total, 0, 100);
                if (percent != _progress.Value) _progress.Value = percent;
            }
        }
    }

    /// <summary>
    /// Запуск bootstrapper'а. Без прав администратора ставится per-user,
    /// с правами — per-machine (оба варианта официально поддержаны).
    /// </summary>
    private static Task<int> RunSetupAsync(string file, bool elevated)
    {
        return Task.Run(() =>
        {
            try
            {
                var psi = new ProcessStartInfo(file, "/silent /install")
                {
                    UseShellExecute = elevated,
                    CreateNoWindow = true,
                };
                if (elevated) psi.Verb = "runas";

                using var p = Process.Start(psi);
                if (p == null) return -1;
                p.WaitForExit(10 * 60 * 1000);
                return p.HasExited ? p.ExitCode : -1;
            }
            catch (System.ComponentModel.Win32Exception w) { return w.NativeErrorCode; } // 1223 = UAC отменён
            catch { return -1; }
        });
    }

    private static string Short(string s) => s.Length <= 120 ? s : s[..120] + "…";

    private static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { /* браузер по умолчанию не настроен */ }
    }
}

/// <summary>
/// Человеческое окно вместо системного дампа .NET при неожиданной ошибке.
/// Если причина — отсутствующий WebView2, сразу переводит на окно установки.
/// </summary>
internal static class CrashDialog
{
    private static bool _shown;

    public static void Show(Exception? ex)
    {
        if (_shown) return;           // не плодим окна на каскаде ошибок
        _shown = true;

        var message = ex?.Message ?? "неизвестная ошибка";

        // Типовой случай: движок WebView2 удалили/сломали уже после старта.
        if (IsWebView2Problem(ex))
        {
            if (Prerequisites.EnsureReady())
            {
                MessageBox.Show(
                    "Компонент WebView2 установлен. Запустите YawaChatHub ещё раз.",
                    "YawaChatHub", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            Environment.Exit(0);
            return;
        }

        try
        {
            var log = Path.Combine(Program.AppDir, "crash.log");
            File.AppendAllText(log,
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {ex}\n\n");

            MessageBox.Show(
                "YawaChatHub столкнулся с ошибкой и будет закрыт.\n\n" +
                message + "\n\n" +
                "Подробности сохранены в файл:\n" + log,
                "YawaChatHub — ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch { /* даже окно показать не вышло — просто выходим */ }

        Environment.Exit(1);
    }

    /// Ошибки, означающие «движка WebView2 нет или он нерабочий».
    public static bool IsWebView2Problem(Exception? ex)
    {
        for (var e = ex; e != null; e = e.InnerException)
        {
            if (e is WebView2RuntimeNotFoundException) return true;
            if (e is DllNotFoundException d &&
                d.Message.Contains("WebView2Loader", StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}
