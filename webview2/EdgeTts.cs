using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using NAudio.Wave;

namespace YawaChatHub;

/// <summary>
/// Microsoft Edge Read Aloud TTS. Реализация актуального протокола edge-tts:
/// Sec-MS-GEC, Chromium 143, MUID и новое соединение на каждую фразу.
/// Короткие сообщения чата синтезируются целиком и сразу проигрываются из
/// памяти через NAudio, без временных файлов и запуска внешнего плеера.
/// </summary>
public sealed class EdgeTts : IDisposable
{
    public sealed record Voice(string Id, string Title, string Gender);

    /// <summary>
    /// Все голоса Edge TTS для приложения. Названия — просто имена на русском:
    /// пользователь выбирает знакомое имя, технический id скрыт.
    /// Multilingual-голоса озвучивают русский текст без акцента.
    /// </summary>
    public static readonly Voice[] AllVoices =
    {
        // базовые русские
        new("ru-RU-SvetlanaNeural", "Светлана", "Female"),
        new("ru-RU-DmitryNeural", "Дмитрий", "Male"),

        // Multilingual — свободно говорят по-русски
        new("en-US-AvaMultilingualNeural", "Ава", "Female"),
        new("en-US-EmmaMultilingualNeural", "Эмма", "Female"),
        new("en-US-AndrewMultilingualNeural", "Эндрю", "Male"),
        new("en-US-BrianMultilingualNeural", "Брайан", "Male"),
        new("en-AU-WilliamMultilingualNeural", "Уильям", "Male"),
        new("fr-FR-VivienneMultilingualNeural", "Вивьен", "Female"),
        new("fr-FR-RemyMultilingualNeural", "Реми", "Male"),
        new("de-DE-SeraphinaMultilingualNeural", "Серафина", "Female"),
        new("de-DE-FlorianMultilingualNeural", "Флориан", "Male"),
        new("it-IT-GiuseppeMultilingualNeural", "Джузеппе", "Male"),
        new("ko-KR-HyunsuMultilingualNeural", "Хёнсу", "Male"),
        new("pt-BR-ThalitaMultilingualNeural", "Талита", "Female"),
    };

    /// Обратная совместимость: старое имя массива
    public static Voice[] RussianVoices => AllVoices;

    public const string DefaultVoice = "ru-RU-SvetlanaNeural";

    /// <summary>Понятное имя голоса по его техническому id.</summary>
    public static string TitleOf(string? voiceId)
    {
        if (string.IsNullOrWhiteSpace(voiceId)) return "Светлана";
        var found = Array.Find(AllVoices, v => v.Id.Equals(voiceId, StringComparison.OrdinalIgnoreCase));
        return found?.Title ?? "Светлана";
    }

    private const string TrustedToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private const string ChromiumVersion = "143.0.3650.75";
    private const string GecVersion = "1-" + ChromiumVersion;
    private const string WsBase =
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
    private const string VoicesUrl =
        "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list" +
        "?trustedclienttoken=" + TrustedToken;
    private const string UserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
    private const string ExtensionOrigin =
        "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly HttpClient _warmupHttp = new() { Timeout = TimeSpan.FromSeconds(8) };
    private CancellationTokenSource? _current;
    private WaveOutEvent? _output;

    public EdgeTts()
    {
        _warmupHttp.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
    }

    /// <summary>
    /// Прогрев DNS/TLS при старте. Сам WebSocket создаётся на фразу, как требует
    /// сервис, но сетевой путь уже прогрет до первого сообщения.
    /// </summary>
    public void Warmup()
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var response = await _warmupHttp.GetAsync(
                    VoicesUrl, HttpCompletionOption.ResponseHeadersRead);
            }
            catch { }

            // Поднимаем И СОХРАНЯЕМ постоянное соединение. Раньше прогрев
            // сразу закрывал сокет, и первая фраза снова тратила время на TLS.
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(6));
                await _gate.WaitAsync(cts.Token);
                try { await EnsureConnectionAsync(cts.Token); }
                finally { _gate.Release(); }
            }
            catch { }
        });
    }

    public async Task<byte[]> SpeakAsync(
        string text,
        string voice,
        int ratePercent,
        int volumePercent,
        Action<byte[]>? onAudioReady = null,
        CancellationToken outer = default)
    {
        if (string.IsNullOrWhiteSpace(text)) return Array.Empty<byte>();
        if (!AllVoices.Any(v => v.Id.Equals(voice, StringComparison.OrdinalIgnoreCase)))
            voice = DefaultVoice;

        _current?.Cancel();
        _current?.Dispose();
        _current = CancellationTokenSource.CreateLinkedTokenSource(outer);
        _current.CancelAfter(TimeSpan.FromSeconds(20));
        var ct = _current.Token;

        await _gate.WaitAsync(ct);
        try
        {
            var audio = await TrySynthesizeAsync(text, voice, ratePercent, ct);
            if (audio.Length == 0)
                throw new InvalidOperationException("Edge TTS не вернул аудио");

            // OBS и локальное воспроизведение стартуют ПАРАЛЛЕЛЬНО. Запись
            // большого MP3 в SSE не должна блокировать начало звука на ПК.
            if (onAudioReady != null)
                _ = Task.Run(() => { try { onAudioReady(audio); } catch { } });

            await PlayAsync(audio, volumePercent, ct);
            return audio;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Только синтез для OBS (без локального воспроизведения). Используется,
    /// когда на ПК выбран SAPI: OBS всё равно получает озвученный текст.
    /// </summary>
    public async Task<byte[]> SynthesizeForObsAsync(string text, int ratePercent, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text)) return Array.Empty<byte>();
        await _gate.WaitAsync(ct);
        try { return await TrySynthesizeAsync(text, DefaultVoice, ratePercent, ct); }
        finally { _gate.Release(); }
    }

    private ClientWebSocket? _ws;

    /// Одно постоянное соединение: раньше сокет и speech.config отправлялись
    /// на КАЖДУЮ фразу (DNS + TLS + setup ≈ секунда), отсюда задержка.
    private async Task<ClientWebSocket> EnsureConnectionAsync(CancellationToken ct)
    {
        if (_ws is { State: WebSocketState.Open }) return _ws;

        try { _ws?.Abort(); } catch { }
        try { _ws?.Dispose(); } catch { }

        var connectionId = Guid.NewGuid().ToString("N");
        var uri = new Uri(
            $"{WsBase}?TrustedClientToken={TrustedToken}" +
            $"&Sec-MS-GEC={GenerateSecMsGec()}" +
            $"&Sec-MS-GEC-Version={GecVersion}" +
            $"&ConnectionId={connectionId}");

        var ws = new ClientWebSocket();
        ws.Options.SetRequestHeader("Origin", ExtensionOrigin);
        ws.Options.SetRequestHeader("User-Agent", UserAgent);
        ws.Options.SetRequestHeader("Pragma", "no-cache");
        ws.Options.SetRequestHeader("Cache-Control", "no-cache");
        ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(10);

        var cookies = new CookieContainer();
        cookies.SetCookies(new Uri("https://speech.platform.bing.com"),
            $"muid={Convert.ToHexString(RandomNumberGenerator.GetBytes(16))}");
        ws.Options.Cookies = cookies;

        await ws.ConnectAsync(uri, ct);

        // конфигурация формата отправляется ОДИН раз на соединение
        var config =
            $"X-Timestamp:{Timestamp()}\r\n" +
            "Content-Type:application/json; charset=utf-8\r\n" +
            "Path:speech.config\r\n\r\n" +
            "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":" +
            "{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}," +
            "\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n";
        await SendText(ws, config, ct);

        _ws = ws;
        return ws;
    }

    /// Синтез с одним повтором: если постоянное соединение умерло,
    /// рвём его, пересоздаём и пробуем ещё раз.
    private async Task<byte[]> TrySynthesizeAsync(string text, string voice, int ratePercent, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                return await SynthesizeAsync(text, voice, ratePercent, ct);
            }
            catch when (attempt == 0)
            {
                try { _ws?.Abort(); } catch { }
                try { _ws?.Dispose(); } catch { }
                _ws = null;
            }
        }
        return Array.Empty<byte>();
    }

    private async Task<byte[]> SynthesizeAsync(
        string text,
        string voice,
        int ratePercent,
        CancellationToken ct)
    {
        var ws = await EnsureConnectionAsync(ct);

        var rate = Math.Clamp(ratePercent, -50, 100);
        var escaped = EscapeXml(CleanText(text));
        var ssml =
            "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'>" +
            $"<voice name='{voice}'><prosody pitch='+0Hz' rate='{(rate >= 0 ? "+" : "")}{rate}%' volume='+0%'>" +
            $"{escaped}</prosody></voice></speak>";
        var request =
            $"X-RequestId:{Guid.NewGuid():N}\r\n" +
            "Content-Type:application/ssml+xml\r\n" +
            $"X-Timestamp:{Timestamp()}Z\r\n" +
            "Path:ssml\r\n\r\n" + ssml;
        await SendText(ws, request, ct);

        using var audio = new MemoryStream();
        var receive = new byte[32768];
        var gotAudio = false;

        while (!ct.IsCancellationRequested)
        {
            using var frame = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await ws.ReceiveAsync(receive, ct);
                if (result.MessageType == WebSocketMessageType.Close)
                    throw new InvalidOperationException("Edge TTS закрыл WebSocket");
                frame.Write(receive, 0, result.Count);
            } while (!result.EndOfMessage);

            var bytes = frame.ToArray();
            if (result.MessageType == WebSocketMessageType.Text)
            {
                var response = Encoding.UTF8.GetString(bytes);
                if (HeaderPath(response).Equals("turn.end", StringComparison.OrdinalIgnoreCase))
                    break;
                continue;
            }

            if (bytes.Length < 2) continue;
            var headerLength = (bytes[0] << 8) | bytes[1];
            var payloadStart = headerLength + 2;
            if (payloadStart > bytes.Length)
                throw new InvalidOperationException("Edge TTS вернул повреждённый аудиофрейм");
            if (payloadStart == bytes.Length) continue;

            await audio.WriteAsync(bytes.AsMemory(payloadStart), ct);
            gotAudio = true;
        }

        // Закрытие рукопожатием ждёт ответ сервера и добавляло задержку
        // ПЕРЕД воспроизведением. Аудио уже получено — рвём соединение сразу.
        try { ws.Abort(); } catch { }

        if (!gotAudio) throw new InvalidOperationException("Edge TTS: аудио не получено");
        return audio.ToArray();
    }

    private Task PlayAsync(byte[] mp3, int volumePercent, CancellationToken ct)
    {
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = Task.Run(() =>
        {
            try
            {
                using var memory = new MemoryStream(mp3, writable: false);
                using var reader = new Mp3FileReader(memory);
                var output = new WaveOutEvent { DesiredLatency = 60, NumberOfBuffers = 2 };
                _output = output;
                output.Init(reader);
                output.Volume = Math.Clamp(volumePercent, 0, 100) / 100f;
                output.Play();

                while (output.PlaybackState == PlaybackState.Playing)
                {
                    if (ct.IsCancellationRequested) { output.Stop(); break; }
                    Thread.Sleep(20);
                }
                output.Dispose();
                if (ReferenceEquals(_output, output)) _output = null;
            }
            catch (Exception ex)
            {
                done.TrySetException(new InvalidOperationException(
                    "Не удалось воспроизвести Edge TTS: " + ex.Message, ex));
                return;
            }
            done.TrySetResult();
        }, CancellationToken.None);
        return done.Task;
    }

    public void Cancel()
    {
        try { _current?.Cancel(); } catch { }
        try { _output?.Stop(); } catch { }
    }

    /// <summary>
    /// Sec-MS-GEC: Windows FILETIME, округлённый вниз до 5 минут,
    /// + trusted token, SHA-256 в верхнем регистре.
    /// </summary>
    private static string GenerateSecMsGec()
    {
        const long windowsEpoch = 11644473600L;
        var seconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + windowsEpoch;
        seconds -= seconds % 300;
        var ticks = seconds * 10_000_000L;
        var source = Encoding.ASCII.GetBytes(ticks.ToString() + TrustedToken);
        return Convert.ToHexString(SHA256.HashData(source));
    }

    private static string HeaderPath(string response)
    {
        foreach (var line in response.Split("\r\n"))
            if (line.StartsWith("Path:", StringComparison.OrdinalIgnoreCase))
                return line[5..].Trim();
        return "";
    }

    private static string Timestamp() =>
        DateTime.UtcNow.ToString("ddd MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'");

    private static Task SendText(ClientWebSocket ws, string text, CancellationToken ct) =>
        ws.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, ct);

    private static string CleanText(string text)
    {
        var chars = text.Where(c => c is not '\v' and not '\f' && (c >= ' ' || c is '\n' or '\r' or '\t'));
        return new string(chars.ToArray());
    }

    private static string EscapeXml(string text) =>
        text.Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");

    public void Dispose()
    {
        Cancel();
        try { _output?.Dispose(); } catch { }
        try { _ws?.Abort(); } catch { }
        try { _ws?.Dispose(); } catch { }
        _ws = null;
        _current?.Dispose();
        _warmupHttp.Dispose();
        _gate.Dispose();
    }
}