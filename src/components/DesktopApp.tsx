import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, AudioWaveform, Command, Copy, Heart, Minus, Settings,
  Square, Sun, Terminal, Video, X,
} from "lucide-react";

import ChatFeed, { ModerationMenu } from "./app/ChatFeed";
import { useBotAuth } from "./app/BotAuth";
import { DEFAULT_COMMANDS } from "./app/ChatBotPanel";
import ChannelsPanel, { AddChannelModal } from "./app/ChannelsPanel";
import type { QueueItem } from "./app/VoicePanel";

import SettingsShell from "./app/SettingsShell";
import type { SettingsTabId } from "./app/SettingsShell";
import { IconBtn } from "./app/ui";

import { APP_VARIANTS, getVariant } from "../lib/variants";
import {
  DEFAULT_CHAT_VIEW, DEFAULT_HOTKEYS, DEFAULT_OVERLAY, DEFAULT_TTS, DEFAULT_WIDGET,
} from "../lib/types";
import type {
  BotCommand, ChatMsg, ChatViewConfig, Channel, ModerationRequest, OverlayConfig,
  PlatformId, TtsConfig, WidgetConfig,
} from "../lib/types";
import { isDesktop, onHostEvent, ttsBridge, windowCtl, applyHotkeys, channelsApi, overlayBridge, runModerationOnPlatform, botApi, sendChatMessage } from "../lib/bridge";
import type { ChannelSub } from "../lib/bridge";
import { usePersisted } from "../lib/persist";
import { makeSystem, randomScheduleDelay, seedChannels, tickDemo } from "../lib/demoChat";
import { PLATFORMS, PlatformIcon, nickColor, platformMeta } from "../lib/platforms";
import { sanitizeForSpeech, stripEmotes } from "../lib/emotes";

type HotkeyMap = Record<string, string>;

/** Жёсткий предел истории: предотвращает рост DOM/RAM в долгих эфирах. */
const FEED_CAP = 400;

/* На главной всегда открыта лента; всё остальное — под шестерёнкой. */
type PanelId = "feed";

let qSeq = 100;

/* короткий сигнал перед озвучкой доната (WebAudio) */
let beepCtx: AudioContext | null = null;
function playDonatePing() {
  try {
    beepCtx ??= new AudioContext();
    const t = beepCtx.currentTime;
    const osc = beepCtx.createOscillator();
    const gain = beepCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1320, t + 0.12);
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain).connect(beepCtx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  } catch {
    /* аудио недоступно */
  }
}

export default function DesktopApp() {
  const desktop = isDesktop();
  const [feed, setFeed] = useState<ChatMsg[]>([]);
  // в приложении каналы стартуют пустыми и наполняются реальными коннекторами хоста;
  // в браузере — демо-витрина
  const [channels, setChannels] = useState<Channel[]>(() => (isDesktop() ? [] : seedChannels()));
  const [subs, setSubs, subsLoaded] = usePersisted<ChannelSub[]>("subscriptions", []);
  const [panel] = useState<PanelId>("feed");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("voice");
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);

  /* ----- уведомления ----- */
  const [toastText, setToastText] = useState("");
  const toastTimer = useRef(0);
  const toast = useCallback((t: string) => {
    setToastText(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(""), 2400);
  }, []);

  /* ----- настройки ----- */
  const [tts, setTts] = usePersisted<TtsConfig>("tts", DEFAULT_TTS);
  const [chatView, setChatView] = usePersisted<ChatViewConfig>("chatView", DEFAULT_CHAT_VIEW);
  const [widgetCfg, setWidgetCfg] = usePersisted<WidgetConfig>("widget", DEFAULT_WIDGET);
  const [overlayCfg, setOverlayCfg] = usePersisted<OverlayConfig>("overlay", DEFAULT_OVERLAY);
  const [hotkeys, setHotkeys, hotkeysLoaded] = usePersisted<HotkeyMap>("hotkeys", DEFAULT_HOTKEYS);
  const [variantId, setVariantId] = usePersisted<string>("variant", "command");
  const [maxFeed, setMaxFeed] = usePersisted<number>("maxFeed", 300);
  const [closeToTray, setCloseToTray] = usePersisted<boolean>("closeToTray", false);
  const [minimizeToTray, setMinimizeToTray] = usePersisted<boolean>("minimizeToTray", false);
  const [startHidden, setStartHidden] = usePersisted<boolean>("startHidden", false);
  const [channelsCollapsed, setChannelsCollapsed] = usePersisted<boolean>("channelsCollapsed", false);
  const [hideDeleted, setHideDeleted] = usePersisted<boolean>("feedHideDeleted", false);
  const [mentionHL, setMentionHL] = usePersisted<boolean>("feedMentionHL", true);
  const [donatePing, setDonatePing] = usePersisted<boolean>("donatePing", true);

  const variant = useMemo(() => getVariant(variantId), [variantId]);

  /* ----- «сохранено» ----- */
  const [savedAt, setSavedAt] = useState(0);
  const savedTimer = useRef(0);
  const markSaved = useCallback(
    (label?: string) => {
      setSavedAt(Date.now());
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSavedAt(0), 1900);
      if (label) toast(label);
    },
    [toast]
  );

  const patchTts = useCallback(
    (p: Partial<TtsConfig>) => {
      setTts((prev) => ({ ...prev, ...p }));
      markSaved();
    },
    [setTts, markSaved]
  );
  const patchChatView = useCallback((c: ChatViewConfig) => { setChatView(c); markSaved(); }, [setChatView, markSaved]);
  const patchWidget = useCallback((c: WidgetConfig) => { setWidgetCfg(c); markSaved(); }, [setWidgetCfg, markSaved]);
  const patchOverlay = useCallback((c: OverlayConfig) => { setOverlayCfg(c); markSaved(); }, [setOverlayCfg, markSaved]);
  const patchHotkeys = useCallback(
    (map: HotkeyMap) => {
      // регистрацию выполняет эффект выше — здесь только сохраняем
      setHotkeys(map);
      markSaved();
    },
    [setHotkeys, markSaved]
  );

  /* ГЛАВНОЕ: регистрируем горячие клавиши при СТАРТЕ приложения.
     Раньше applyHotkeys вызывался только при изменении настроек, поэтому
     после перезапуска сохранённые клавиши не регистрировались в системе —
     они «оживали» лишь после ручной перенастройки. */
  useEffect(() => {
    if (!desktop || !hotkeysLoaded) return;
    applyHotkeys(hotkeys);
  }, [desktop, hotkeysLoaded, hotkeys]);

  /** открыть «шестерёнку» на конкретной вкладке */
  const openSettings = useCallback((tab?: SettingsTabId) => {
    if (tab) setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  /* ----- очередь озвучки ----- */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [paused, setPaused] = useState(false);
  const speakingRef = useRef(false);
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  const buildPhrase = useCallback((m: ChatMsg): string | null => {
    const t = ttsRef.current;
    if (t.donatesOnly && m.kind !== "donate") return null;
    if (m.kind !== "chat" && m.kind !== "donate" && m.kind !== "command") return null;

    // смайлы и стикеры по умолчанию не озвучиваются
    const source = t.speakEmotes ? String(m.text ?? "") : stripEmotes(String(m.text ?? ""), m.platform);
    if (!source) return null;

    if (t.skipCommands && source.startsWith("!")) return null;
    if (t.skipLinks && /(https?:\/\/|\b\w+\.(ru|com|gg|tv)\b)/i.test(source)) return null;
    if (source.length > t.maxLen) return null;
    const caps = (source.match(/[А-ЯA-ZЁ]/g) ?? []).length;
    const letters = (source.match(/[А-Яа-яA-Za-zЁё]/g) ?? []).length;
    if (letters > 8 && (caps / letters) * 100 > t.capsLimit) return null;

    let text = source;
    // @упоминания не озвучиваются — читаем только текст без @ника
    text = text.replace(/(^|\s)@\S+/gu, "$1").replace(/\s{2,}/g, " ").trim();
    if (t.squashRepeats) text = text.replace(/(.)\1{2,}/g, "$1$1");
    if (t.stripEmoji) text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
    text = text.replace(/https?:\/\/\S+/gi, t.linkPhrase);
    // постоянное правило: служебные символы («\», «|», «~» и пр.) не озвучиваются
    text = sanitizeForSpeech(text);
    if (!text) return null;

    const parts: string[] = [];
    if (m.kind === "donate") parts.push(`Донат ${m.amount} ${m.currency} от ${m.author}.`);
    else {
      if (t.speakPlatform) parts.push(`С площадки ${m.platform}.`);
      if (t.speakAuthor) parts.push(`${m.author}:`);
    }
    parts.push(text);
    return parts.join(" ");
  }, []);

  /* проигрывание: WebView2 → SAPI через мост, браузер → speechSynthesis */
  useEffect(() => {
    if (paused || speakingRef.current || !queue.length) return;
    const item = queue[0];
    // Раньше здесь был лишний цикл: сначала помечали «speaking», ждали
    // повторный рендер и только потом озвучивали — это добавляло задержку
    // к каждой фразе. Стартуем сразу, статус обновляем параллельно.
    speakingRef.current = true;
    if (item.status !== "speaking") {
      setQueue((q) => q.map((x, i) => (i === 0 ? { ...x, status: "speaking" } : x)));
    }
    const done = () => {
      speakingRef.current = false;
      setQueue((q) => q.slice(1));
    };
    const t = ttsRef.current;
    if (desktop) {
      ttsBridge
        .speak(item.text, t.voice, t.rate, t.volume, t.engine ?? "edge", item.author)
        .then(done)
        .catch((error) => {
          const message = error instanceof Error ? error.message : "неизвестная ошибка";
          toast(`${t.engine === "edge" ? "Edge TTS" : "SAPI"}: ${message}`);
          done();
        });
    } else if (typeof window.speechSynthesis !== "undefined") {
      const u = new SpeechSynthesisUtterance(item.text);
      const vs = window.speechSynthesis.getVoices();
      const v = vs.find((x) => x.name === t.voice) ?? vs.find((x) => x.lang.startsWith("ru"));
      if (v) u.voice = v;
      u.rate = t.rate;
      u.volume = t.volume;
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    } else {
      window.setTimeout(done, 900);
    }
  }, [queue, paused, desktop, toast]);

  const donatePingRef = useRef(donatePing);
  donatePingRef.current = donatePing;

  const speakNow = useCallback(
    (m: ChatMsg) => {
      const t = ttsRef.current;
      if (!t.enabled) return;
      const phrase = buildPhrase(m);
      if (!phrase) return;
      if (m.kind === "donate" && donatePingRef.current) playDonatePing();
      setQueue((q) => [...q.slice(-25), { id: ++qSeq, author: m.author, text: phrase, status: "waiting" }]);
    },
    [buildPhrase]
  );

  const skipQueueItem = useCallback(() => {
    if (desktop) ttsBridge.clear();
    else window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setQueue((q) => q.slice(1));
  }, [desktop]);

  const clearQueue = useCallback(() => {
    if (desktop) ttsBridge.clear();
    else window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setQueue([]);
  }, [desktop]);

  const testSpeak = useCallback(
    (text: string) => {
      setQueue((q) => [...q, { id: ++qSeq, author: "тест", text, status: "waiting" }]);
      setPaused(false);
    },
    []
  );

  /* авторизованные аккаунты бота: канал и вход живут вместе */
  const [botAuth, setBotAuth] = useBotAuth();
  const botAuthRef = useRef(botAuth);
  useEffect(() => {
    botAuthRef.current = botAuth;
  }, [botAuth]);

  /* ----- команды чат-бота ----- */
  const [botCommands, setBotCommands] = usePersisted<BotCommand[]>("botCommands", DEFAULT_COMMANDS);
  const botCommandsRef = useRef(botCommands);
  useEffect(() => {
    botCommandsRef.current = botCommands;
  }, [botCommands]);
  const cmdCooldownRef = useRef<Record<string, number>>({});
  /** последний отправленный ботом ответ на канал — защита от эха */
  const sentRepliesRef = useRef<Record<string, string>>({});

  const runBotCommand = useCallback(
    (msg: ChatMsg) => {
      if (!desktop || msg.kind !== "chat") return;
      const text = (msg.text ?? "").trim();
      if (!text.startsWith("!")) return;

      // Защита от зацикливания — ТОЛЬКО по тексту ответа бота.
      // Раньше сравнивался автор с авторизованным аккаунтом, но у стримера
      // ник совпадает с именем канала, поэтому его собственные команды
      // («!вк» в своём чате) молча игнорировались.
      const echoKey = `${msg.platform}:${(msg.channel ?? "").toLowerCase()}`;
      if (sentRepliesRef.current[echoKey] === text) return;

      // триггер сравниваем без «!» — его часто сохраняют по-разному
      const norm = (v: string) => v.trim().toLowerCase().replace(/^!+/, "");
      const trigger = norm(text.split(/\s+/)[0]);
      const list = Array.isArray(botCommandsRef.current) ? botCommandsRef.current : [];
      const cmd = list.find(
        (c) =>
          c.enabled &&
          norm(c.trigger) === trigger &&
          (c.platform === "all" || c.platform === msg.platform)
      );
      if (!cmd) return;

      // кулдаун на команду и канал
      const key = `${cmd.id}:${msg.platform}:${msg.channel}`;
      const now = Date.now();
      const readyAt = cmdCooldownRef.current[key] ?? 0;
      if (now < readyAt) return;
      cmdCooldownRef.current[key] = now + Math.max(0, cmd.cooldown) * 1000;

      const answer = cmd.response.replace(/\{user\}/gi, msg.author);
      // канал ответа = канал, откуда пришла команда; если коннектор его не
      // передал, берём подключённый канал этой площадки
      const target =
        (msg.channel ?? "").trim() ||
        channelsRef.current.find((c) => c.platform === msg.platform)?.username ||
        "";
      if (!target) {
        setFeed((f) => [...f, makeSystem("Бот: неизвестен канал для ответа")].slice(-FEED_CAP));
        return;
      }
      sentRepliesRef.current[`${msg.platform}:${target.toLowerCase()}`] = answer;
      void sendChatMessage(msg.platform, target, answer)
        .then(() => {
          // ответ реально ушёл в чат площадки — показываем его и в ленте
          setFeed((f) => [...f, makeSystem(`Бот → ${target}: ${answer}`)].slice(-FEED_CAP));
        })
        .catch((e: unknown) => {
          const err = e instanceof Error ? e.message : "не удалось отправить ответ";
          setFeed((f) => [...f, makeSystem(`Бот: ${err}`)].slice(-FEED_CAP));
        });
    },
    [desktop]
  );

  /* ----- каналы ----- */
  const subKey = useCallback((platform: PlatformId, username: string) => `${platform}:${username.toLowerCase()}`, []);

  const connectChannel = useCallback(
    (platform: PlatformId, username: string, opts?: { token?: string; currency?: string }) => {
      const sub: ChannelSub = { platform, username, ...opts };
      if (desktop) {
        // реальное подключение через коннектор хоста
        setSubs((prev) => [...prev.filter((s) => subKey(s.platform, s.username) !== subKey(platform, username)), sub]);
        channelsApi.connect(sub);
        setChannels((prev) => [
          ...prev.filter((c) => !(c.platform === platform && c.username === username)),
          { id: `c-${subKey(platform, username)}`, platform, username, status: "connecting", viewers: 0, messages: 0, ...opts },
        ]);
        setFeed((f) => [...f, makeSystem(`Подключение: ${platform}/${username}…`)].slice(-FEED_CAP));
        toast(`Подключаем ${username}…`);
        return;
      }
      // браузерная демо-витрина
      const id = `c${Date.now()}`;
      setChannels((prev) => [
        ...prev.filter((c) => !(c.platform === platform && c.username === username)),
        { id, platform, username, status: "connecting", viewers: 0, messages: 0, ...opts },
      ]);
      setFeed((f) => [...f, makeSystem(`Подключение: ${platform}/${username}…`)].slice(-FEED_CAP));
      window.setTimeout(() => {
        const online = Math.random() > 0.25;
        setChannels((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, status: online ? "online" : "offline", viewers: online ? 120 + Math.floor(Math.random() * 4000) : 0 }
              : c
          )
        );
        setFeed((f) =>
          [...f, makeSystem(online ? `Подключено: ${platform}/${username}` : `${platform}/${username} сейчас офлайн — чат ждёт эфир`)].slice(-FEED_CAP)
        );
      }, 900 + Math.random() * 1400);
      toast(`Подключаем ${username}…`);
    },
    [desktop, setSubs, subKey, toast]
  );

  const disconnectChannel = useCallback(
    (id: string) => {
      const c = channelsRef.current.find((x) => x.id === id);
      if (c && desktop) {
        channelsApi.disconnect({ platform: c.platform, username: c.username });
        setSubs((prev) => prev.filter((s) => !(s.platform === c.platform && s.username === c.username)));

        // Канал авторизованного аккаунта удалён → сбрасываем и саму авторизацию
        const account = botAuthRef.current[c.platform];
        if (account && account.toLowerCase() === c.username.toLowerCase()) {
          botApi.logout(c.platform as "twitch" | "vkplay");
          setBotAuth((prev) => {
            const next = { ...prev };
            delete next[c.platform];
            return next;
          });
          setFeed((f) => [...f, makeSystem(`Авторизация ${c.platform} сброшена вместе с каналом`)].slice(-FEED_CAP));
        }
      }
      if (c) setFeed((f) => [...f, makeSystem(`Отключено: ${c.platform}/${c.username}`)].slice(-FEED_CAP));
      setChannels((prev) => prev.filter((x) => x.id !== id));
    },
    [desktop, setSubs, setBotAuth]
  );

  const reconnectChannel = useCallback(
    (id: string) => {
      const c = channelsRef.current.find((x) => x.id === id);
      setChannels((prev) => prev.map((x) => (x.id === id ? { ...x, status: "connecting" as const } : x)));
      if (desktop && c) {
        channelsApi.reconnect({ platform: c.platform, username: c.username, token: c.token, currency: c.currency });
        return;
      }
      window.setTimeout(() => {
        setChannels((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: "online" as const, viewers: x.viewers || 300 + Math.floor(Math.random() * 2000) } : x))
        );
      }, 1000);
    },
    [desktop]
  );

  /* ----- демо-симуляция (в WebView2 события приходят от хоста) ----- */
  const channelsRef = useRef(channels);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);


  useEffect(() => {
    if (desktop) return; // хост присылает реальные события
    let alive = true;
    let timer = 0;

    // приветствие
    setFeed([makeSystem("YawaChatHub · демо-режим — в приложении здесь живой чат со всех площадок")]);
    const t0 = window.setTimeout(() => {
      setChannels((prev) => prev.map((c) => (c.username === "kra1n_38" ? { ...c, status: "online" as const, viewers: 486 } : c)));
      setFeed((f) => [...f, makeSystem("Подключено: vkplay/kra1n_38")]);
    }, 2600);

    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        const { msg, drift } = tickDemo(channelsRef.current);
        if (msg) {
          setFeed((f) => [...f, msg].slice(-FEED_CAP));
          speakNow(msg);
        }
        if (drift.size) {
          setChannels((cur) => cur.map((c) => (drift.has(c.id) ? { ...c, viewers: drift.get(c.id)! } : c)));
        }
        schedule();
      }, randomScheduleDelay());
    };
    schedule();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearTimeout(t0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  /* при старте приложения: восстановить сохранённые подписки и подключить их реальными коннекторами */
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!desktop || hydratedRef.current || !subsLoaded) return;
    hydratedRef.current = true;
    if (!subs.length) {
      setFeed([makeSystem("YawaChatHub 1.1.9 · подключите канал — лента наполнится реальным чатом")]);
      return;
    }
    setFeed([makeSystem(`Восстановлен профиль: ${subs.length} кан. — подключаем…`)]);
    setChannels(
      subs.map((s) => ({
        id: `c-${subKey(s.platform, s.username)}`,
        platform: s.platform,
        username: s.username,
        status: "connecting" as const,
        viewers: 0,
        messages: 0,
        token: s.token,
        currency: s.currency,
      }))
    );
    // Не запускаем все сетевые коннекторы в одну миллисекунду: TLS/WebSocket
    // рукопожатия распределены по 250 мс — старт без пика CPU/сети.
    const timers = subs.map((s, i) =>
      window.setTimeout(() => channelsApi.connect(s), i * 250)
    );
    return () => timers.forEach(window.clearTimeout);
  }, [desktop, subsLoaded, subs, subKey]);

  /* Буфер входящих сообщений: копим кадр (~120 мс) и добавляем одной
     операцией. Так частота перерисовок не зависит от плотности чата. */
  const feedBufferRef = useRef<ChatMsg[]>([]);
  const feedFlushRef = useRef<number | null>(null);

  const pushToFeed = useCallback(
    (msg: ChatMsg) => {
      feedBufferRef.current.push(msg);
      if (feedFlushRef.current !== null) return;
      feedFlushRef.current = window.setTimeout(() => {
        feedFlushRef.current = null;
        const batch = feedBufferRef.current;
        feedBufferRef.current = [];
        if (batch.length === 0) return;
        setFeed((f) => (f.length + batch.length > FEED_CAP ? [...f, ...batch].slice(-FEED_CAP) : [...f, ...batch]));
      }, 120);
    },
    []
  );

  useEffect(() => () => {
    if (feedFlushRef.current !== null) window.clearTimeout(feedFlushRef.current);
  }, []);

  /* события хоста WebView2: реальные сообщения, статусы каналов, хоткеи */
  useEffect(() => {
    if (!desktop) return;
    return onHostEvent((type, payload) => {
      if (type === "chat.message") {
        const m = (payload ?? {}) as Partial<ChatMsg>;
        // защитная нормализация: коннекторы площадок могут прислать
        // неполные поля, а падение здесь гасило всё окно
        const platform = (m.platform ?? "twitch") as PlatformId;
        const author = String(m.author ?? "");

        // События модерации ОТ площадки: сообщение удалили/забанили в другом
        // клиенте — лента должна это отразить, а не жить своей жизнью.
        const kindRaw = String(m.kind ?? "chat");
        if (kindRaw.startsWith("moderation.")) {
          if (kindRaw === "moderation.delete" && m.msgId) {
            setFeed((f) => f.map((x) => (x.msgId === m.msgId ? { ...x, deleted: true } : x)));
          } else if (kindRaw === "moderation.ban") {
            const login = author.toLowerCase();
            setFeed((f) =>
              f.map((x) =>
                x.platform === platform && x.author.toLowerCase() === login ? { ...x, deleted: true } : x
              )
            );
          } else if (kindRaw === "moderation.clear") {
            setFeed((f) => f.filter((x) => x.platform !== platform));
          }
          return;
        }
        const norm: ChatMsg = {
          id: Date.now() + Math.random(),
          ts: typeof m.ts === "number" && m.ts > 0 ? m.ts : Date.now(),
          platform,
          channel: String(m.channel ?? ""),
          author,
          color: m.color || nickColor(author, platformMeta(platform).color),
          text: String(m.text ?? ""),
          kind: m.kind ?? "chat",
          badges: Array.isArray(m.badges) ? m.badges : undefined,
          amount: typeof m.amount === "number" ? m.amount : undefined,
          currency: m.currency,
          msgId: m.msgId,
          userId: m.userId,
          roomId: m.roomId,
        };
        if (!norm.text && norm.kind === "chat") return;
        // ПАКЕТНАЯ вставка: при плотном чате обновление состояния на каждое
        // сообщение вызывало перерисовку всего окна и грузило процессор.
        pushToFeed(norm);
        speakNow(norm);
        runBotCommand(norm);
      } else if (type === "bot.authorized") {
        // Вход выполнен → канал этого аккаунта добавляется автоматически
        const b = payload as { platform: PlatformId; account: string; channel?: string };
        // для VK канал = slug live.vkvideo.ru, он отличается от ника аккаунта
        const channelName = (b?.channel || b?.account || "").trim();
        if (b?.account && channelName) {
          setBotAuth((prev) => ({ ...prev, [b.platform]: channelName }));
          const exists = channelsRef.current.some(
            (c) => c.platform === b.platform && c.username.toLowerCase() === channelName.toLowerCase()
          );
          if (!exists) connectChannel(b.platform, channelName);
        } else if (b?.account) {
          setBotAuth((prev) => ({ ...prev, [b.platform]: b.account }));
          setFeed((f) => [...f, makeSystem(
            `${b.platform}: вход выполнен, но канал не найден — добавьте его вручную`
          )].slice(-FEED_CAP));
        }
      } else if (type === "hotkeys.failed") {
        // Клавишу занял другой процесс — раньше это было незаметно,
        // и пользователь считал, что хоткеи «не работают».
        const list = Array.isArray(payload) ? (payload as string[]) : [];
        const combos = list
          .map((x) => x.split(":").slice(1).join(":"))
          .filter(Boolean)
          .join(", ");
        if (combos) {
          toast(`Горячие клавиши заняты другой программой: ${combos}`);
          setFeed((f) =>
            [...f, makeSystem(`Не удалось назначить клавиши: ${combos}. Выберите другое сочетание.`)].slice(-FEED_CAP)
          );
        }
      } else if (type === "moderation.result") {
        const r = payload as {
          action: string;
          platform: PlatformId;
          channel: string;
          msgId?: string;
          userId?: string;
          author?: string;
        };
        // Лента меняется ТОЛЬКО после успешного HTTP-ответа Twitch.
        if (r.action === "delete" && r.msgId) {
          setFeed((f) => f.map((x) => (x.msgId === r.msgId ? { ...x, deleted: true } : x)));
        } else if (r.action === "ban" || r.action === "timeout") {
          const login = (r.author ?? "").toLowerCase();
          setFeed((f) =>
            f.map((x) =>
              x.platform === r.platform && x.author.toLowerCase() === login ? { ...x, deleted: true } : x
            )
          );
        } else if (r.action === "mode-clear") {
          setFeed((f) => f.filter((x) => x.platform !== r.platform));
        }
        toast(`Twitch подтвердил: ${r.action}`);
        setFeed((f) => [...f, makeSystem(`Twitch: ${r.action} выполнено в ${r.channel}`)].slice(-FEED_CAP));
      } else if (type === "channel.status") {
        const s = payload as { platform: PlatformId; username: string; status: Channel["status"]; viewers: number };
        const prev = channelsRef.current.find(
          (c) => c.platform === s.platform && c.username.toLowerCase() === s.username.toLowerCase()
        );
        setChannels((cur) =>
          cur.map((c) =>
            c.platform === s.platform && c.username.toLowerCase() === s.username.toLowerCase()
              ? { ...c, status: s.status, viewers: s.viewers }
              : c
          )
        );
        if (prev && prev.status !== s.status) {
          const line =
            s.status === "online"
              ? `Подключено: ${s.platform}/${s.username}`
              : s.status === "offline"
                ? `${s.platform}/${s.username} офлайн — чат ждёт эфир`
                : s.status === "error"
                  ? `Ошибка подключения: ${s.platform}/${s.username}`
                  : "";
          if (line) setFeed((f) => [...f, makeSystem(line)].slice(-FEED_CAP));
        }
      } else if (type === "overlay.moved") {
        // оверлей перетащили мышью — запоминаем позицию в настройках
        const pos = payload as { x: number; y: number };
        setOverlayCfg((prev) => ({ ...prev, posX: pos.x, posY: pos.y }));
      } else if (type === "overlay.resized") {
        // оверлей растянули за край — фиксируем новый размер в React,
        // иначе при следующем обновлении окно сбрасывалось в старый размер
        const sz = payload as { width: number; height: number };
        setOverlayCfg((prev) => ({ ...prev, width: sz.width, height: sz.height }));
      } else if (type === "hotkey") {
        runHotkeyAction(String(payload));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, hotkeys]);

  /** действие по id (хоткеи хоста приходят уже как id действия) */
  const runHotkeyAction = useCallback(
    (action: string) => {
      switch (action) {
        case "toggleSpeech":
          patchTts({ enabled: !ttsRef.current.enabled });
          toast(ttsRef.current.enabled ? "Озвучка выключена" : "Озвучка включена");
          break;
        case "pauseQueue":
          setPaused((p) => !p);
          break;
        case "skipQueue":
          skipQueueItem();
          break;
        case "clearFeed":
          setFeed([]);
          toast("Лента очищена");
          break;
        case "toggleOverlay":
          if (desktop) {
            void overlayBridge.toggle().then((v) => toast(v ? "Оверлей показан" : "Оверлей скрыт"));
          } else {
            openSettings("overlay");
          }
          break;
        case "toggleClickThrough":
          setOverlayCfg((prev) => {
            // В свободном режиме прозрачность возвращается после фиксации;
            // в угловом режиме достаточно переключить сквозной клик.
            const enable = prev.freePosition
              ? !(prev.locked && prev.clickThrough)
              : !prev.clickThrough;
            toast(enable ? "Прозрачность оверлея включена" : "Прозрачность оверлея выключена");
            return prev.freePosition
              ? { ...prev, locked: enable, clickThrough: enable }
              : { ...prev, clickThrough: enable };
          });
          break;
      }
    },
    [patchTts, toast, skipQueueItem, openSettings, setOverlayCfg]
  );

  /** комбинация клавиш → действие по текущей карте хоткеев */
  const handleHotkey = useCallback(
    (combo: string) => {
      const entry = Object.entries(hotkeys).find(([, v]) => v === combo);
      if (entry) runHotkeyAction(entry[0]);
    },
    [hotkeys, runHotkeyAction]
  );

  /* Локальные клавиши — ТОЛЬКО вне приложения.
     В WebView2 хоткеи регистрирует хост (RegisterHotKey) и присылает событие
     "hotkey". Раньше срабатывали оба обработчика сразу, и оверлей
     переключался дважды — визуально «через раз». */
  useEffect(() => {
    if (desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      parts.push(e.code); // физический код — независимо от раскладки
      const combo = parts.join("+");
      if (Object.values(hotkeys).includes(combo)) {
        e.preventDefault();
        handleHotkey(combo);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeys, handleHotkey, desktop]);

  /* ----- модерация ----- */
  const [modReq, setModReq] = useState<ModerationRequest | null>(null);
  const runModeration = useCallback(
    (action: string, msg: ChatMsg, arg?: number) => {
      setModReq(null);

      if (desktop && msg.platform === "twitch" && msg.kind !== "system") {
        toast("Отправляем действие в Twitch…");
        void runModerationOnPlatform({
          action,
          platform: msg.platform,
          channel: msg.channel,
          author: msg.author,
          msgId: msg.msgId,
          userId: msg.userId,
          roomId: msg.roomId,
          seconds: typeof arg === "number" ? arg : undefined,
        }).catch((e: unknown) => {
          const text = e instanceof Error ? e.message : "не удалось выполнить на площадке";
          // Ничего локально не скрываем: Twitch действие НЕ подтвердил.
          toast(`Twitch: ${text}`);
          setFeed((f) => [...f, makeSystem(`Ошибка Twitch: ${text}`)].slice(-FEED_CAP));
        });
        return;
      }

      toast("Модерация на этой площадке пока не поддерживается");
    },
    [toast, desktop]
  );

  /** Общая модерация канала: режимы чата, не связанные с пользователем. */
  const runChatMode = useCallback(
    (action: string, channel: string, platform: PlatformId, seconds?: number) => {
      if (!desktop) {
        toast("Модерация доступна только в приложении");
        return;
      }
      toast("Отправляем в Twitch…");
      void runModerationOnPlatform({ action, platform, channel, seconds }).catch((e: unknown) => {
        const text = e instanceof Error ? e.message : "не удалось применить режим";
        toast(`Twitch: ${text}`);
        setFeed((f) => [...f, makeSystem(`Ошибка Twitch: ${text}`)].slice(-FEED_CAP));
      });
    },
    [desktop, toast]
  );

  const onlineCount = channels.filter((c) => c.status === "online").length;
  const connectedCount = channels.filter((c) => c.status === "online" || c.status === "connected").length;
  const onlineViewers = channels.reduce((s, c) => s + (c.status === "online" ? c.viewers : 0), 0);

  /* Сводка по ленте одним проходом. Раньше на каждое сообщение лента
     обходилась многократно (общий счётчик + донаты + счётчик на площадку),
     что и давало основную нагрузку при плотном чате. */
  const feedSummary = useMemo(() => {
    let total = 0;
    let donateTotal = 0;
    let donateCount = 0;
    let donateCurrency: string | undefined;
    const perPlatform = new Map<PlatformId, number>();

    for (const m of feed) {
      if (m.kind === "system") continue;
      total++;
      perPlatform.set(m.platform, (perPlatform.get(m.platform) ?? 0) + 1);
      if (m.kind === "donate" && typeof m.amount === "number") {
        donateTotal += m.amount;
        donateCount++;
        donateCurrency = m.currency ?? donateCurrency;
      }
    }
    return { total, donateTotal, donateCount, donateCurrency, perPlatform };
  }, [feed]);

  const feedTotal = feedSummary.total;

  /* ----- статистика для панели оверлея: донаты первыми ----- */
  const overlayStats = useMemo(() => {
    const currency = feedSummary.donateCurrency ?? channels.find((c) => c.currency)?.currency ?? "₽";

    const order: PlatformId[] = ["twitch", "youtube", "vkplay", "kick", "tiktok"];
    const platforms = order
      .filter((p) => channels.some((c) => c.platform === p))
      .map((p) => {
        const list = channels.filter((c) => c.platform === p);
        return {
          platform: p,
          // «в эфире» только при подтверждённой трансляции, иначе просто подключено
          online: list.some((c) => c.status === "online"),
          connected: list.some((c) => c.status === "online" || c.status === "connected"),
          viewers: list.reduce((s, c) => s + (c.status === "online" ? c.viewers : 0), 0),
          messages: feedSummary.perPlatform.get(p) ?? 0,
        };
      });

    return {
      donations: { total: feedSummary.donateTotal, currency, count: feedSummary.donateCount },
      platforms,
    };
  }, [feedSummary, channels]);

  /* отправляем статистику оверлею (не чаще раза в секунду) */
  const statsRef = useRef("");
  useEffect(() => {
    if (!desktop) return;
    const json = JSON.stringify(overlayStats);
    if (json === statsRef.current) return;
    const t = window.setTimeout(() => {
      statsRef.current = json;
      overlayBridge.stats(overlayStats);
    }, 700);
    return () => window.clearTimeout(t);
  }, [overlayStats, desktop]);

  /* конфиг оверлея — сразу в окно оверлея при изменении */
  useEffect(() => {
    if (desktop) overlayBridge.set(overlayCfg);
  }, [overlayCfg, desktop]);

  /* ----- применение палитры варианта к :root ----- */
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(variant.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    document.body.classList.toggle("dw-mono", !!variant.mono);
  }, [variant]);



  const renderPanel = () => {
    switch (panel) {
      case "feed":
        return (
          <ChatFeed
            feed={feed}
            channels={channels}
            view={chatView}
            maxFeed={maxFeed}
            hideDeleted={hideDeleted}
            mentionHL={mentionHL}
            onModerate={setModReq}
            onChatMode={runChatMode}
            onClear={() => {
              setFeed([]);
              toast("Лента очищена");
            }}
          />
        );
    }
  };

  const isTerm = variant.id === "terminal";
  const titlebarBrand = isTerm ? (
    <>
      <Terminal size={14} style={{ color: "var(--dw-accent)" }} />
      <span className="text-[12.5px] font-bold tracking-wide" style={{ color: "var(--dw-text)" }}>
        YAWACHAT_HUB
      </span>
    </>
  ) : (
    <>
      <span
        className="flex h-[22px] w-[22px] items-center justify-center rounded-lg"
        style={{ background: "linear-gradient(135deg, var(--dw-accent), var(--dw-accent-2))" }}
      >
        <AudioWaveform size={12} color="#fff" />
      </span>
      <span className="text-[12.5px] font-bold tracking-tight" style={{ color: "var(--dw-text)" }}>
        YawaChatHub
      </span>
    </>
  );

  const winBtns = (
    <>
      <IconBtn
        icon={<Minus size={14} />}
        title={minimizeToTray ? "Свернуть в трей" : "Свернуть"}
        onClick={() => {
          windowCtl.minimize();
          if (!desktop) toast("В приложении окно сворачивается на панель задач");
        }}
      />
      <IconBtn
        icon={maximized ? <Copy size={12} style={{ transform: "rotate(180deg)" }} /> : <Square size={12} />}
        title={maximized ? "Оконный режим" : "Во весь экран"}
        onClick={() => {
          windowCtl.toggleMaximize();
          setMaximized(!maximized);
        }}
      />
      <IconBtn
        icon={<X size={15} />}
        title={closeToTray ? "Скрыть в трей" : "Закрыть"}
        danger
        onClick={() => {
          windowCtl.close(closeToTray);
          if (!desktop) toast(closeToTray ? "Окно ушло бы в трей" : "В приложении окно закрывается");
        }}
      />
    </>
  );

  const channelsBody = (
    <ChannelsPanel
      channels={channels}
      collapsed={channelsCollapsed}
      style={variant.id as "command" | "terminal" | "studio"}
      donationTotal={overlayStats.donations.total}
      onToggleCollapsed={() => setChannelsCollapsed(!channelsCollapsed)}
      onConnect={connectChannel}
      onDisconnect={disconnectChannel}
      onReconnect={reconnectChannel}
      toast={toast}
    />
  );

  /* ============ РАСКЛАДКА ============ */
  return (
    <div className="dw-window flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--dw-bg)", color: "var(--dw-text)", fontSize: 13 }}>
      {/* заголовок окна (frameless) */}
      <header
        className="drag-region flex h-11 shrink-0 items-center gap-3 border-b pr-2 pl-3"
        style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
        onDoubleClick={() => {
          windowCtl.toggleMaximize();
          setMaximized(!maximized);
        }}
      >
        {titlebarBrand}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${onlineCount > 0 ? "pulse-dot" : ""}`}
          style={{
            background: onlineCount > 0 ? "#4ade80" : connectedCount > 0 ? "var(--dw-accent)" : "var(--dw-dim)",
            boxShadow: onlineCount > 0 ? "0 0 8px rgba(74,222,128,0.7)" : "none",
          }}
        />
        <span
          className="no-drag hidden text-[11px] whitespace-nowrap md:block"
          style={{
            color:
              onlineCount > 0
                ? variant.id === "studio"
                  ? "#16a34a"
                  : "#4ade80"
                : connectedCount > 0
                  ? "var(--dw-accent-2)"
                  : "var(--dw-dim)",
          }}
        >
          {onlineCount > 0
            ? `${onlineCount} в эфире${onlineViewers > 0 ? ` · ${onlineViewers.toLocaleString("ru-RU")} зрителей` : ""}`
            : connectedCount > 0
              ? `${connectedCount} подключено`
              : "нет подключений"}
        </span>

        <div className="mx-auto" />

        {/* переключатель варианта интерфейса */}
        <div className="no-drag flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "var(--dw-input)" }}>
          {APP_VARIANTS.map((v) => {
            const I = v.id === "terminal" ? Terminal : v.id === "studio" ? Sun : Command;
            const on = variant.id === v.id;
            return (
              <button
                key={v.id}
                title={`${v.name} — ${v.desc}`}
                onClick={() => {
                  setVariantId(v.id);
                  toast(`Оформление: ${v.name}`);
                }}
                className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md transition-all"
                style={{
                  background: on ? "var(--dw-accent)" : "transparent",
                  color: on ? "#fff" : "var(--dw-dim)",
                }}
              >
                <I size={12} />
              </button>
            );
          })}
        </div>

        {/* быстрый тумблер озвучки */}
        <button
          className="no-drag flex h-[26px] cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition-all"
          title="Быстрое вкл/выкл озвучки (F9)"
          onClick={() => {
            patchTts({ enabled: !tts.enabled });
            toast(tts.enabled ? "Озвучка выключена" : "Озвучка включена");
          }}
          style={{
            background: tts.enabled ? "color-mix(in srgb, var(--dw-accent) 18%, transparent)" : "var(--dw-input)",
            color: tts.enabled ? "var(--dw-accent-2)" : "var(--dw-dim)",
          }}
        >
          <AudioLines size={13} />
          <span className="hidden lg:inline">{tts.enabled ? "TTS вкл" : "TTS выкл"}</span>
        </button>

        {/* сообщений в ленте */}
        <span className="no-drag hidden rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums sm:block" style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}>
          {feedTotal} msg
        </span>

        <div className="no-drag flex items-center gap-0.5">
          <IconBtn
            icon={<Heart size={14} />}
            title="Поддержать автора"
            onClick={() => openSettings("support")}
          />
          <IconBtn icon={<Video size={14} />} title="Оверлей поверх игры" onClick={() => openSettings("overlay")} />
          <IconBtn icon={<Settings size={14} />} title="Настройки" onClick={() => openSettings()} />
          {desktop ? winBtns : (
            <>
              <span className="ml-1 mr-1 hidden h-4 w-px sm:block" style={{ background: "var(--dw-line)" }} />
              {winBtns}
            </>
          )}
        </div>
      </header>

      {/* терминал: каналы сверху строкой-статусом */}
      {variant.layout === "top" && (
        <div
          className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-2 py-1.5"
          style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
        >
          <span className="shrink-0 px-1 font-mono text-[10px] font-bold" style={{ color: "var(--dw-accent)" }}>
            ~/channels
          </span>
          <span className="h-4 w-px shrink-0" style={{ background: "var(--dw-line)" }} />

          {PLATFORMS.map((p) => {
            const chs = channels.filter((c) => c.platform === p.id);
            if (!chs.length) return null;
            const live = chs.filter((c) => c.status === "online");
            const viewers = live.reduce((s, c) => s + c.viewers, 0);
            const on = live.length > 0;
            return (
              <span
                key={p.id}
                className="flex shrink-0 cursor-default items-center gap-1.5 rounded px-2 py-1 font-mono text-[10.5px] transition-all"
                style={{
                  background: on ? `${p.color}1c` : "var(--dw-input)",
                  boxShadow: on ? `inset 0 0 0 1px ${p.color}55` : "none",
                  color: on ? "var(--dw-text)" : "var(--dw-dim)",
                  opacity: on ? 1 : 0.6,
                }}
                title={chs.map((c) => `${c.username}: ${c.status}`).join("\n")}
              >
                <PlatformIcon id={p.id} size={12} />
                <span className="font-semibold">
                  {chs.length > 1 ? `${chs.length}×` : ""}
                  {p.id === "donationalerts" ? "donate" : chs[0].username}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${on ? "pulse-dot" : ""}`}
                  style={{ background: on ? "#4ade80" : "var(--dw-dim)" }}
                />
                {on && <span className="tabular-nums opacity-80">{viewers.toLocaleString("ru-RU")}</span>}
              </span>
            );
          })}

          {channels.length === 0 && (
            <span className="font-mono text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
              нет подключённых каналов
            </span>
          )}

          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setChannelsCollapsed(!channelsCollapsed)}
              className="cursor-pointer rounded px-2 py-1 font-mono text-[10.5px] transition-colors hover:bg-[var(--dw-hover)]"
              style={{
                color: channelsCollapsed ? "var(--dw-dim)" : "var(--dw-accent)",
                border: "1px solid var(--dw-line)",
              }}
              title="Панель управления каналами"
            >
              {channelsCollapsed ? "[ панель ]" : "[ скрыть ]"}
            </button>
            <button
              onClick={() => setAddChannelOpen(true)}
              className="cursor-pointer rounded px-2 py-1 font-mono text-[10.5px] transition-colors hover:bg-[var(--dw-hover)]"
              style={{ color: "var(--dw-accent)", border: "1px dashed var(--dw-line)" }}
            >
              [+ канал]
            </button>
          </span>
        </div>
      )}

      {/* основное тело */}
      <div className="flex min-h-0 flex-1">
        {/* каналы слева (Команда) */}
        {variant.layout === "left" && (
          <aside
            className="flex shrink-0 flex-col border-r px-2 py-2"
            style={{
              width: channelsCollapsed ? 58 : 246,
              borderColor: "var(--dw-line)",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--dw-accent) 7%, var(--dw-panel)) 0%, var(--dw-panel) 220px)",
              transition: "width .2s cubic-bezier(.2,.9,.25,1)",
            }}
          >
            {channelsBody}
          </aside>
        )}

        {/* рабочая область — лента открыта всегда, рейл не нужен */}
        <main className="relative flex min-w-0 flex-1 flex-col p-3">
          <div className="relative -m-3 min-h-0 flex-1 p-3">
            {renderPanel()}
          </div>
        </main>

        {/* терминал: каналы доступны выдвижной панелью справа */}
        {variant.layout === "top" && !channelsCollapsed && (
          <aside
            className="flex shrink-0 flex-col border-l px-2 py-2"
            style={{
              width: 250,
              borderColor: "var(--dw-accent)",
              background: "var(--dw-panel)",
              boxShadow: "inset 1px 0 0 color-mix(in srgb, var(--dw-accent) 25%, transparent)",
            }}
          >
            {channelsBody}
          </aside>
        )}

        {/* каналы справа (Студия) */}
        {variant.layout === "right" && (
          <aside
            className="dw-glass m-2 flex shrink-0 flex-col rounded-2xl border px-2 py-2"
            style={{
              width: channelsCollapsed ? 58 : 250,
              borderColor: "var(--dw-line)",
              background: "color-mix(in srgb, var(--dw-panel) 78%, transparent)",
              boxShadow: "0 6px 24px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.06)",
              transition: "width .2s cubic-bezier(.2,.9,.25,1)",
            }}
          >
            {channelsBody}
          </aside>
        )}
      </div>

      {/* статус-бар (Терминал) */}
      {variant.layout === "top" && (
        <footer
          className="flex shrink-0 items-center gap-4 border-t px-3 py-1 font-mono text-[10.5px]"
          style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)", color: "var(--dw-dim)" }}
        >
          <span>
            <span style={{ color: onlineCount > 0 ? "#4ade80" : "var(--dw-dim)" }}>●</span> {onlineCount} online
          </span>
          <span>{onlineViewers.toLocaleString("ru-RU")} viewers</span>
          <span>{feedTotal} msg</span>
          <span>tts: {tts.enabled ? (paused ? "paused" : "on") : "off"}</span>
          <span className="ml-auto">
            cmd: ready<span className="term-blink">▍</span>
          </span>
        </footer>
      )}

      {/* модерация */}
      {modReq && <ModerationMenu req={modReq} onAction={runModeration} onClose={() => setModReq(null)} />}

      {/* добавление канала (терминал-полоса) */}
      {addChannelOpen && (
        <AddChannelModal onClose={() => setAddChannelOpen(false)} onConnect={connectChannel} toast={toast} />
      )}

      {/* все настройки — под шестерёнкой */}
      <SettingsShell
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
        tts={tts}
        patchTts={patchTts}
        queue={queue}
        paused={paused}
        onPauseToggle={() => setPaused(!paused)}
        onSkipQueue={skipQueueItem}
        onClearQueue={clearQueue}
        onTestVoice={testSpeak}
        chatView={chatView}
        patchChatView={patchChatView}
        widgetCfg={widgetCfg}
        patchWidget={patchWidget}
        overlayCfg={overlayCfg}
        patchOverlay={patchOverlay}
        hotkeys={hotkeys}
        onApplyHotkeys={patchHotkeys}
        botCommands={botCommands}
        onUpdateCommands={setBotCommands}
        variantId={variant.id}
        onVariant={(id) => setVariantId(id)}
        maxFeed={maxFeed}
        onMaxFeed={(v) => {
          setMaxFeed(v);
          markSaved("Лимит ленты обновлён");
        }}
        closeToTray={closeToTray}
        setCloseToTray={setCloseToTray}
        minimizeToTray={minimizeToTray}
        setMinimizeToTray={setMinimizeToTray}
        startHidden={startHidden}
        setStartHidden={setStartHidden}
        hideDeleted={hideDeleted}
        setHideDeleted={setHideDeleted}
        mentionHL={mentionHL}
        setMentionHL={setMentionHL}
        donatePing={donatePing}
        setDonatePing={setDonatePing}
        savedAt={savedAt}
        toast={toast}
        markSaved={markSaved}
      />

      {/* тост */}
      {toastText && (
        <div
          className="toast-anim fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-full px-4 py-2 text-[12px] font-medium whitespace-nowrap shadow-2xl"
          style={{ background: "var(--dw-panel2)", color: "var(--dw-text)", outline: "1px solid var(--dw-line)" }}
        >
          {toastText}
        </div>
      )}
    </div>
  );
}
