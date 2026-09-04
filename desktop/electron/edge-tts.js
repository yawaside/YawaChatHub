/**
 * Edge TTS — бесплатные нейросетевые голоса Microsoft Edge (без API-ключа).
 * Только русские голоса: Svetlana и Dmitry.
 *
 * Модуль возвращает MP3-буфер (base64), который:
 * - проигрывается в главном окне Electron через <audio> (локальная озвучка)
 * - отправляется в OBS-виджет через WebSocket (Browser Source)
 */
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const RUSSIAN_VOICES = [
  { id: "ru-RU-SvetlanaNeural", label: "Светлана (Edge)", gender: "Female" },
  { id: "ru-RU-DmitryNeural", label: "Дмитрий (Edge)", gender: "Male" },
];

/** Кеш инстансов: один MsEdgeTTS на голос, переиспользуется. */
const instances = new Map();

function getInstance(voiceId) {
  if (instances.has(voiceId)) return instances.get(voiceId);
  const tts = new MsEdgeTTS();
  const ready = tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const entry = { tts, ready };
  instances.set(voiceId, entry);
  return entry;
}

/**
 * Синтезирует текст в MP3 base64.
 * @param {Object} opts
 * @param {string} opts.text
 * @param {string} opts.voice — id голоса (ru-RU-SvetlanaNeural и т.п.)
 * @param {number} [opts.rate=1] — скорость (0.5..2)
 * @param {number} [opts.volume=1] — громкость (0..1)
 * @returns {Promise<{base64: string, durationMs: number} | null>}
 */
async function synthesize({ text, voice, rate = 1, volume = 1 }) {
  if (!text || !voice) return null;
  try {
    const entry = getInstance(voice);
    await entry.ready;

    // rate: Edge принимает "+0%" .. "+100%", "-50%" и т.п.
    const ratePercent = Math.round((rate - 1) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
    const volPercent = Math.round(Math.max(0, Math.min(1, volume)) * 100);
    const volStr = volPercent >= 0 ? `+${volPercent - 100}%` : `${volPercent - 100}%`;

    const readable = entry.tts.toStream(text, { rate: rateStr, volume: volStr });
    const chunks = [];
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 15000);
      readable.audioStream.on("data", (d) => chunks.push(d));
      readable.audioStream.on("end", () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        if (!buf.length) return resolve(null);
        // Грубая оценка длительности MP3 48kbps: bytes * 8 / 48000 * 1000
        const durationMs = Math.round((buf.length * 8) / 48 );
        resolve({ base64: buf.toString("base64"), durationMs });
      });
      readable.audioStream.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

/** Список русских голосов Edge TTS (статический, не требует сетевого запроса). */
function voices() {
  return RUSSIAN_VOICES;
}

/** Проверяет, является ли voiceId голосом Edge TTS. */
function isEdgeVoice(voiceId) {
  return typeof voiceId === "string" && voiceId.includes("Neural") && voiceId.startsWith("ru-RU-");
}

module.exports = { synthesize, voices, isEdgeVoice, RUSSIAN_VOICES };
