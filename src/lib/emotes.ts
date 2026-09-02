/**
 * Смайлы чата: глобальные и пользовательские наборы площадок.
 *
 * Источники (публичные, без токенов и авторизации):
 *   • 7TV   — глобальные + наборы конкретного Twitch-канала
 *   • BTTV  — глобальные + наборы канала
 *   • FFZ   — наборы канала
 *
 * Разбор выполняется в интерфейсе, поэтому логика подключения к площадкам
 * (connectors.js) не затрагивается.
 */
import { useEffect, useState } from "react";

export interface EmoteToken {
  type: "text" | "emote";
  value: string;
  url?: string;
}

type EmoteMap = Map<string, string>;

const cache: EmoteMap = new Map();
const loadedKeys = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  for (const fn of listeners) fn();
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function addEmote(name: unknown, url: unknown) {
  if (typeof name !== "string" || typeof url !== "string" || !name || !url) return;
  if (!cache.has(name)) cache.set(name, url);
}

/* ---------- парсеры ответов ---------- */

function parse7tv(data: unknown) {
  const set = (data as { emotes?: unknown[] })?.emotes ?? (Array.isArray(data) ? data : []);
  for (const raw of set as Array<Record<string, unknown>>) {
    const name = raw?.name;
    const host = (raw?.data as { host?: { url?: string; files?: Array<{ name: string }> } })?.host
      ?? (raw?.host as { url?: string; files?: Array<{ name: string }> });
    if (!host?.url) continue;
    const files = host.files ?? [];
    const file =
      files.find((f) => f.name === "2x.webp") ||
      files.find((f) => f.name === "1x.webp") ||
      files[0];
    if (file) addEmote(name, `https:${host.url}/${file.name}`.replace("https:https:", "https:"));
  }
}

function parseBttv(data: unknown) {
  const list = Array.isArray(data)
    ? data
    : [
        ...(((data as Record<string, unknown>)?.channelEmotes as unknown[]) ?? []),
        ...(((data as Record<string, unknown>)?.sharedEmotes as unknown[]) ?? []),
      ];
  for (const raw of list as Array<Record<string, unknown>>) {
    if (raw?.id && raw?.code) addEmote(raw.code, `https://cdn.betterttv.net/emote/${raw.id}/2x.webp`);
  }
}

function parseFfz(data: unknown) {
  const sets = ((data as Record<string, unknown>)?.sets ?? {}) as Record<string, { emoticons?: unknown[] }>;
  for (const set of Object.values(sets)) {
    for (const raw of (set?.emoticons ?? []) as Array<Record<string, unknown>>) {
      const urls = raw?.urls as Record<string, string> | undefined;
      const url = urls?.["2"] || urls?.["1"];
      if (url) addEmote(raw.name, url.startsWith("http") ? url : `https:${url}`);
    }
  }
}

/** Глобальные наборы — загружаются один раз при старте. */
export async function loadGlobalEmotes() {
  if (loadedKeys.has("global")) return;
  loadedKeys.add("global");
  const [seven, bttv] = await Promise.all([
    getJson("https://7tv.io/v3/emote-sets/global"),
    getJson("https://api.betterttv.net/3/cached/emotes/global"),
  ]);
  parse7tv(seven);
  parseBttv(bttv);
  notify();
}

/** Пользовательские смайлы конкретного Twitch-канала. */
export async function loadChannelEmotes(login: string) {
  const key = `tw:${login.toLowerCase()}`;
  if (!login || loadedKeys.has(key)) return;
  loadedKeys.add(key);

  const user = (await getJson(`https://api.betterttv.net/3/cached/users/twitch/${login}`)) as
    | (Record<string, unknown> & { providerId?: string })
    | null;
  if (user) parseBttv(user);

  const id = user?.providerId;
  if (id) {
    const [seven, ffz] = await Promise.all([
      getJson(`https://7tv.io/v3/users/twitch/${id}`),
      getJson(`https://api.frankerfacez.com/v1/room/id/${id}`),
    ]);
    parse7tv((seven as { emote_set?: unknown })?.emote_set);
    parseFfz(ffz);
  }
  notify();
}

/** Разбирает текст на слова и смайлы, сохраняя пробелы. */
export function parseEmotes(text: string): EmoteToken[] {
  if (!text) return [{ type: "text", value: "" }];
  if (cache.size === 0) return [{ type: "text", value: text }];

  const out: EmoteToken[] = [];
  const parts = text.split(/(\s+)/); // сохраняет пробелы как отдельные токены
  for (const tok of parts) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      // пробел — присоединяем к предыдущему текстовому токену или создаём новый
      const last = out[out.length - 1];
      if (last && last.type === "text") last.value += tok;
      else out.push({ type: "text", value: tok });
      continue;
    }
    const url = cache.get(tok);
    if (url) out.push({ type: "emote", value: tok, url });
    else out.push({ type: "text", value: tok });
  }

  // склеиваем соседние текстовые токены
  const merged: EmoteToken[] = [];
  for (const t of out) {
    const last = merged[merged.length - 1];
    if (last && last.type === "text" && t.type === "text") last.value += t.value;
    else merged.push(t);
  }
  return merged.length ? merged : [{ type: "text", value: text }];
}

/** Подписка на загрузку наборов, чтобы лента перерисовалась со смайлами. */
export function useEmotes(channels: Array<{ platform: string; channelId: string }>) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick(version);
    listeners.add(fn);
    loadGlobalEmotes();
    return () => {
      listeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    for (const c of channels) {
      if (c.platform === "twitch") loadChannelEmotes(c.channelId.replace(/^#/, ""));
    }
  }, [channels]);
}
