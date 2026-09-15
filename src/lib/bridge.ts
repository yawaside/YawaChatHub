/**
 * Мост между веб-рендерером и нативной оболочкой.
 *
 * В оригинальном репозитории это был Electron IPC. В WebView2-сборке роль
 * main-процесса выполняет C#-хост (см. папку webview2/): он регистрирует
 * host-объект `window.chrome.webview.hostObjects.yawa` и обрабатывает
 * асинхронные сообщения через `chrome.webview.postMessage`.
 *
 * В обычном браузере моста нет — включается демо-режим (localStorage +
 * speechSynthesis), точно как «сайт» в оригинале.
 */

export interface WidgetInfo {
  url: string;
  port: number;
  running: boolean;
}

/** подписка на канал: то, что хост подключает реальными коннекторами */
export interface ChannelSub {
  platform: "twitch" | "youtube" | "vkplay" | "kick" | "tiktok" | "donationalerts";
  username: string;
  token?: string;
  currency?: string;
}

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (msg: unknown) => void;
        addEventListener: (type: "message", cb: (e: { data: unknown }) => void) => void;
        hostObjects?: { yawa?: Record<string, unknown> };
      };
    };
  }
}

const wv = typeof window !== "undefined" ? window.chrome?.webview : undefined;

export function isDesktop(): boolean {
  return !!wv;
}

/* ---------------- асинхронный JSON-RPC поверх postMessage ---------------- */

let seq = 1;
const pending = new Map<number, PendingCall>();
const hostEventHandlers = new Set<(type: string, payload: unknown) => void>();

if (wv) {
  wv.addEventListener("message", (e) => {
    const d = e.data as {
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      event?: string;
      payload?: unknown;
    } | null;
    if (!d || typeof d !== "object") return;
    if (d.event) {
      // Хост объединяет плотный поток в один IPC-кадр. Распаковываем здесь:
      // компоненты продолжают получать обычные chat.message и не меняют логику.
      if (d.event === "chat.batch" && Array.isArray(d.payload)) {
        for (const item of d.payload)
          hostEventHandlers.forEach((h) => h("chat.message", item));
      } else {
        hostEventHandlers.forEach((h) => h(d.event!, d.payload));
      }
      return;
    }
    if (typeof d.id === "number" && pending.has(d.id)) {
      const p = pending.get(d.id)!;
      pending.delete(d.id);
      if (d.ok) p.resolve(d.result);
      else p.reject(new Error(d.error ?? "host error"));
    }
  });
}

function call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  if (!wv) return Promise.reject(new Error("no bridge"));
  const id = seq++;
  wv.postMessage({ id, method, args });
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    // Длительные операции: озвучка ждёт конца фразы, вход через браузер —
    // действий пользователя. Обычным вызовам хватает восьми секунд.
    // Длительные операции: озвучка ждёт конца фразы, вход через браузер —
    // действий пользователя (device-код Twitch живёт ~10 минут, VK — до 5).
    const timeout =
      method === "tts.speak"
        ? 120_000
        : method === "bot.login"
          ? 600_000
          : method === "moderation.run"
            ? 30_000
            : 8_000;
    window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("bridge timeout"));
      }
    }, timeout);
  });
}

/** подписка на события хоста (глобальные горячие клавиши, трей и т.п.) */
export function onHostEvent(cb: (type: string, payload: unknown) => void): () => void {
  hostEventHandlers.add(cb);
  return () => hostEventHandlers.delete(cb);
}

/* ---------------- настройки ---------------- */

const LS_PREFIX = "yawa:";

export async function settingGet<T>(key: string, fallback: T): Promise<T> {
  // объекты склеиваем с умолчаниями: поля, добавленные в новых версиях
  // (напр. хоткей сквозного клика), не должны пропадать из-за старых сохранений
  const isObj = (x: unknown): x is Record<string, unknown> =>
    typeof x === "object" && x !== null && !Array.isArray(x);
  if (wv) {
    try {
      const v = await call<T | null>("settings.get", key);
      if (v !== null && v !== undefined)
        return (isObj(v) && isObj(fallback) ? { ...fallback, ...v } : v) as T;
    } catch {
      /* fallthrough */
    }
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // КРИТИЧНО: массивы (список команд бота, каналы) нельзя «склеивать»
    // с умолчаниями — иначе массив превращался в объект и падал .find(),
    // из-за чего команды не срабатывали вовсе.
    if (Array.isArray(parsed) || !isObj(parsed) || !isObj(fallback)) return parsed as T;
    return { ...fallback, ...parsed } as T;
  } catch {
    return fallback;
  }
}

export async function settingSet(key: string, value: unknown): Promise<void> {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* noop */
  }
  if (wv) {
    try {
      await call("settings.set", key, value);
    } catch {
      /* noop */
    }
  }
}

/* ---------------- окно без рамки ---------------- */

export const windowCtl = {
  minimize() {
    if (wv) void call("window.minimize");
  },
  toggleMaximize() {
    if (wv) void call("window.toggleMaximize");
  },
  close(closeToTray: boolean) {
    if (wv) void call("window.close", closeToTray);
  },
  async isMaximized(): Promise<boolean> {
    if (!wv) return false;
    try {
      return await call<boolean>("window.isMaximized");
    } catch {
      return false;
    }
  },
};

/* ---------------- TTS (SAPI на хосте / speechSynthesis в браузере) */

export interface HostVoice {
  id: string;
  title: string;
  gender?: string;
}

export const ttsBridge = {
  /**
   * Озвучка фразы. Параметр speaker — ник автора сообщения: если за ним
   * закреплён персональный голос, он важнее выбранного по умолчанию.
   */
  speak(text: string, voice: string, rate: number, volume: number, engine: "edge" | "sapi" = "edge", speaker = "") {
    if (wv)
      return call(
        "tts.speak",
        text,
        voice,
        Math.round(rate * 10 - 10),
        Math.round(volume * 100),
        engine,
        speaker,
      );
    return Promise.reject(new Error("no bridge"));
  },
  /** русские голоса хоста: нейросетевые Edge + системные SAPI */
  async voices(): Promise<{ edge: HostVoice[]; sapi: HostVoice[] }> {
    if (!wv) return { edge: [], sapi: [] };
    try {
      return await call<{ edge: HostVoice[]; sapi: HostVoice[] }>("tts.voices");
    } catch {
      return { edge: [], sapi: [] };
    }
  },
  /** персональный голос пользователя чата (пустая строка = сбросить) */
  setUserVoice(user: string, voice: string) {
    if (wv) return call("userVoice.set", { user, voice });
    return Promise.reject(new Error("no bridge"));
  },
  /** карта закреплённых голосов + список всех доступных голосов */
  async userVoices(): Promise<{
    voices: HostVoice[];
    assigned: { user: string; voice: string; title: string }[];
  }> {
    if (wv) {
      try {
        return await call("userVoice.get");
      } catch {
        return { voices: [], assigned: [] };
      }
    }
    return { voices: [], assigned: [] };
  },
  pause() {
    if (wv) void call("tts.pause");
  },
  resume() {
    if (wv) void call("tts.resume");
  },
  clear() {
    if (wv) void call("tts.clear");
  },
};

/* ---------------- оверлей / виджет / хоткеи ---------------- */

export const overlayBridge = {
  open() {
    if (wv) void call("overlay.open");
  },
  close() {
    if (wv) void call("overlay.close");
  },
  /** переключить видимость окна оверлея; возвращает новое состояние */
  async toggle(): Promise<boolean> {
    if (!wv) return false;
    try {
      return await call<boolean>("overlay.toggle");
    } catch {
      return false;
    }
  },
  async isVisible(): Promise<boolean> {
    if (!wv) return false;
    try {
      return await call<boolean>("overlay.isVisible");
    } catch {
      return false;
    }
  },
  set(cfg: unknown) {
    if (wv) void call("overlay.set", cfg);
  },
  /** статистика площадок для панели оверлея */
  stats(stats: unknown) {
    if (wv) void call("overlay.stats", stats);
  },
  /** начать перетаскивание окна оверлея мышью (свободное размещение) */
  beginDrag() {
    if (wv) void call("overlay.beginDrag");
  },
  /** начать изменение размера окна за край: "e" | "s" | "se" */
  beginResize(dir: "e" | "s" | "se") {
    if (wv) void call("overlay.beginResize", dir);
  },
  /** вернуть оверлей в центр экрана */
  center() {
    if (wv) void call("overlay.center");
  },
};

/** живое применение настроек виджета: хост рассылает их всем OBS-источникам */
export function widgetConfig(cfg: unknown) {
  if (wv) void call("widget.config", cfg);
}

export async function widgetInfo(): Promise<WidgetInfo> {
  if (wv) {
    try {
      return await call<WidgetInfo>("widget.info");
    } catch {
      /* fallthrough */
    }
  }
  return { url: `${location.origin}${location.pathname}#/widget`, port: 0, running: false };
}

export function applyHotkeys(map: Record<string, string>) {
  if (wv) void call("hotkeys.apply", map);
}

/** копирование в буфер: через хост надёжнее, в браузере — clipboard API */
export async function copyText(text: string): Promise<boolean> {
  if (wv) {
    try {
      await call("clipboard.set", text);
      return true;
    } catch {
      /* fallthrough */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- каналы: реальные коннекторы хоста ----------------
 * В ответ хост шлёт события:
 *  "channel.status" → {platform, username, status, viewers}
 *  "chat.message"   → ChatMsg
 */
export const channelsApi = {
  connect(sub: ChannelSub) {
    if (wv) void call("channels.connect", sub);
  },
  disconnect(sub: Pick<ChannelSub, "platform" | "username">) {
    if (wv) void call("channels.disconnect", sub);
  },
  reconnect(sub: ChannelSub) {
    if (wv) void call("channels.reconnect", sub);
  },
};

/** отправка сообщения в чат площадки (ответы команд бота) */
export async function sendChatMessage(platform: string, channel: string, text: string): Promise<void> {
  if (!wv) throw new Error("Отправка доступна только в приложении");
  await call("chat.send", platform, channel, text);
}

/** модерация НА ПЛОЩАДКЕ (Twitch Helix): удаление, баны, режимы чата */
export interface ModerationCall {
  action: string;
  platform: string;
  channel: string;
  author?: string;
  msgId?: string;
  userId?: string;
  roomId?: string;
  seconds?: number;
}

export async function runModerationOnPlatform(req: ModerationCall): Promise<void> {
  if (!wv) throw new Error("Модерация доступна только в приложении");
  await call("moderation.run", req);
}

/** авторизация чат-бота */
export const botApi = {
  /** автоматический вход через браузер (OAuth) */
  async login(platform: "twitch" | "vkplay"): Promise<{ account: string }> {
    if (!wv) throw new Error("Авторизация доступна только в приложении");
    // ждём, пока пользователь войдёт в браузере
    return await call<{ account: string }>("bot.login", platform);
  },
  /** запасной путь: токен вставлен вручную */
  async verify(platform: "twitch" | "vkplay", token: string): Promise<{ account: string; token: string }> {
    if (!wv) throw new Error("Авторизация доступна только в приложении");
    return await call<{ account: string; token: string }>("bot.verify", platform, token);
  },
  logout(platform: "twitch" | "vkplay") {
    if (wv) void call("bot.logout", platform);
  },
};

/** открыть ссылку в браузере по умолчанию (авторизация чат-бота и пр.) */
export function openExternal(url: string) {
  if (wv) void call("shell.openExternal", url);
  else window.open(url, "_blank", "noopener");
}
