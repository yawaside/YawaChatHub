using System.Diagnostics;
using System.Text.Json;

namespace YawaChatHub;

/// <summary>
/// Коннектор TikTok LIVE через проверенный модуль `tiktok-live-connector`
/// (запускается скрытым Node-процессом, см. tiktok-bridge/bridge.js).
///
/// Модуль протестирован на живых эфирах: чат, подарки, подписки, лайки, входы,
/// зрители и эмодзи (включая эмодзи в никах) приходят стабильно, без cookies,
/// логина и браузера. Подпись WebSocket-URL модуль берёт на себя.
///
/// Протокол: по одной JSON-строке в stdin/stdout.
/// </summary>
public sealed class TikTokNodeBridge : IDisposable
{
    private readonly string _user;
    private readonly Action<string, string> _onMessage;   // (автор, текст)
    private readonly Action<bool, int> _onStatus;          // (в эфире, зрители)
    private Process? _proc;
    private readonly string _logPath = Path.Combine(Program.AppDir, "tiktok-node.log");

    /// Прокси (http://host:port или socks5://host:port) — обязателен в регионах,
    /// где TikTok заблокирован (в РФ tiktok.com недоступен с местных IP).
    public static string Proxy = "";

    public TikTokNodeBridge(string user, Action<string, string> onMessage, Action<bool, int> onStatus)
    {
        _user = user.Trim().TrimStart('@');
        _onMessage = onMessage;
        _onStatus = onStatus;
    }

    private void Log(string line)
    {
        try { File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}\n"); }
        catch { }
    }

    /// Каталог моста: node_modules рядом с exe или в корне репозитория.
    private static string? FindBridgeDir()
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

    private static string FindNode()
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(dir.Trim(), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }
        return "node";
    }

    public Task RunAsync(CancellationToken ct)
    {
        var dir = FindBridgeDir();
        if (dir == null)
        {
            // ВАЖНО: бросаем исключение, а не «успешное завершение». Иначе
            // менеджер коннекторов считал бы подключение завершённым и
            // никогда не пробовал снова.
            Log("мост tiktok-bridge не найден (нет node_modules)");
            throw new InvalidOperationException("tiktok-bridge не найден");
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
            throw new InvalidOperationException("Node.js не запущен: " + ex.Message);
        }

        var p = _proc!;
        Log($"мост запущен (pid {p.Id}) для канала {_user}");

        // команда подключения (+ прокси, если задан в настройках)
        var cmdLine = JsonSerializer.Serialize(new { type = "connect", user = _user, proxy = Proxy });
        _ = Task.Run(async () =>
        {
            try
            {
                await p.StandardInput.WriteLineAsync(cmdLine);
                await p.StandardInput.FlushAsync();
            }
            catch { }
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

                    switch (type)
                    {
                        case "chat":
                        {
                            var author = root.TryGetProperty("author", out var a) ? a.GetString() ?? "" : "";
                            var text = root.TryGetProperty("text", out var x) ? x.GetString() ?? "" : "";
                            if (text.Length > 0) _onMessage(author, text);
                            break;
                        }
                        case "status":
                        {
                            var status = root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";
                            var viewers = root.TryGetProperty("viewers", out var v) && v.TryGetInt32(out var vi) ? vi : 0;
                            _onStatus(status == "online", viewers);
                            break;
                        }
                        case "event":
                        {
                            var author = root.TryGetProperty("author", out var a2) ? a2.GetString() ?? "" : "";
                            var text = root.TryGetProperty("text", out var x2) ? x2.GetString() ?? "" : "";
                            if (text.Length > 0) _onMessage(author, text);
                            break;
                        }
                        case "log":
                        {
                            var msg = root.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "";
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
            try
            {
                if (!p.HasExited)
                {
                    try { p.StandardInput?.Close(); } catch { }
                    if (!p.WaitForExit(2000)) p.Kill();
                }
            }
            catch { }
            try { p.Dispose(); } catch { }
            tcs.TrySetResult();
        });
        p.Exited += (_, _) => tcs.TrySetResult();
        p.EnableRaisingEvents = true;

        return tcs.Task;
    }

    public void Dispose()
    {
        try
        {
            if (_proc is { HasExited: false })
            {
                try { _proc.StandardInput?.Close(); } catch { }
                if (!_proc.WaitForExit(2000)) _proc.Kill();
            }
            _proc?.Dispose();
        }
        catch { }
    }
}
