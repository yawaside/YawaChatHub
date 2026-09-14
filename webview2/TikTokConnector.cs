using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Text.Json;

namespace YawaChatHub;

/// <summary>
/// Единственный коннектор TikTok LIVE.
///
/// Чат читается модулем `tiktok-live-connector` — ровно тем же путём, что
/// работает в YawaChat_Hub (Electron-сборка). Модуль ставится в
/// tiktok-bridge/node_modules и запускается скрытым Node-процессом
/// (tiktok-bridge/bridge.js), потому что подпись webcast-сокета реализована
/// только в этой библиотеке.
///
/// Собственные пути (скрытое окно WebView2, самописный WebSocket, ручной
/// разбор protobuf) УДАЛЕНЫ: они находили комнату, но push-сокет молчал и чат
/// не приходил. Оставлен один проверенный путь.
///
/// Протокол с мостом: по одной JSON-строке в stdin/stdout.
/// </summary>
public sealed class TikTokConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private Process? _proc;
    private readonly string _logPath = Path.Combine(Program.AppDir, "tiktok.log");

    public TikTokConnector(string user, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = NormalizeUser(user);
        _emit = emit;
        _status = status;
    }

    /// Принимаем @name, name, name/live и ссылку на эфир — как в мосте.
    private static string NormalizeUser(string? raw)
    {
        var user = (raw ?? "").Trim();
        var m = System.Text.RegularExpressions.Regex.Match(user, @"tiktok\.com/@([^/?#]+)",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success) user = m.Groups[1].Value;
        user = user.TrimStart('@');
        var cut = user.IndexOfAny(new[] { '/', '?', '&', '#' });
        if (cut >= 0) user = user[..cut];
        return user.Trim();
    }

    private void Log(string line)
    {
        try { File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}\n"); }
        catch { /* лог не критичен */ }
    }

    /// Готовый каталог моста: рядом с exe или в корне репозитория (dev-запуск).
    private static string? FindReadyBridgeDir()
    {
        var exe = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(exe, "tiktok-bridge"),
            Path.Combine(Directory.GetParent(exe)?.FullName ?? exe, "tiktok-bridge"),
            Path.Combine(Directory.GetCurrentDirectory(), "tiktok-bridge"),
        };
        foreach (var dir in candidates)
            if (Directory.Exists(dir) && Directory.Exists(Path.Combine(dir, "node_modules")))
                return Path.GetFullPath(dir);
        return null;
    }

    /// <summary>
    /// Релиз — это один exe, рядом с ним каталога моста нет. Мост и Node.js
    /// ВСТРОЕНЫ в сборку: runtime\tiktok-bridge.zip (bridge.js + package.json +
    /// готовый node_modules) и runtime\node.exe генерирует scripts/bundle-runtime.mjs
    /// на CI и они лежат ресурсами внутри exe. Разворачиваем их в
    /// %LOCALAPPDATA%\YawaChatHub\tiktok-bridge — на ПК пользователя
    /// Node.js/Python/Java ставить не нужно.
    /// </summary>
    private string? EnsureBridgeDir()
    {
        var ready = FindReadyBridgeDir();
        if (ready != null) return ready;

        var dir = Path.Combine(Program.AppDir, "tiktok-bridge");

        // Основной путь релиза: встроенный архив с готовыми модулями.
        if (ExtractBundledBridge(dir)) return dir;

        // Запасной путь dev-сборки (архив не встроен): как раньше —
        // bridge.js + package.json из ресурсов и npm install системным Node.
        Directory.CreateDirectory(dir);

        if (!ExtractResource("yawa-tiktok-bridge.js", Path.Combine(dir, "bridge.js")) ||
            !ExtractResource("yawa-tiktok-package.json", Path.Combine(dir, "package.json")))
        {
            Log("мост не встроен в сборку");
            return null;
        }

        if (Directory.Exists(Path.Combine(dir, "node_modules"))) return dir;

        Log("первый запуск: ставим tiktok-live-connector (npm install)");
        if (!RunNpmInstall(dir))
        {
            Log("npm install не выполнен — проверьте, что установлен Node.js");
            return null;
        }
        return Directory.Exists(Path.Combine(dir, "node_modules")) ? dir : null;
    }

    /// Каталог встроенного рантайма: %LOCALAPPDATA%\YawaChatHub\runtime.
    private static string RuntimeDir => Path.Combine(Program.AppDir, "runtime");

    /// <summary>
    /// Node.js встроен в exe ресурсом yawa-node.exe. Извлекаем его один раз
    /// в AppDir\runtime под именем YawaChatHub.exe: совпадение имени образа с
    /// основным процессом заставляет диспетчер задач сворачивать фоновый
    /// модуль в общую ветку приложения (раньше рядом висел отдельный «Node.js»).
    /// При смене размера (другая версия Node в новой сборке) файл
    /// перезаписывается. Возвращает путь к exe или null, если ресурс в эту
    /// сборку не встроен (dev-запуск).
    /// </summary>
    private string? EnsureBundledNode()
    {
        try
        {
            using var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("yawa-node.exe");
            if (res == null) return null;
            using var ms = new MemoryStream();
            res.CopyTo(ms);
            var bytes = ms.ToArray();

            Directory.CreateDirectory(RuntimeDir);
            var target = Path.Combine(RuntimeDir, "YawaChatHub.exe");
            if (!File.Exists(target) || new FileInfo(target).Length != bytes.Length)
            {
                Log("разворачиваем встроенный рантайм TikTok (" + bytes.Length / 1024 / 1024 + " МБ)");
                File.WriteAllBytes(target, bytes);
            }
            return target;
        }
        catch (Exception ex)
        {
            Log("встроенный Node не извлёкся: " + ex.Message);
            return null;
        }
    }

    /// <summary>
    /// Мост TikTok встроен в exe одним zip-архивом (ресурс yawa-tiktok-bridge.zip):
    /// bridge.js, манифесты и ГОТОВЫЙ node_modules с tiktok-live-connector.
    /// Разворачиваем один раз; маркер .bundled-version (размер архива)
    /// заставляет переизвлечь мост при обновлении exe. Возвращает false,
    /// если архив в сборку не встроен.
    /// </summary>
    private bool ExtractBundledBridge(string dir)
    {
        try
        {
            using var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("yawa-tiktok-bridge.zip");
            if (res == null) return false;
            using var ms = new MemoryStream();
            res.CopyTo(ms);
            var bytes = ms.ToArray();

            Directory.CreateDirectory(dir);
            var stamp = bytes.Length.ToString();
            var marker = Path.Combine(dir, ".bundled-version");
            if (File.Exists(marker) && File.ReadAllText(marker).Trim() == stamp &&
                Directory.Exists(Path.Combine(dir, "node_modules")))
                return true;

            Log("разворачиваем встроенный tiktok-bridge (" + bytes.Length / 1024 + " КБ)");
            // чистим каталог целиком: удаляет и следы старого npm-варианта
            try { Directory.Delete(dir, recursive: true); } catch { /* ещё не создан */ }
            Directory.CreateDirectory(dir);
            using (var zip = new ZipArchive(new MemoryStream(bytes, writable: false), ZipArchiveMode.Read))
                zip.ExtractToDirectory(dir);
            File.WriteAllText(marker, stamp);

            var ok = Directory.Exists(Path.Combine(dir, "node_modules"));
            if (!ok) Log("архив моста распакован без node_modules — архив повреждён");
            return ok;
        }
        catch (Exception ex)
        {
            Log("встроенный мост не развернулся: " + ex.Message);
            return false;
        }
    }

    /// Пишем ресурс только при изменении размера — лишние записи не нужны.
    private static bool ExtractResource(string resource, string target)
    {
        using var res = System.Reflection.Assembly.GetExecutingAssembly()
            .GetManifestResourceStream(resource);
        if (res == null) return false;
        using var ms = new MemoryStream();
        res.CopyTo(ms);
        var bytes = ms.ToArray();
        if (!File.Exists(target) || new FileInfo(target).Length != bytes.Length)
            File.WriteAllBytes(target, bytes);
        return true;
    }

    private bool RunNpmInstall(string dir)
    {
        // npm в Windows — это npm.cmd, поэтому запускаем через cmd.exe
        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c npm install --omit=dev --no-audit --no-fund",
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        try
        {
            using var np = Process.Start(psi);
            if (np == null) return false;

            // Потоки читаем асинхронно: без этого буфер пайпа переполняется
            // на длинном выводе npm и процесс зависает до таймаута.
            var err = new System.Text.StringBuilder();
            np.OutputDataReceived += (_, _) => { };
            np.ErrorDataReceived += (_, e) =>
            {
                if (e.Data != null && err.Length < 2000) err.AppendLine(e.Data);
            };
            np.BeginOutputReadLine();
            np.BeginErrorReadLine();

            // установка модуля с зависимостями занимает до пары минут
            if (!np.WaitForExit(240_000)) { try { np.Kill(true); } catch { /* noop */ } return false; }
            if (np.ExitCode != 0)
                Log("npm install: код " + np.ExitCode + " " + err.ToString().Trim());
            return np.ExitCode == 0;
        }
        catch (Exception ex)
        {
            Log("npm install: " + ex.Message);
            return false;
        }
    }

    /// Встроенный Node.js в приоритете; системный в PATH — запасной вариант
    /// (dev-запуск или сборка, куда runtime не встроили).
    private string FindNode()
    {
        var bundled = EnsureBundledNode();
        if (bundled != null) return bundled;

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(dir.Trim(), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { /* битый элемент PATH */ }
        }
        return "node";
    }

    private void Push(string author, string text, string kind, double? amount = null) =>
        _emit(new ChatEvent
        {
            platform = "tiktok",
            channel = _user,
            author = author,
            text = text,
            kind = kind,
            amount = amount,
        });

    public Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        if (_user.Length == 0)
        {
            _status("error", 0);
            throw new InvalidOperationException("TikTok: не указан username канала");
        }

        var dir = EnsureBridgeDir();
        if (dir == null)
        {
            // Бросаем исключение, а не «успешное завершение»: иначе менеджер
            // счёл бы подключение закрытым и не пробовал бы снова.
            Log("мост tiktok-bridge недоступен (нет node_modules)");
            _status("error", 0);
            throw new InvalidOperationException(
                "TikTok: встроенный мост tiktok-bridge не развернулся и системный Node.js не найден");
        }

        var psi = new ProcessStartInfo
        {
            FileName = FindNode(),
            Arguments = "bridge.js",
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = false,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
        };

        try { _proc = Process.Start(psi); }
        catch (Exception ex)
        {
            Log("не удалось запустить Node: " + ex.Message);
            _status("error", 0);
            throw new InvalidOperationException("Node.js не запущен: " + ex.Message);
        }

        var p = _proc!;
        Log($"мост запущен (pid {p.Id}) для канала @{_user}");

        var live = false;
        var lastViewers = 0;

        // команда подключения
        _ = Task.Run(async () =>
        {
            try
            {
                await p.StandardInput.WriteLineAsync(
                    JsonSerializer.Serialize(new { type = "connect", user = _user }));
                await p.StandardInput.FlushAsync();
            }
            catch { /* мост уже закрыт */ }
        }, ct);

        // чтение событий моста
        _ = Task.Run(async () =>
        {
            string? line;
            while (!ct.IsCancellationRequested && (line = await p.StandardOutput.ReadLineAsync(ct)) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;
                    var type = root.TryGetProperty("type", out var t) ? t.GetString() : "";
                    string Str(string name) =>
                        root.TryGetProperty(name, out var v) ? v.GetString() ?? "" : "";

                    switch (type)
                    {
                        case "chat":
                        {
                            var text = Str("text");
                            if (text.Length == 0) break;
                            // первое сообщение = гарантированный признак живого эфира
                            if (!live) { live = true; _status("online", lastViewers); }
                            Push(Str("author"), text, "chat");
                            break;
                        }
                        case "event":
                        {
                            var text = Str("text");
                            if (text.Length == 0) break;
                            var kindRaw = Str("kind");
                            // gift → donate (алмазы показываются как сумма),
                            // остальное — системные события ленты
                            var kind = kindRaw switch
                            {
                                "gift" => "donate",
                                "sub" => "sub",
                                _ => "system",
                            };
                            double? amount = null;
                            if (kindRaw == "gift" && root.TryGetProperty("amount", out var a)
                                && a.ValueKind == JsonValueKind.Number)
                                amount = a.GetDouble();
                            Push(Str("author"), text, kind, amount);
                            break;
                        }
                        case "status":
                        {
                            var status = Str("status");
                            var viewers = root.TryGetProperty("viewers", out var v)
                                && v.TryGetInt32(out var vi) ? vi : 0;
                            if (viewers > 0) lastViewers = viewers;
                            live = status == "online";
                            // offline/error пробрасываем как есть — менеджер
                            // покажет реальное состояние канала в списке
                            _status(status.Length > 0 ? status : "connected",
                                    live ? lastViewers : 0);
                            break;
                        }
                        case "ready":
                            Log($"комната найдена: {Str("roomId")}");
                            break;
                        case "log":
                        {
                            var msg = Str("message");
                            if (msg.Length > 0) Log(msg);
                            break;
                        }
                    }
                }
                catch { /* мусорная строка */ }
            }
        }, ct);

        // держим коннектор живым, пока работает мост или его не отменят
        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        ct.Register(() =>
        {
            StopProcess(p);
            tcs.TrySetResult();
        });
        p.Exited += (_, _) => tcs.TrySetResult();
        p.EnableRaisingEvents = true;

        return tcs.Task;
    }

    private static void StopProcess(Process p)
    {
        try
        {
            if (!p.HasExited)
            {
                try { p.StandardInput?.Close(); } catch { /* пайп закрыт */ }
                if (!p.WaitForExit(2000)) p.Kill();
            }
        }
        catch { /* процесс уже умер */ }
        try { p.Dispose(); } catch { /* noop */ }
    }

    public void Dispose()
    {
        var p = _proc;
        _proc = null;
        if (p != null) StopProcess(p);
    }
}
