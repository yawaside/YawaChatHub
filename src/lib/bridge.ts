// Мост между интерфейсом и desktop-оболочкой (Electron preload → window.sp).
// На сайте (без моста) работает симуляция; в приложении — реальные каналы и SAPI.
import { useCallback, useEffect, useRef, useState } from "react";
import { makeMessage, makeSys, PLATFORMS } from "./core";
import type { ChatMsg, PlatformId } from "./core";
import type { OverlayConfig } from "./widget";

export type UiMode = "site" | "app" | "overlay";

export interface BridgeChannel {
  id: string;
  platform: PlatformId;
  channelId: string;
  status: "online" | "offline" | "error" | "connecting";
  /** текущий онлайн канала; null/undefined — неизвестен (канал офлайн или данных ещё нет) */
  viewers?: number | null;
}

export interface SpBridge {
  mode: "app" | "overlay";
  platform: string;
  onChat: (cb: (m: ChatMsg) => void) => void;
  onChannels: (cb: (list: BridgeChannel[]) => void) => void;
  getChannels: () => Promise<BridgeChannel[]>;
  addChannel: (platform: PlatformId, channelId: string) => void;
  removeChannel: (platform: PlatformId, channelId: string) => void;
  diagnoseNet?: () => void;
  widgetUrl: () => Promise<string>;
  widgetInfo: () => Promise<{ port: number; token: string; url: string; chibiUrl?: string }>;
  widgetTest: (msg: ChatMsg) => void;
  /** Живое оформление OBS-виджета: применяется без смены ссылки. */
  widgetConfig?: (payload: unknown) => void;
  onWidgetClients: (cb: (n: number) => void) => void;
  onHotkey: (cb: (action: string) => void) => void;
  settings: {
    get: () => Promise<Record<string, unknown>>;
    patch: (patch: Record<string, unknown>) => void;
    onChange: (cb: (s: Record<string, unknown>) => void) => void;
  };
  hotkeys: {
    apply: (map: Record<string, string>) => void;
  };
  window: {
    minimize: () => void;
    hideToTray: () => void;
    toggleMaximize: () => void;
    close: () => void;
    onMaximize: (cb: (v: boolean) => void) => void;
    isMaximized: () => Promise<boolean>;
  };
  tts: {
    speak: (p: { text: string; rate: number; volume: number; voice?: string }) => string;
    skip: () => void;
    stopAll: () => void;
    voices: () => Promise<string[]>;
    onEnd: (cb: (id: string) => void) => void;
  };
  overlay: {
    get: () => Promise<OverlayConfig>;
    set: (cfg: Partial<OverlayConfig>) => void;
    onChange: (cb: (o: OverlayConfig) => void) => void;
  };
}

export function getSp(): SpBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { sp?: SpBridge }).sp ?? null;
}

export const isDesktop = () => !!getSp();

export function getUiMode(): UiMode {
  const sp = getSp();
  if (sp) return sp.mode;
  if (typeof location !== "undefined") {
    if (location.hash.startsWith("#/overlay")) return "overlay";
    if (location.hash.startsWith("#/app")) return "app";
  }
  return "site";
}

/* ================= источник сообщений ================= */

export type ChStatus = "online" | "offline" | "error" | "connecting";

export interface Channel {
  id: string;
  platform: PlatformId;
  channelId: string;
  status: ChStatus;
  /** онлайн (число зрителей); null/undefined — неизвестен */
  viewers?: number | null;
  timer?: number;
}

const SIM_DEFAULTS: Channel[] = [
  { id: "c1", platform: "twitch", channelId: "yawaside", status: "online", viewers: 1284 },
  { id: "c2", platform: "youtube", channelId: "LofiRadio24/7", status: "online", viewers: 15920 },
  { id: "c3", platform: "kick", channelId: "cyber_arena", status: "online", viewers: 342 },
  { id: "c4", platform: "tiktok", channelId: "@yawa.live", status: "offline", timer: 24 },
  { id: "c5", platform: "vk", channelId: "vklive.cyber", status: "error", timer: 12 },
];

/** Симуляция онлайна: стартовое значение при подключении и плавный дрейф раз в несколько секунд. */
const SIM_VIEWERS_BASE: Record<PlatformId, number> = { twitch: 1200, youtube: 9000, kick: 350, tiktok: 2600, vk: 180 };
function simInitialViewers(platform: PlatformId): number {
  const base = SIM_VIEWERS_BASE[platform];
  return Math.round(base * (0.6 + Math.random() * 0.8));
}
function simDriftViewers(v: number | null | undefined, platform: PlatformId): number {
  if (typeof v !== "number") return simInitialViewers(platform);
  const delta = Math.round(v * (Math.random() - 0.47) * 0.06);
  return Math.max(1, v + delta);
}

export function useChatSource(onMsg: (m: ChatMsg) => void) {
  const sp = getSp();
  const [channels, setChannels] = useState<Channel[]>(sp ? [] : SIM_DEFAULTS);
  const onMsgRef = useRef(onMsg);
  onMsgRef.current = onMsg;
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  useEffect(() => {
    if (sp) {
      sp.onChat((m) => onMsgRef.current(m));
      sp.onChannels((list) => setChannels(list));
      sp.getChannels().then((list) => {
        if (list.length) setChannels(list);
      });
      return;
    }
    /* ---------- site mode: симуляция ---------- */
    let alive = true;
    let tick = 0;
    const iv = window.setInterval(() => {
      if (!alive) return;
      tick += 1;
      const drift = tick % 4 === 0; // онлайн меняется раз в 4 секунды
      const cur = channelsRef.current;
      let changed = false;
      const next = cur.map((c) => {
        if (c.timer === undefined) {
          if (drift && c.status === "online") {
            changed = true;
            return { ...c, viewers: simDriftViewers(c.viewers, c.platform) };
          }
          return c;
        }
        changed = true;
        const t = c.timer - 1;
        if (c.status === "offline" && t <= 0) {
          onMsgRef.current(makeSys(`Трансляция началась: ${c.channelId}`, c.platform));
          return { ...c, status: "online" as const, timer: 42, viewers: simInitialViewers(c.platform) };
        }
        if (c.status === "online" && t <= 0) {
          if (c.id === "c3") {
            onMsgRef.current(makeSys(`Трансляция завершена: ${c.channelId}`, c.platform));
            return { ...c, status: "offline" as const, timer: 55, viewers: null };
          }
          onMsgRef.current(makeSys(`Соединение потеряно: ${c.channelId}. Повтор через 12 с`, c.platform));
          return { ...c, status: "error" as const, timer: 12, viewers: null };
        }
        if (c.status === "error" && t <= 0) return { ...c, status: "connecting" as const, timer: 2, viewers: null };
        if (c.status === "connecting" && t <= 0) {
          onMsgRef.current(
            makeSys(`Канал подключён: ${PLATFORMS[c.platform].label} / ${c.channelId}`, c.platform)
          );
          return { ...c, status: "online" as const, timer: 46, viewers: simInitialViewers(c.platform) };
        }
        const viewers = drift && c.status === "online" ? simDriftViewers(c.viewers, c.platform) : c.viewers;
        return { ...c, timer: t, viewers };
      });
      if (changed) setChannels(next);
    }, 1000);

    let to = 0;
    const loop = () => {
      if (!alive) return;
      to = window.setTimeout(() => {
        if (!alive) return;
        const online = channelsRef.current.filter((c) => c.status === "online");
        if (online.length) {
          const ch = online[Math.floor(Math.random() * online.length)];
          onMsgRef.current(makeMessage(ch.platform));
        }
        loop();
      }, 900 + Math.random() * 2100);
    };
    loop();

    return () => {
      alive = false;
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addChannel = useCallback(
    (platform: PlatformId, channelId: string) => {
      if (sp) {
        sp.addChannel(platform, channelId);
        return;
      }
      setChannels((c) => [
        ...c,
        { id: `u${Date.now()}`, platform, channelId, status: "connecting" as const, timer: 2 },
      ]);
    },
    [sp]
  );

  const removeChannel = useCallback(
    (id: string) => {
      if (sp) {
        const ch = channelsRef.current.find((c) => c.id === id);
        if (ch) sp.removeChannel(ch.platform, ch.channelId);
        return;
      }
      setChannels((c) => c.filter((x) => x.id !== id));
    },
    [sp]
  );

  return { channels, addChannel, removeChannel, real: !!sp };
}

/* ================= сохраняемые настройки ================= */

/**
 * Объектная настройка, которая живёт в settings.json рядом с exe (desktop)
 * или в localStorage (браузер). Значение сохраняется СРАЗУ при изменении.
 */
export function usePersisted<T extends object>(key: string, initial: T): [T, (v: T) => void] {
  const sp = getSp();
  const [value, setValue] = useState<T>(() => {
    if (sp) return initial; // подтянется из settings.json в эффекте
    try {
      const raw = localStorage.getItem(`yawa:${key}`);
      if (raw) return { ...initial, ...JSON.parse(raw) } as T;
    } catch { /* noop */ }
    return initial;
  });

  useEffect(() => {
    if (!sp) return;
    sp.settings.get().then((s) => {
      const saved = s?.[key];
      if (saved && typeof saved === "object") setValue((cur) => ({ ...cur, ...(saved as object) }) as T);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (v: T) => {
      setValue(v);
      if (sp) sp.settings.patch({ [key]: v });
      else {
        try {
          localStorage.setItem(`yawa:${key}`, JSON.stringify(v));
        } catch { /* noop */ }
      }
    },
    [key, sp]
  );

  return [value, update];
}

/**
 * Простая настройка (число / строка / флаг) верхнего уровня settings.json.
 * Также сохраняется мгновенно — кнопка «Сохранить» не нужна.
 */
export function useSetting<T>(key: string, initial: T): [T, (v: T) => void] {
  const sp = getSp();
  const [value, setValue] = useState<T>(() => {
    if (sp) return initial;
    try {
      const raw = localStorage.getItem(`yawa:${key}`);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch { /* noop */ }
    return initial;
  });

  useEffect(() => {
    if (!sp) return;
    sp.settings.get().then((s) => {
      const saved = s?.[key];
      if (saved !== undefined) setValue(saved as T);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (v: T) => {
      setValue(v);
      if (sp) sp.settings.patch({ [key]: v });
      else {
        try {
          localStorage.setItem(`yawa:${key}`, JSON.stringify(v));
        } catch { /* noop */ }
      }
    },
    [key, sp]
  );

  return [value, update];
}

/** URL и статистика локального сервера виджета */
export function useWidgetInfo(): { port: number; token: string; clients: number; url: string; chibiUrl: string } {
  const sp = getSp();
  const [info, setInfo] = useState({
    port: 47823,
    token: "sp_demo_token",
    clients: 0,
    url: "",
    chibiUrl: "",
  });

  useEffect(() => {
    if (!sp) return;
    sp.widgetInfo().then((i) =>
      setInfo((cur) => ({ ...cur, port: i.port, token: i.token, url: i.url || cur.url, chibiUrl: i.chibiUrl || cur.chibiUrl }))
    );
    sp.onWidgetClients((n) => setInfo((cur) => ({ ...cur, clients: n })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return info;
}

/* подписка на глобальные горячие клавиши desktop-версии */
export function useHotkeys(handlers: Record<string, () => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const sp = getSp();
    if (!sp) return;
    sp.onHotkey((action) => {
      const fn = ref.current[action];
      if (fn) fn();
    });
  }, []);
}

/** состояние «окно развёрнуто на весь экран» (desktop) */
export function useWindowMaximized(): boolean {
  const sp = getSp();
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!sp) return;
    sp.window.isMaximized().then(setMax).catch(() => {});
    sp.window.onMaximize((v) => setMax(v));
  }, [sp]);
  return max;
}
