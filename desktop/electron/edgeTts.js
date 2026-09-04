// Microsoft Edge TTS (онлайн, без API-ключа) — только русские голоса.
//
// Минимальный клиент поверх `ws` (уже есть в зависимостях desktop) — новых
// npm-пакетов не требуется, electron-builder упаковывает всё как раньше.
//
// Оптимизация задержки (важно):
//   1. ПОСТОЯННОЕ WebSocket-соединение. Раньше на каждую фразу поднимался новый
//      сокет: TLS-рукопожатие + speech.config занимали 300–600 мс ещё до синтеза.
//      Теперь соединение переиспользуется, запросы мультиплексируются по
//      X-RequestId, keep-alive пингом держим канал живым.
//   2. КЕШ готового аудио (LRU). Повторяющиеся фразы («+», «гг», привет-сообщения)
//      отдаются мгновенно, без обращения к сети.
//   3. Громкость НЕ пишется в SSML — она применяется на воспроизведении.
//      Благодаря этому ключ кеша не зависит от громкости (больше попаданий),
//      а ползунок громкости меняет звук без повторного синтеза.
//
// Формат аудио — MP3 (audio-24khz-48kbitrate-mono-mp3): endpoint readaloud
// не отдаёт WAV («Unsupported Edge output format» на riff-*), а MP3 играет
// и <audio> в окне Electron, и <audio> в OBS Browser Source.
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
const EDGE_AUDIO_MIME = "audio/mp3";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";

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

/** Живой список русских голосов Edge; при офлайне — встроенная пара. */
async function fetchEdgeRuVoices() {
  if (cachedVoices && Date.now() - cachedAt < VOICES_CACHE_MS) return cachedVoices;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(VOICES_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
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
      const order = ["ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural"];
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

/* ==================== кеш готового аудио (LRU) ==================== */

const audioCache = new Map(); // key -> Buffer
const AUDIO_CACHE_MAX = 64;

function cacheKey(voice, rate, text) {
  return `${voice}|${rate}|${text}`;
}

function cacheGet(key) {
  const buf = audioCache.get(key);
  if (!buf) return null;
  // обновляем «свежесть»: Map хранит порядок вставки
  audioCache.delete(key);
  audioCache.set(key, buf);
  return buf;
}

function cacheSet(key, buf) {
  if (!buf || !buf.length) return;
  audioCache.set(key, buf);
  while (audioCache.size > AUDIO_CACHE_MAX) {
    const oldest = audioCache.keys().next().value;
    audioCache.delete(oldest);
  }
}

/* ==================== постоянное соединение ==================== */

let socket = null;          // активный WebSocket (или null)
let connecting = null;      // Promise<WebSocket> во время подключения
let keepAliveTimer = null;  // ws.ping(), чтобы канал не закрывался
let idleTimer = null;       // закрытие простаивающего сокета
const pending = new Map();  // requestId -> { chunks, resolve, timer }

const KEEPALIVE_MS = 15000;
const IDLE_CLOSE_MS = 3 * 60 * 1000;

function clearTimers() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function armIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending.size === 0) closeSocket();
  }, IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

function failAllPending() {
  for (const [, p] of pending) {
    if (p.timer) clearTimeout(p.timer);
    p.resolve(null);
  }
  pending.clear();
}

function closeSocket() {
  clearTimers();
  const s = socket;
  socket = null;
  connecting = null;
  if (s) {
    try { s.removeAllListeners(); } catch { /* noop */ }
    try { s.close(); } catch { /* noop */ }
    try { s.terminate?.(); } catch { /* noop */ }
  }
}

/** Разбирает бинарный фрейм: заголовок с X-RequestId + аудио после Path:audio. */
function parseAudioFrame(buf) {
  const sep = Buffer.from("Path:audio\r\n");
  const idx = buf.indexOf(sep);
  if (idx === -1) return null;
  const header = buf.subarray(0, idx).toString("utf8");
  const m = /X-RequestId:([0-9a-fA-F]+)/.exec(header);
  return { id: m ? m[1].toLowerCase() : null, audio: buf.subarray(idx + sep.length) };
}

function openSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (connecting) return connecting;

  connecting = new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(
        `${WSS_URL}&Sec-MS-GEC=${generateSecMsGecToken()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`,
        {
          host: "speech.platform.bing.com",
          origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          headers: {
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
            "User-Agent": UA,
            "Accept-Language": "ru-RU,ru;q=0.9",
          },
        }
      );
    } catch (e) {
      connecting = null;
      reject(e);
      return;
    }

    const onOpenFail = (err) => {
      connecting = null;
      try { ws.removeAllListeners(); } catch { /* noop */ }
      reject(err instanceof Error ? err : new Error("edge socket error"));
    };

    ws.once("error", onOpenFail);

    ws.on("open", () => {
      ws.removeListener("error", onOpenFail);
      try {
        // speech.config отправляется один раз на соединение — формат общий.
        ws.send(
          "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
            JSON.stringify({
              context: {
                synthesis: {
                  audio: {
                    metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                    outputFormat: OUTPUT_FORMAT,
                  },
                },
              },
            })
        );
      } catch (e) {
        connecting = null;
        reject(e);
        return;
      }

      socket = ws;
      connecting = null;

      clearTimers();
      keepAliveTimer = setInterval(() => {
        try { ws.ping(); } catch { /* noop */ }
      }, KEEPALIVE_MS);
      keepAliveTimer.unref?.();
      armIdleClose();

      resolve(ws);
    });

    ws.on("message", (data, isBinary) => {
      try {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          const frame = parseAudioFrame(buf);
          if (!frame) return;
          const req = frame.id ? pending.get(frame.id) : null;
          if (req && frame.audio.length) req.chunks.push(frame.audio);
          return;
        }
        const msg = data.toString();
        const m = /X-RequestId:([0-9a-fA-F]+)/.exec(msg);
        const id = m ? m[1].toLowerCase() : null;
        if (id && msg.includes("Path:turn.end")) {
          const req = pending.get(id);
          if (req) {
            pending.delete(id);
            if (req.timer) clearTimeout(req.timer);
            req.resolve(req.chunks.length ? Buffer.concat(req.chunks) : null);
          }
          armIdleClose();
        }
      } catch { /* noop */ }
    });

    const drop = () => {
      if (socket === ws) socket = null;
      clearTimers();
      failAllPending();
    };
    ws.on("close", drop);
    ws.on("error", drop);
  });

  return connecting;
}

/** Один запрос синтеза по уже открытому соединению. */
function requestSynthesis(ws, { text, shortName, rate, timeoutMs }) {
  return new Promise((resolve) => {
    const requestId = crypto.randomBytes(16).toString("hex");
    const entry = { chunks: [], resolve, timer: null };
    entry.timer = setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, Math.max(4000, Math.min(30000, Number(timeoutMs) || 15000)));
    entry.timer.unref?.();
    pending.set(requestId, entry);

    try {
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
          `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
          `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ru-RU">` +
          `<voice name="${escapeXml(shortName)}">` +
          // Громкость намеренно не задаём: применяется при воспроизведении,
          // поэтому кеш не зависит от ползунка громкости.
          `<prosody rate="${mapRate(rate)}" pitch="default">` +
          `${escapeXml(text)}</prosody></voice></speak>`
      );
    } catch {
      pending.delete(requestId);
      if (entry.timer) clearTimeout(entry.timer);
      resolve(null);
    }
  });
}

/**
 * Синтез фразы в MP3-буфер. Возвращает Buffer или null (офлайн/ошибка/таймаут).
 * Соединение переиспользуется; одинаковые фразы берутся из кеша мгновенно.
 */
async function synthesizeEdgeToBuffer({ text, voice, rate = 1, volume = 0.9, timeoutMs = 15000 }) {
  const clean = String(text || "").trim().slice(0, 1000);
  if (!clean) return null;
  if (Number(volume) <= 0) return null;
  const shortName = edgeShortName(voice) || "ru-RU-SvetlanaNeural";

  const key = cacheKey(shortName, mapRate(rate), clean);
  const hit = cacheGet(key);
  if (hit) return hit;

  // Одна повторная попытка: сокет мог протухнуть ровно в момент отправки.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let ws;
    try {
      ws = await openSocket();
    } catch {
      return null;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      closeSocket();
      continue;
    }
    const buf = await requestSynthesis(ws, { text: clean, shortName, rate, timeoutMs });
    if (buf && buf.length) {
      cacheSet(key, buf);
      armIdleClose();
      return buf;
    }
    closeSocket();
  }
  return null;
}

/** Прогрев: открыть соединение заранее, чтобы первая фраза не ждала рукопожатия. */
function warmupEdge() {
  openSocket().catch(() => { /* офлайн — не страшно, синтез попробует позже */ });
}

/** Полное освобождение ресурсов при выходе из приложения. */
function disposeEdge() {
  failAllPending();
  closeSocket();
  audioCache.clear();
}

module.exports = {
  EDGE_VOICE_PREFIX,
  EDGE_AUDIO_MIME,
  FALLBACK_RU_VOICES,
  fetchEdgeRuVoices,
  synthesizeEdgeToBuffer,
  isEdgeVoice,
  edgeShortName,
  warmupEdge,
  disposeEdge,
};
