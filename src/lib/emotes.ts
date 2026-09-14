import type { PlatformId } from "./types";

/**
 * Эмоуты / стикеры площадок.
 * Twitch — официальные глобальные эмоуты с CDN static-cdn.jtvnw.net.
 * Остальные площадки + общий словарь — Twemoji (тот же вид, что у стикеров в чатах).
 */

export interface EmoteDef {
  code: string;
  url: string;
}

const TW = (cp: string) => `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`;
const TV = (id: string) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;

const GLOBAL_EMOTES: EmoteDef[] = [
  { code: "fire", url: TW("1f525") },
  { code: "100", url: TW("1f4af") },
  { code: "eyes", url: TW("1f440") },
  { code: "tada", url: TW("1f389") },
  { code: "heart", url: TW("2764") },
  { code: "skull", url: TW("1f480") },
  { code: "sob", url: TW("1f62d") },
  { code: "joy", url: TW("1f602") },
  { code: "salute", url: TW("1fae1") },
  { code: "clown", url: TW("1f921") },
  { code: "zap", url: TW("26a1") },
  { code: "trophy", url: TW("1f3c6") },
  { code: "game", url: TW("1f3ae") },
  { code: "rocket", url: TW("1f680") },
  { code: "ok", url: TW("1f44d") },
  { code: "cool", url: TW("1f60e") },
  { code: "gg", url: TW("1f3c6") },
  { code: "cry", url: TW("1f622") },
  { code: "star", url: TW("2b50") },
  { code: "sparkles", url: TW("2728") },
];

export const PLATFORM_EMOTES: Record<PlatformId, EmoteDef[]> = {
  twitch: [
    { code: "kappa", url: TV("25") },
    { code: "lul", url: TV("425618") },
    { code: "4head", url: TV("354") },
    { code: "pjsalt", url: TV("36") },
    { code: "keepo", url: TV("1902") },
    { code: "coolstorybob", url: TV("123171") },
  ],
  youtube: [
    { code: "fire", url: TW("1f525") },
    { code: "100", url: TW("1f4af") },
    { code: "joy", url: TW("1f602") },
    { code: "eyes", url: TW("1f440") },
    { code: "tada", url: TW("1f389") },
    { code: "rocket", url: TW("1f680") },
  ],
  vkplay: [
    { code: "zap", url: TW("26a1") },
    { code: "trophy", url: TW("1f3c6") },
    { code: "game", url: TW("1f3ae") },
    { code: "heart", url: TW("2764") },
    { code: "salute", url: TW("1fae1") },
  ],
  kick: [
    { code: "greenheart", url: TW("1f49a") },
    { code: "fire", url: TW("1f525") },
    { code: "clown", url: TW("1f921") },
    { code: "eyes", url: TW("1f440") },
    { code: "target", url: TW("1f3af") },
    { code: "zap", url: TW("26a1") },
  ],
  tiktok: [
    { code: "rose", url: TW("1f339") },
    { code: "pleading", url: TW("1f97a") },
    { code: "joy", url: TW("1f602") },
    { code: "sparkles", url: TW("2728") },
    { code: "dancer", url: TW("1f483") },
    { code: "fire", url: TW("1f525") },
  ],
  donationalerts: [
    { code: "moneybag", url: TW("1f4b0") },
    { code: "gift", url: TW("1f381") },
    { code: "moneywings", url: TW("1f4b8") },
    { code: "trophy", url: TW("1f3c6") },
    { code: "heart", url: TW("2764") },
  ],
};

const lookupCache = new Map<PlatformId, Map<string, EmoteDef>>();

export function emoteLookup(platform: PlatformId): Map<string, EmoteDef> {
  let map = lookupCache.get(platform);
  if (!map) {
    map = new Map();
    GLOBAL_EMOTES.forEach((e) => map!.set(e.code, e));
    // ВАЖНО: площадка может прийти неизвестной — раньше здесь падало
    // с TypeError и роняло оверлей при каждом сообщении
    (PLATFORM_EMOTES[platform] ?? []).forEach((e) => map!.set(e.code, e));
    lookupCache.set(platform, map);
  }
  return map;
}

/**
 * Разрешение кода эмоута в URL:
 * 1) словарь площадки/общий словарь;
 * 2) динамические токены от реальных коннекторов:
 *    :em_25:    — Twitch-эмоут по id (CDN static-cdn.jtvnw.net)
 *    :emk_123:  — Kick-эмоут по id (files.kick.com)
 */
export function resolveEmote(code: string, platform: PlatformId): EmoteDef | null {
  const fromMap = emoteLookup(platform).get(code);
  if (fromMap) return fromMap;
  const tw = /^em_(\d+)$/.exec(code);
  if (tw) return { code, url: TV(tw[1]) };
  const kk = /^emk_(\d+)$/.exec(code);
  if (kk) return { code, url: `https://files.kick.com/emote/${kk[1]}/fullsize` };
  return null;
}

export type MsgPart =
  | { kind: "text"; text: string }
  | { kind: "emote"; code: string; url: string };

/**
 * Формат картиночного смайла от коннекторов: [[e|URL|имя]].
 * Так приходят реальные смайлы Twitch, Kick и VK Видео Live.
 * Разбирается вручную в parseMessage (без глобальных regexp).
 */

/**
 * Разбор текста на куски текста и эмоуты.
 * Реализован ручным сканером без глобальных regexp: у /g-регулярок
 * сохраняется lastIndex между вызовами, из-за чего показывался
 * только ПЕРВЫЙ смайл, а остальные оставались текстом.
 */
/* Кэш разбора: одно и то же сообщение перерисовывается десятки раз
   (новое сообщение → перерисовка всего списка). Без кэша разбор текста
   выполнялся заново каждый раз и заметно грузил процессор при плотном чате. */
const parseCache = new Map<string, MsgPart[]>();

export function parseMessage(text: string, platform: PlatformId): MsgPart[] {
  const src = String(text ?? "");

  const cacheKey = `${platform}\u0000${src}`;
  const cached = parseCache.get(cacheKey);
  if (cached) return cached;
  const parts: MsgPart[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      parts.push({ kind: "text", text: buf });
      buf = "";
    }
  };

  while (i < src.length) {
    // 1) инлайн-смайл от коннектора: [[e|URL|имя]]
    if (src.startsWith("[[e|", i)) {
      const end = src.indexOf("]]", i + 4);
      if (end > 0) {
        const body = src.slice(i + 4, end);
        const sep = body.lastIndexOf("|");
        const url = (sep >= 0 ? body.slice(0, sep) : body).trim();
        const code = ((sep >= 0 ? body.slice(sep + 1) : "emote") || "emote").trim();
        if (url) {
          flush();
          parts.push({ kind: "emote", code, url });
          i = end + 2;
          continue;
        }
      }
    }

    // 2) словарный код: :kappa:
    if (src[i] === ":") {
      const end = src.indexOf(":", i + 1);
      if (end > i + 1 && end - i <= 40) {
        const code = src.slice(i + 1, end);
        if (/^[a-zA-Z0-9_]+$/.test(code)) {
          const def = resolveEmote(code.toLowerCase(), platform);
          if (def) {
            flush();
            parts.push({ kind: "emote", code: def.code, url: def.url });
            i = end + 1;
            continue;
          }
        }
      }
    }

    buf += src[i++];
  }

  flush();
  if (!parts.length) parts.push({ kind: "text", text: src });
  if (parseCache.size > 500) parseCache.clear();
  parseCache.set(cacheKey, parts);
  return parts;
}

/** сообщение-стикер: состоит только из эмоутов → рисуем их крупно */
export function isStickerOnly(text: string, platform: PlatformId): boolean {
  const parts = parseMessage(text, platform);
  if (!parts.some((p) => p.kind === "emote")) return false;
  return parts.every((p) => p.kind === "emote" || p.text.trim().length === 0);
}

/**
 * ПОСТОЯННОЕ правило озвучки: служебные символы никогда не читаются вслух.
 * Отключить нельзя — иначе TTS проговаривает «обратная косая черта» и подобное.
 */
export function sanitizeForSpeech(text: string): string {
  return String(text ?? "")
    // технические символы и псевдографика
    .replace(/[\\/|~^`_*<>{}[\]()=+#№$%@&·•—–«»"'“”„…]/g, " ")
    // управляющие символы
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, " ")
    // повторяющаяся пунктуация: "!!!!!" → "!"
    .replace(/([.,!?;:])\1{1,}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** текст без смайлов — для озвучки (смайлы по умолчанию не читаются) */
export function stripEmotes(text: string, platform: PlatformId): string {
  return parseMessage(text, platform)
    .map((p) => (p.kind === "text" ? p.text : " "))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}
