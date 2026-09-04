// Microsoft Edge TTS (онлайн, без API-ключа) — только русские голоса.
//
// Реализован минимальный клиент поверх `ws` (уже есть в зависимостях desktop):
// синтез идёт через wss://speech.platform.bing.com, аудио забирается
// из бинарных фреймов `Path:audio`. Никаких новых npm-пакетов не требуется,
// поэтому electron-builder упаковывает всё как раньше.
//
// Формат аудио — MP3 (audio-24khz-48kbitrate-mono-mp3): endpoint readaloud
// не отдаёт WAV («Unsupported Edge output format» на riff-*), а MP3 играет
// и <audio> в OBS-виджете, и System.Windows.Media.MediaPlayer для живого звука.
//
// Использование:
//   const { fetchEdgeRuVoices, synthesizeEdgeToBuffer } = require("./edgeTts");
//   const buf = await synthesizeEdgeToBuffer({ text, voice: "ru-RU-SvetlanaNeural", rate: 1, volume: 0.9 });
//   // buf — MP3-буфер или null при ошибке/офлайне/троттлинге.
const crypto = require("node:crypto");
const { WebSocket } = require("ws");

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const WSS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
  `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICES_URL =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list" +
  `?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

const EDGE_VOICE_PREFIX = "edge:";

// Известные русские голоса Edge (fallback, если список онлайн недоступен).
// Проверено живьём: Svetlana и Dmitry синтезируются; Dariya сервером
// больше не отдаётся (синтез возвращает пусто), поэтому её здесь нет.
const FALLBACK_RU_VOICES = [
  { name: "ru-RU-SvetlanaNeural", label: "Светлана — женский", gender: "Female" },
  { name: "ru-RU-DmitryNeural", label: "Дмитрий — мужской", gender: "Male" },
];

let cachedVoices = null;
let cachedAt = 0;
const VOICES_CACHE_MS = 6 * 60 * 60 * 1000;

function isEdgeVoice(name) {
  return typeof name === "string" && name.startsWith(EDGE_VOICE_PREFIX);
}

function edgeShortName(name) {
  return String(name || "").startsWith(EDGE_VOICE_PREFIX)
    ? String(name).slice(EDGE_VOICE_PREFIX.length)
    : String(name || "");
}

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&apos;";
      default: return c;
    }
  });
}

function generateSecMsGecToken() {
  const WINDOWS_FILE_TIME_EPOCH = 11644473600n;
  const ticks = BigInt(Math.floor(Date.now() / 1000 + Number(WINDOWS_FILE_TIME_EPOCH))) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  return crypto.createHash("sha256").update(`${rounded}${TRUSTED_CLIENT_TOKEN}`, "ascii").digest("hex").toUpperCase();
}

// Скорость движка 0.5..2 → prosody rate -50%..+100%.
function mapRate(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return "default";
  const pct = Math.max(-100, Math.min(200, Math.round((r - 1) * 100)));
  return pct === 0 ? "default" : `${pct > 0 ? "+" : ""}${pct}%`;
}

// Громкость движка 0..1 → volume -100%..+0% (0% = дефолт Edge).
function mapVolume(volume) {
  const v = Number(volume);
  if (!Number.isFinite(v)) return "default";
  const pct = Math.max(-100, Math.min(0, Math.round(v * 100 - 100)));
  return pct === 0 ? "default" : `${pct}%`;
}

/** Живой список русских голосов Edge; при офлайне — встроенная тройка. */
async function fetchEdgeRuVoices() {
  if (cachedVoices && Date.now() - cachedAt < VOICES_CACHE_MS) return cachedVoices;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(VOICES_URL, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0`,
        Accept: "application/json",
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`voices list: ${res.status}`);
    const list = await res.json();
    const ru = (Array.isArray(list) ? list : [])
      .filter((v) => /^ru([-_]|$)/i.test(String(v?.Locale || v?.locale || "")))
      .map((v) => {
        const short = String(v.ShortName || v.Name || "");
        if (!short) return null;
        const friendly = String(v.FriendlyName || v.LocalName || short);
        // "Microsoft Svetlana Online (Natural) - Russian (Russia)" → "Светлана"
        const firstName = friendly.replace(/^Microsoft\s+/i, "").split(/[\s(-]/)[0] || short;
        const gender = /female/i.test(String(v.Gender || "")) ? "Female" : /male/i.test(String(v.Gender || "")) ? "Male" : "";
        const known = FALLBACK_RU_VOICES.find((k) => k.name.toLowerCase() === short.toLowerCase());
        return {
          name: short,
          label: known ? known.label : `${firstName}${gender === "Female" ? " — женский" : gender === "Male" ? " — мужской" : ""}`,
          gender,
        };
      })
      .filter(Boolean);
    if (ru.length) {
      // Знакомые голоса — первыми и со стабильными русскими подписями.
      const order = ["ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural", "ru-RU-DariyaNeural"];
      ru.sort((a, b) => {
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      cachedVoices = ru;
      cachedAt = Date.now();
      return cachedVoices;
    }
  } catch {
    // офлайн или endpoint недоступен — ниже отдадим fallback
  }
  cachedVoices = FALLBACK_RU_VOICES.slice();
  cachedAt = Date.now();
  return cachedVoices;
}

/**
 * Синтез фразы в MP3-буфер. Возвращает Buffer или null (офлайн/ошибка/таймаут).
 * MIME для data-URL: "audio/mp3".
 */
const EDGE_AUDIO_MIME = "audio/mp3";
function synthesizeEdgeToBuffer({ text, voice, rate = 1, volume = 0.9, timeoutMs = 20000 }) {
  const clean = String(text || "").trim().slice(0, 1000);
  if (!clean) return Promise.resolve(null);
  if (Number(volume) <= 0) return Promise.resolve(null);
  const shortName = edgeShortName(voice) || "ru-RU-SvetlanaNeural";

  return new Promise((resolve) => {
    let done = false;
    let ws = null;
    let timer = null;
    const chunks = [];
    const finish = (buf) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { ws && ws.close(); } catch { /* noop */ }
      resolve(buf && buf.length ? Buffer.concat(chunks.length ? chunks : [buf]) : buf);
    };
    const fail = () => finish(null);

    timer = setTimeout(fail, Math.max(5000, Math.min(45000, Number(timeoutMs) || 20000)));

    try {
      ws = new WebSocket(
        `${WSS_URL}&Sec-MS-GEC=${generateSecMsGecToken()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`,
        {
          host: "speech.platform.bing.com",
          origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          headers: {
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
            "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0`,
            "Accept-Language": "ru-RU,ru;q=0.9",
          },
        }
      );
    } catch {
      fail();
      return;
    }

    ws.on("open", () => {
      try {
        ws.send(
          "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
            JSON.stringify({
              context: {
                synthesis: {
                  audio: {
                    metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                  },
                },
              },
            })
        );
        const requestId = crypto.randomBytes(16).toString("hex");
        ws.send(
          `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
            `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
            `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ru-RU">` +
            `<voice name="${escapeXml(shortName)}">` +
            `<prosody rate="${mapRate(rate)}" pitch="default" volume="${mapVolume(volume)}">` +
            `${escapeXml(clean)}</prosody></voice></speak>`
        );
      } catch {
        fail();
      }
    });

    ws.on("message", (data, isBinary) => {
      try {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          const sep = Buffer.from("Path:audio\r\n");
          const idx = buf.indexOf(sep);
          if (idx !== -1) chunks.push(buf.subarray(idx + sep.length));
        } else {
          const msg = data.toString();
          if (msg.includes("Path:turn.end")) {
            finish(chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0));
          } else if (msg.includes("Path:turn.start")) {
            // синтез начался — ничего не делаем, ждём аудио и turn.end
          }
        }
      } catch {
        fail();
      }
    });

    ws.on("error", fail);
    ws.on("close", () => {
      // Сервер может закрыть соединение сразу после turn.end — это норма.
      if (!done) finish(chunks.length ? Buffer.concat(chunks) : null);
    });
  });
}

module.exports = {
  EDGE_VOICE_PREFIX,
  EDGE_AUDIO_MIME,
  FALLBACK_RU_VOICES,
  fetchEdgeRuVoices,
  synthesizeEdgeToBuffer,
  isEdgeVoice,
  edgeShortName,
};
