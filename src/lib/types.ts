/** Общие типы интерфейса приложения */
import type { EffectId } from "./effects";

export type PlatformId =
  | "twitch"
  | "youtube"
  | "vkplay"
  | "kick"
  | "tiktok"
  | "donationalerts";

/**
 * connecting — идёт подключение
 * connected  — канал подключён (чат читается), но эфир не подтверждён
 * online     — подтверждена активная трансляция (есть данные о стриме/зрителях)
 * offline    — канал доступен, но трансляции нет
 * error      — не удалось подключиться
 */
export type ChannelStatus = "online" | "connected" | "offline" | "connecting" | "error";

export interface Channel {
  id: string;
  platform: PlatformId;
  username: string;
  status: ChannelStatus;
  viewers: number;
  messages: number;
  /** DonationAlerts: секретный токен + валюта */
  token?: string;
  currency?: string;
}

export type MsgKind =
  | "chat"
  | "system"
  | "reward"
  | "donate"
  | "sub"
  | "raid"
  | "gift"
  | "bits"
  | "reward"
  | "command"
  | "mod"
  | "status";

export interface ChatMsg {
  id: number;
  ts: number;
  platform: PlatformId;
  channel: string;
  author: string;
  color: string;
  text: string;
  kind: MsgKind;
  badges?: string[];
  amount?: number;
  currency?: string;
  deleted?: boolean;
  /** идентификаторы площадки — нужны для настоящей модерации (Twitch Helix) */
  msgId?: string;
  userId?: string;
  roomId?: string;
}

/** ------- озвучка ------- */
export interface TtsConfig {
  enabled: boolean;
  voice: string;
  rate: number; // 0.5 – 2
  volume: number; // 0 – 1
  speakAuthor: boolean;
  speakPlatform: boolean;
  donatesOnly: boolean;
  skipLinks: boolean;
  skipCommands: boolean;
  maxLen: number;
  capsLimit: number; // % заглавных
  stripEmoji: boolean;
  squashRepeats: boolean;
  linkPhrase: string;
  /** читать названия смайлов/стикеров (по умолчанию выключено) */
  speakEmotes: boolean;
  /** движок озвучки: системный SAPI или нейросетевой Edge TTS */
  engine: "sapi" | "edge";
}

export const DEFAULT_TTS: TtsConfig = {
  // по умолчанию озвучка ВЫКЛЮЧЕНА — включается тумблером в шапке или F9
  enabled: false,
  voice: "",
  rate: 1,
  volume: 0.9,
  speakAuthor: true,
  speakPlatform: false,
  donatesOnly: false,
  skipLinks: true,
  skipCommands: true,
  maxLen: 220,
  capsLimit: 80,
  stripEmoji: true,
  squashRepeats: true,
  linkPhrase: "ссылка",
  speakEmotes: false,   // смайлы не озвучиваются
  engine: "edge",       // нейросетевые русские голоса Edge TTS
};

/** ------- вид ленты ------- */
export type FeedDensity = "cozy" | "standard" | "compact" | "tight";

/** идентификатор шрифтового набора (см. FONT_FAMILIES в lib/fonts.ts) */
export type FontId = "inter" | "mono" | "rounded" | "condensed" | "gaming" | "serif" | "system";

/** написание ников: как есть или капсом */
export type NickCase = "normal" | "upper";

export interface ChatViewConfig {
  /** выбранный стиль оформления (см. lib/presets.ts) */
  styleId: string;
  density: FeedDensity;
  fontSize: number;
  fontFamily: FontId;
  spacing: number;
  /** скругление плашки сообщения */
  radius: number;
  /** цветная полоса площадки слева */
  stripe: boolean;
  /** тонкая линия-разделитель между сообщениями */
  separators: boolean;
  nickCase: NickCase;
  backdrop: boolean;
  animations: boolean;
  showTime: boolean;
  showBadges: boolean;
  showPlatform: boolean;
  accentNick: boolean;
  /** мягкая тень текста для читаемости */
  textShadow?: boolean;
  /** толщина обводки текста: 0 = без обводки, дробный шаг */
  outlineWidth?: number;
  /** эффект появления сообщений и его скорость */
  effect?: EffectId;
  effectSpeed?: number;
}

export const DEFAULT_CHAT_VIEW: ChatViewConfig = {
  styleId: "valorant",
  density: "standard",
  fontSize: 13,
  fontFamily: "inter",
  spacing: 6,
  radius: 10,
  stripe: false,
  separators: false,
  nickCase: "normal",
  backdrop: true,
  animations: true,
  showTime: true,
  showBadges: true,
  showPlatform: true,
  accentNick: true,
  textShadow: false,
  outlineWidth: 0,
  effect: "fade",
  effectSpeed: 1,
};

/** ------- виджет OBS / оверлей ------- */
export interface WidgetConfig {
  styleId: string;
  max: number;
  fontSize: number;
  fontFamily: FontId;
  spacing: number;
  radius: number;
  stripe: boolean;
  nickCase: NickCase;
  /** показывать донаты, сабы и рейды (по умолчанию выключено) */
  showEvents: boolean;
  transparent: boolean;
  /** прозрачность подложки сообщений, 0..1 (0 = 100% прозрачный фон) */
  backdropOpacity?: number;
  /** пользовательский цвет фона (hex/rgb) */
  bgColor?: string;
  /** пользовательский цвет текста */
  textColor?: string;
  /** пользовательский цвет ника */
  nameColor?: string;
  outlines: boolean;
  /** мягкая тень текста позади плашек */
  textShadow?: boolean;
  theme: "dark" | "light";
  /** скрывать старые сообщения через заданное время */
  autoFade?: boolean;
  fadeAfterSec?: number;
  /** толщина обводки текста: 0 = без обводки, дробный шаг */
  outlineWidth?: number;
  /** компактные строки (минимальные поля плашки) */
  compactRows?: boolean;
  /** звук новых сообщений прямо в источнике OBS (для «Управлять аудио через OBS») */
  sound?: boolean;
  soundVolume?: number;
  /** звук только для донатов и событий */
  soundEventsOnly?: boolean;
  /** эффект появления сообщений и его скорость */
  effect?: EffectId;
  effectSpeed?: number;
}

export const DEFAULT_WIDGET: WidgetConfig = {
  styleId: "clean",
  max: 8,
  fontSize: 18,
  fontFamily: "inter",
  spacing: 4,
  radius: 10,
  stripe: false,
  nickCase: "normal",
  showEvents: false,
  transparent: false,
  backdropOpacity: 0.7,
  outlines: true,
  textShadow: true,
  theme: "dark",
  autoFade: false,
  fadeAfterSec: 30,
  outlineWidth: 0.8,
  sound: false,
  soundVolume: 0.5,
  soundEventsOnly: true,
  effect: "fade",
  effectSpeed: 1,
};

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "free";
export type OverlayGrowth = "down" | "up";
/** где расположена панель статистики относительно ленты */
export type OverlayStatsPos = "bottom" | "top";

export interface OverlayConfig {
  enabled: boolean;
  /** прозрачность ПОДЛОЖКИ (0 = полностью прозрачная, текст остаётся чётким) */
  backdropOpacity: number;
  /** прозрачность самого текста — отдельная, по умолчанию 1 */
  textOpacity: number;
  fontSize: number;
  fontFamily: FontId;
  /** интервал между сообщениями, px */
  spacing: number;
  clickThrough: boolean;
  maxMessages: number;
  /** высота окна оверлея (px) — не зависит от шрифта и числа строк */
  height?: number;
  /* размещение */
  corner: OverlayCorner;
  width: number;
  offsetX: number;
  offsetY: number;
  growth: OverlayGrowth;
  /* содержимое строки */
  showTime: boolean;
  showPlatform: boolean;
  showBadges: boolean;
  showEmotes: boolean;
  eventsOnly: boolean;
  /* исчезновение старых сообщений */
  autoFade: boolean;
  fadeAfterSec: number;
  /* свободное размещение: перетаскивание окна мышью */
  freePosition: boolean;
  posX: number;
  posY: number;
  locked: boolean;
  /* панель статистики площадок */
  showStats: boolean;
  /** снизу (по умолчанию) или сверху ленты */
  statsPos: OverlayStatsPos;
  showDonations: boolean;
  showViewers: boolean;
  statsCompact: boolean;
  /** скрывать площадки без подключённых каналов */
  hideDisconnected: boolean;
  /* оформление */
  radius: number;
  accentBar: boolean;
  shadowText: boolean;
  /** мягкая тень текста для читаемости на игре */
  textShadow?: boolean;
  /** толщина обводки текста: 0 = без обводки, дробный шаг */
  outlineWidth?: number;
  /** эффект появления сообщений и его скорость */
  effect?: EffectId;
  effectSpeed?: number;
  /** совместимость только с современным предпросмотром; логика v1.2.4 не использует */
  styleId?: string;
  nickCase?: NickCase;
  showEvents?: boolean;
}

export const DEFAULT_OVERLAY: OverlayConfig = {
  // по умолчанию оверлей ВЫКЛЮЧЕН — включается кнопкой или хоткеем
  enabled: false,
  // по умолчанию полностью прозрачный: подложки нет, виден только текст
  backdropOpacity: 0,
  textOpacity: 1,
  fontSize: 14,
  fontFamily: "inter",
  spacing: 4,
  // сквозной клик работает ТОЛЬКО когда пользователь его включил
  clickThrough: false,
  maxMessages: 6,
  height: 320,
  corner: "top-left",
  width: 400,
  offsetX: 16,
  offsetY: 16,
  growth: "down",
  showTime: false,
  showPlatform: true,
  showBadges: false,
  showEmotes: true,
  eventsOnly: false,
  autoFade: false,
  fadeAfterSec: 30,
  freePosition: false,
  posX: 24,
  posY: 24,
  locked: false,
  showStats: true,
  statsPos: "bottom",
  showDonations: true,
  showViewers: true,
  statsCompact: false,
  hideDisconnected: true,
  radius: 10,
  accentBar: true,
  shadowText: true,
  outlineWidth: 2,
  effect: "fade",
  effectSpeed: 1,
  styleId: "ghost",
};

/** статистика площадок для шапки оверлея (донаты идут первыми) */
export interface OverlayStats {
  donations: { total: number; currency: string; count: number };
  platforms: {
    platform: PlatformId;
    /** подтверждённый эфир */
    online: boolean;
    /** канал подключён (чат читается) */
    connected?: boolean;
    viewers: number;
    messages: number;
  }[];
}

/** Клавиши хранятся физическими кодами — не зависят от раскладки. */
export const DEFAULT_HOTKEYS: Record<string, string> = {
  toggleSpeech: "F9",
  pauseQueue: "F7",
  skipQueue: "F8",
  toggleOverlay: "Ctrl+Shift+O",
  toggleClickThrough: "Ctrl+Shift+KeyT",
  clearFeed: "Ctrl+Shift+X",
};

export interface BotCommand {
  id: string;
  trigger: string;
  response: string;
  cooldown: number;
  enabled: boolean;
  platform: PlatformId | "all";
}

/** команда модерации из ленты */
export interface ModerationRequest {
  msg: ChatMsg;
  x: number;
  y: number;
}
