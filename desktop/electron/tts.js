// Озвучка системными голосами Windows (SAPI).
//
// Оптимизация задержки: раньше на КАЖДОЕ сообщение запускался новый PowerShell
// (1–2 секунды на старт). Теперь работает постоянный процесс-синтезатор,
// который читает задания из stdin — озвучка стартует мгновенно.
//
// FIX(3.1.7): голоса сторонних движков (Silero и др.) часто регистрируются
// как 32-битный SAPI5-компонент. 64-битный Electron/Node видит только
// «свою» половину реестра голосов — 32-битные токены для него как будто
// не существуют (COM-объект физически нельзя загрузить в 64-битный процесс).
// Поэтому раньше такие голоса не попадали в список для выбора.
//
// Решение: голоса теперь ищутся ДВАЖДЫ — через обычный (64-бит) PowerShell
// и через 32-битный (C:\Windows\SysWOW64\...\powershell.exe), если он есть.
// Для каждого голоса запоминается, в какой «битности» он найден, и озвучка
// идёт через процесс той же битности — так Silero и подобные голоса реально
// работают, а не просто фигурируют в списке.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  EDGE_VOICE_PREFIX,
  EDGE_AUDIO_MIME,
  fetchEdgeRuVoices,
  synthesizeEdgeToBuffer,
  isEdgeVoice,
} = require("./edgeTts");

const PS_ARGS = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

const WIN_DIR = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
const PS_64 = path.join(WIN_DIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const PS_32 = path.join(WIN_DIR, "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe");

function psExeFor(bitness) {
  if (bitness === "32" && fs.existsSync(PS_32)) return PS_32;
  return fs.existsSync(PS_64) ? PS_64 : "powershell.exe";
}

// FIX(3.1.6): SSML с явным xml:lang="ru-RU" — иначе голоса с Culture="en-US"
// в манифесте (частый баг сторонних SAPI5-движков вроде Silero) читают
// русский текст английским движком фонетизации («транслит»).
function speakLoopScript() {
  return `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim() -eq '') { continue }
  try {
    $job = $line | ConvertFrom-Json
    if ($job.cmd -eq 'quit') { break }
    if ($job.voice) { try { $synth.SelectVoice($job.voice) } catch {} }
    $synth.Rate = [int]$job.rate
    $synth.Volume = [int]$job.volume
    $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($job.text))
    if (-not [String]::IsNullOrWhiteSpace($text)) {
      $escaped = [System.Security.SecurityElement]::Escape($text)
      if ($job.voice) {
        $voiceName = $job.voice.Replace("'", "&apos;")
        $voiceTag = "<voice name='$voiceName' xml:lang='ru-RU'>$escaped</voice>"
      } else {
        $voiceTag = $escaped
      }
      $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'>$voiceTag</speak>"
      $ok = $false
      try { $synth.SpeakSsml($ssml); $ok = $true } catch { $ok = $false }
      if (-not $ok) { try { $synth.Speak($text) } catch {} }
    }
  } catch {}
  [Console]::Out.WriteLine('done')
  [Console]::Out.Flush()
}
$synth.Dispose()
`;
}

// Список голосов, видимых из ТЕКУЩЕГО процесса (передаётся через exe нужной битности).
const LIST_VOICES_SCRIPT =
  "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);" +
  "Add-Type -AssemblyName System.Speech;" +
  "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;" +
  "$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name };" +
  "$s.Dispose();";

function runPs(exe, script, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, [...PS_ARGS, script], { windowsHide: true });
    } catch {
      resolve("");
      return;
    }
    let out = "";
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve(out);
    };
    child.stdout?.on("data", (d) => (out += d.toString("utf8")));
    child.once("exit", done);
    child.once("error", () => resolve(""));
    setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      done();
    }, timeoutMs);
  });
}

class VoiceHost {
  constructor(bitness) {
    this.bitness = bitness;
    this.queue = [];
    this.host = null;
    this.ready = false;
    this.currentId = null;
    this.onEnd = null;
    this._buffer = "";
  }

  _ensure() {
    if (this.host) return this.host;
    const exe = psExeFor(this.bitness);
    let child;
    try {
      child = spawn(exe, [...PS_ARGS, speakLoopScript()], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      console.error(`[tts:${this.bitness}] не удалось запустить PowerShell:`, e.message);
      return null;
    }
    this.host = child;
    this.ready = false;
    this._buffer = "";
    child.stdin.setDefaultEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      this._buffer += chunk.toString("utf8");
      let nl;
      while ((nl = this._buffer.indexOf("\n")) !== -1) {
        const line = this._buffer.slice(0, nl).trim();
        this._buffer = this._buffer.slice(nl + 1);
        if (line === "ready") {
          this.ready = true;
          this._pump();
        } else if (line === "done") {
          this._finishCurrent();
        }
      }
    });

    const drop = () => {
      if (this.host !== child) return;
      this.host = null;
      this.ready = false;
      this._finishCurrent();
    };
    child.once("exit", drop);
    child.once("error", drop);
    return child;
  }

  _finishCurrent() {
    const id = this.currentId;
    this.currentId = null;
    if (id && this.onEnd) this.onEnd(id);
    setImmediate(() => this._pump());
  }

  _pump() {
    if (this.currentId || !this.queue.length) return;
    const host = this._ensure();
    if (!host || !this.ready) return;
    const item = this.queue.shift();
    this.currentId = item.id;
    const job = {
      id: item.id,
      rate: Math.max(-10, Math.min(10, Math.round((Number(item.rate ?? 1) - 1) * 10))),
      volume: Math.max(0, Math.min(100, Math.round(Number(item.volume ?? 0.9) * 100))),
      voice: item.voice || "",
      text: Buffer.from(String(item.text || ""), "utf8").toString("base64"),
    };
    try {
      host.stdin.write(`${JSON.stringify(job)}\n`);
    } catch {
      this._finishCurrent();
    }
  }

  speak(item) {
    this.queue.push(item);
    if (this.queue.length > 12) this.queue.shift();
    this._pump();
  }

  skip() {
    if (!this.host) return;
    const child = this.host;
    this.host = null;
    this.ready = false;
    try { child.kill(); } catch { /* noop */ }
    this._finishCurrent();
  }

  stopAll() {
    this.queue = [];
    this.skip();
  }

  dispose() {
    this.queue = [];
    if (!this.host) return;
    try {
      this.host.stdin.write(`${JSON.stringify({ cmd: "quit" })}\n`);
      this.host.kill();
    } catch { /* noop */ }
    this.host = null;
  }
}

/**
 * Живое воспроизведение Edge TTS (MP3) через System.Windows.Media.MediaPlayer.
 * Очередь и семантика skip/stopAll — как у VoiceHost: в один момент звучит
 * только одна фраза, пропуск убивает текущий процесс и идёт дальше.
 */
class EdgeVoiceHost {
  constructor(onEnd) {
    this.queue = [];
    this.player = null;
    this.synthAbort = null;
    this.currentId = null;
    this.onEnd = onEnd || null;
    this._tmpSeq = 0;
  }

  _finishCurrent() {
    const id = this.currentId;
    this.currentId = null;
    this.synthAbort = null;
    if (id && this.onEnd) this.onEnd(id);
    setImmediate(() => this._pump());
  }

  _pump() {
    if (this.currentId || !this.queue.length) return;
    const item = this.queue.shift();
    this.currentId = item.id;
    let settled = false;
    const abortState = { aborted: false };
    this.synthAbort = abortState;

    synthesizeEdgeToBuffer({
      text: item.text,
      voice: item.voice,
      rate: item.rate ?? 1,
      volume: item.volume ?? 0.9,
    }).then((buf) => {
      if (settled || abortState.aborted || this.currentId !== item.id) return;
      if (!buf || !buf.length) {
        // офлайн/троттлинг — пропускаем фразу, очередь идёт дальше
        console.warn("[tts:edge] синтез не удался, фраза пропущена");
        this._finishCurrent();
        return;
      }
      settled = true;
      this._playBuffer(buf);
    }).catch(() => {
      if (this.currentId === item.id) this._finishCurrent();
    });
  }

  _playBuffer(buf) {
    const item = { id: this.currentId };
    const file = path.join(os.tmpdir(), `yawa-edge-${Date.now()}-${(this._tmpSeq++).toString(36)}.mp3`);
    try {
      fs.writeFileSync(file, buf);
    } catch {
      this._finishCurrent();
      return;
    }
    const safeFile = file.replace(/'/g, "''");
    // FIX: System.Windows.Media.MediaPlayer — это DispatcherObject. Его внутренние
    // колбэки (в том числе фактический запуск рендеринга звука после Play()) идут
    // через Dispatcher текущего потока. Без Dispatcher.Run() эти колбэки НИКОГДА
    // не выполняются — раньше скрипт просто "спал" по таймеру и ничего не звучало.
    // Правильный паттерн: подписываемся на MediaEnded/MediaFailed (они сработают
    // ВНУТРИ Dispatcher.Run(), т.к. это тот же поток) и явно завершаем цикл через
    // InvokeShutdown(); DispatcherTimer — страховка на случай, если событие не придёт.
    // -STA обязателен: без Single-Threaded Apartment WPF-компоненты не создаются.
    const script =
      "$ErrorActionPreference='SilentlyContinue';" +
      "Add-Type -AssemblyName PresentationCore,WindowsBase;" +
      "$p=New-Object System.Windows.Media.MediaPlayer;" +
      "$p.Volume=1.0;" +
      "$p.add_MediaEnded({ try{$p.Close()}catch{}; [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown() });" +
      "$p.add_MediaFailed({ [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown() });" +
      `$p.Open([Uri]::new('${safeFile}'));` +
      "$p.Play();" +
      "$timer=New-Object System.Windows.Threading.DispatcherTimer;" +
      "$timer.Interval=[TimeSpan]::FromSeconds(30);" +
      "$timer.add_Tick({ [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown() });" +
      "$timer.Start();" +
      "[System.Windows.Threading.Dispatcher]::Run();";
    let child;
    try {
      const exe = psExeFor("64");
      child = spawn(exe, ["-STA", "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
    } catch {
      try { fs.unlinkSync(file); } catch { /* noop */ }
      this._finishCurrent();
      return;
    }
    this.player = child;
    const cleanup = () => {
      try { fs.unlinkSync(file); } catch { /* noop */ }
      if (this.player === child) this.player = null;
    };
    child.once("exit", () => { cleanup(); if (this.currentId === item.id) this._finishCurrent(); });
    child.once("error", () => { cleanup(); if (this.currentId === item.id) this._finishCurrent(); });
    // Страховка: процесс воспроизведения не должен висеть вечно
    // (DispatcherTimer внутри скрипта останавливает его первым, через 30 с).
    setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
    }, 35000).unref?.();
  }

  speak(item) {
    this.queue.push(item);
    if (this.queue.length > 12) this.queue.shift();
    this._pump();
  }

  skip() {
    if (this.synthAbort) this.synthAbort.aborted = true;
    const child = this.player;
    this.player = null;
    if (child) {
      try { child.kill(); } catch { /* noop */ }
    }
    this._finishCurrent();
  }

  stopAll() {
    this.queue = [];
    this.skip();
  }

  dispose() {
    this.queue = [];
    if (this.synthAbort) this.synthAbort.aborted = true;
    if (this.player) {
      try { this.player.kill(); } catch { /* noop */ }
      this.player = null;
    }
  }
}

class TtsEngine {
  constructor() {
    this.onEnd = null;
    this._voices = null; // { name, engine: "sapi"|"edge", label, gender }[] для UI
    this._voiceBitness = new Map(); // name(lowercase) -> "64" | "32"
    this._hosts = { 64: null, 32: null };
    this._edgeHost = null;
    if (process.platform === "win32") {
      this._hosts[64] = new VoiceHost("64");
      this._hosts[64].onEnd = (id) => this.onEnd && this.onEnd(id);
    }
  }

  _edge() {
    if (!this._edgeHost) {
      this._edgeHost = new EdgeVoiceHost((id) => this.onEnd && this.onEnd(id));
    }
    return this._edgeHost;
  }

  _hostFor(voiceName) {
    const bit = voiceName ? this._voiceBitness.get(String(voiceName).toLowerCase()) : null;
    if (bit === "32") {
      if (!this._hosts[32]) {
        this._hosts[32] = new VoiceHost("32");
        this._hosts[32].onEnd = (id) => this.onEnd && this.onEnd(id);
      }
      return this._hosts[32];
    }
    if (!this._hosts[64]) {
      this._hosts[64] = new VoiceHost("64");
      this._hosts[64].onEnd = (id) => this.onEnd && this.onEnd(id);
    }
    return this._hosts[64];
  }

  speak(item) {
    if (!item || !String(item.text || "").trim()) return item?.id || "";
    if (isEdgeVoice(item.voice)) {
      this._edge().speak(item);
      return item.id;
    }
    this._hostFor(item.voice).speak(item);
    return item.id;
  }

  /** Прерывает то, что говорится прямо сейчас, во всех процессах. */
  skip() {
    if (this._hosts[64]) this._hosts[64].skip();
    if (this._hosts[32]) this._hosts[32].skip();
    if (this._edgeHost) this._edgeHost.skip();
  }

  stopAll() {
    if (this._hosts[64]) this._hosts[64].stopAll();
    if (this._hosts[32]) this._hosts[32].stopAll();
    if (this._edgeHost) this._edgeHost.stopAll();
  }

  dispose() {
    if (this._hosts[64]) this._hosts[64].dispose();
    if (this._hosts[32]) this._hosts[32].dispose();
    if (this._edgeHost) this._edgeHost.dispose();
  }

  /**
   * Объединённый список голосов для UI:
   * [{ name, engine: "sapi"|"edge", label, gender }].
   * Edge — только русские (онлайн), SAPI — все установленные (фильтруются в UI).
   */
  async voices() {
    if (this._voices) return this._voices;
    if (process.platform !== "win32") return [];

    const parse = (out) => out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    const [out64, out32raw, edgeVoices] = await Promise.all([
      runPs(psExeFor("64"), LIST_VOICES_SCRIPT),
      fs.existsSync(PS_32) ? runPs(psExeFor("32"), LIST_VOICES_SCRIPT) : Promise.resolve(""),
      fetchEdgeRuVoices().catch(() => []),
    ]);

    const names64 = parse(out64);
    const names32 = parse(out32raw);

    for (const n of names64) this._voiceBitness.set(n.toLowerCase(), "64");
    // 32-битные добавляем, только если процесс с 64-битным SAPI их не видит —
    // так голос всегда говорит через тот процесс, где реально загружается.
    for (const n of names32) {
      if (!this._voiceBitness.has(n.toLowerCase())) this._voiceBitness.set(n.toLowerCase(), "32");
    }

    const merged = [];
    const seen = new Set();
    for (const v of (edgeVoices || [])) {
      const key = `${EDGE_VOICE_PREFIX}${v.name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ name: `${EDGE_VOICE_PREFIX}${v.name}`, engine: "edge", label: v.label || v.name, gender: v.gender || "" });
    }
    for (const n of [...names64, ...names32]) {
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ name: n, engine: "sapi", label: n, gender: "" });
    }

    this._voices = merged;
    return this._voices;
  }

  /**
   * Синтез аудио для OBS Browser Source.
   * Возвращает { audioBase64, mime } или null. SAPI → WAV, Edge → MP3.
   */
  async synthesizeWavBase64({ text, rate = 1, volume = 0.9, voice }) {
    if (process.platform !== "win32" || !String(text || "").trim()) return null;
    if (isEdgeVoice(voice)) {
      try {
        const buf = await synthesizeEdgeToBuffer({ text, voice, rate, volume });
        if (!buf || !buf.length) return null;
        return { audioBase64: buf.toString("base64"), mime: EDGE_AUDIO_MIME };
      } catch {
        return null;
      }
    }
    const file = path.join(os.tmpdir(), `yawa-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    const sapiRate = Math.max(-10, Math.min(10, Math.round((Number(rate) - 1) * 10)));
    const sapiVolume = Math.max(0, Math.min(100, Math.round(Number(volume) * 100)));
    const encodedText = Buffer.from(String(text), "utf8").toString("base64");
    const safeFile = file.replace(/'/g, "''");
    const voiceLine = voice ? `try { $s.SelectVoice('${String(voice).replace(/'/g, "''")}') } catch {}` : "";
    const bit = voice ? this._voiceBitness.get(String(voice).toLowerCase()) : null;
    const exe = psExeFor(bit === "32" ? "32" : "64");

    const script =
      "$ErrorActionPreference='Stop';" +
      "Add-Type -AssemblyName System.Speech;" +
      "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;" +
      voiceLine +
      `$s.Rate=${sapiRate};$s.Volume=${sapiVolume};` +
      `$s.SetOutputToWaveFile('${safeFile}');` +
      `$t=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedText}'));` +
      "$escaped=[System.Security.SecurityElement]::Escape($t);" +
      (voice
        ? `$voiceTag=\"<voice name='${String(voice).replace(/'/g, "&apos;")}' xml:lang='ru-RU'>$escaped</voice>\";`
        : "$voiceTag=$escaped;") +
      "$ssml=\"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'>$voiceTag</speak>\";" +
      "$ok=$false; try { $s.SpeakSsml($ssml); $ok=$true } catch { $ok=$false };" +
      "if (-not $ok) { $s.Speak($t) };" +
      "$s.Dispose();";

    return new Promise((resolve) => {
      const child = spawn(exe, [...PS_ARGS, script], { windowsHide: true });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          const b64 = fs.readFileSync(file).toString("base64");
          fs.unlinkSync(file);
          resolve({ audioBase64: b64, mime: "audio/wav" });
        } catch {
          resolve(null);
        }
      };
      child.once("exit", finish);
      child.once("error", () => resolve(null));
      setTimeout(() => {
        try { child.kill(); } catch { /* noop */ }
        finish();
      }, 15000);
    });
  }
}

module.exports = { TtsEngine };
