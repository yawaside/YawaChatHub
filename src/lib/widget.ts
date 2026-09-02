/* Конфигурация OBS-виджета и оверлея — общая для приложения и сайта. */

export interface WidgetTheme {
  id: string;
  label: string;
  /** цвет подложки в rgb — альфа задаётся отдельно (прозрачность только фона) */
  bgRgb: string;
  text: string;
  name: string;
  sub: string;
  border: string;
  shadow: string;
  swatch: [string, string, string];
  bar?: string;
}

export const WIDGET_THEMES: WidgetTheme[] = [
  {
    id: "minimal-dark",
    label: "Minimal Dark",
    bgRgb: "10, 11, 18",
    text: "#f2f3f8",
    name: "#a78bfa",
    sub: "rgba(242,243,248,0.45)",
    border: "rgba(255,255,255,0.10)",
    shadow: "0 2px 14px rgba(0,0,0,0.35)",
    swatch: ["#0e0f18", "#a78bfa", "#f2f3f8"],
  },
  {
    id: "minimal-light",
    label: "Minimal Light",
    bgRgb: "248, 249, 252",
    text: "#171a26",
    name: "#7c3aed",
    sub: "rgba(23,26,38,0.5)",
    border: "rgba(23,26,38,0.10)",
    shadow: "0 2px 14px rgba(23,26,38,0.14)",
    swatch: ["#f8f9fc", "#7c3aed", "#171a26"],
  },
  {
    id: "neon",
    label: "Neon Stream",
    bgRgb: "6, 8, 16",
    text: "#e8fdff",
    name: "#22d3ee",
    sub: "rgba(232,253,255,0.5)",
    border: "rgba(34,211,238,0.35)",
    shadow: "0 0 18px rgba(34,211,238,0.28)",
    swatch: ["#060810", "#22d3ee", "#ff2ea6"],
    bar: "linear-gradient(90deg,#22d3ee,#ff2ea6)",
  },
  {
    id: "obsidian",
    label: "Obsidian",
    bgRgb: "5, 6, 12",
    text: "#f5f7fb",
    name: "#c4b5fd",
    sub: "rgba(245,247,251,0.42)",
    border: "rgba(167,139,250,0.22)",
    shadow: "0 10px 34px rgba(0,0,0,0.42)",
    swatch: ["#05060c", "#6d28d9", "#e5e7eb"],
  },
  {
    id: "terminal",
    label: "Terminal",
    bgRgb: "2, 10, 8",
    text: "#d1fae5",
    name: "#34d399",
    sub: "rgba(209,250,229,0.45)",
    border: "rgba(52,211,153,0.26)",
    shadow: "0 0 18px rgba(52,211,153,0.16)",
    swatch: ["#020a08", "#34d399", "#d1fae5"],
    bar: "linear-gradient(180deg,#34d399,#22c55e)",
  },
  {
    id: "sunset",
    label: "Sunset",
    bgRgb: "24, 10, 20",
    text: "#fff7ed",
    name: "#fb923c",
    sub: "rgba(255,247,237,0.45)",
    border: "rgba(251,146,60,0.25)",
    shadow: "0 8px 28px rgba(251,113,133,0.18)",
    swatch: ["#180a14", "#fb923c", "#f472b6"],
    bar: "linear-gradient(180deg,#fb923c,#f472b6)",
  },
  {
    id: "frost",
    label: "Frost Glass",
    bgRgb: "226, 239, 255",
    text: "#0f172a",
    name: "#2563eb",
    sub: "rgba(15,23,42,0.45)",
    border: "rgba(37,99,235,0.20)",
    shadow: "0 8px 28px rgba(15,23,42,0.12)",
    swatch: ["#e2efff", "#2563eb", "#0f172a"],
  },
  {
    id: "amoled",
    label: "AMOLED",
    bgRgb: "0, 0, 0",
    text: "#f3f4f6",
    name: "#a78bfa",
    sub: "rgba(243,244,246,0.45)",
    border: "rgba(255,255,255,0.14)",
    shadow: "0 0 0 rgba(0,0,0,0)",
    swatch: ["#000000", "#a78bfa", "#f3f4f6"],
  },
  {
    id: "latte",
    label: "Latte",
    bgRgb: "252, 247, 240",
    text: "#3f3a37",
    name: "#b45309",
    sub: "rgba(63,58,55,0.45)",
    border: "rgba(180,83,9,0.2)",
    shadow: "0 8px 24px rgba(63,58,55,0.14)",
    swatch: ["#fcf7f0", "#b45309", "#3f3a37"],
  },
];

/** Стили оформления: комплект настроек текста, ника и иконки. */
export interface WidgetStyle {
  id: string;
  label: string;
  desc: string;
  bgRgb: string;
  bgOpacity: number;
  radius: number;
  text: string;
  name: string;
  sub: string;
  border: string;
  shadow: string;
  fontFamily: string;
  fontWeight: number;
  nameWeight: number;
  letterSpacing: number;
  textShadow: string;
  nameShadow: string;
  iconShape: "circle" | "rounded" | "square";
  iconGlow: boolean;
  uppercaseName: boolean;
  swatch: [string, string, string];
}

export const WIDGET_STYLES: WidgetStyle[] = [
  {
    id: "clean", label: "Чистый", desc: "Нейтральный современный вид",
    bgRgb: "10, 11, 18", bgOpacity: 70, radius: 12,
    text: "#f2f3f8", name: "#a78bfa", sub: "rgba(242,243,248,0.45)",
    border: "rgba(255,255,255,0.10)", shadow: "0 2px 14px rgba(0,0,0,0.35)",
    fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif',
    fontWeight: 500, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "rounded", iconGlow: false, uppercaseName: false,
    swatch: ["#0e0f18", "#a78bfa", "#f2f3f8"],
  },
  {
    id: "cartoon", label: "Мультяшный", desc: "Жирный шрифт и контурная обводка",
    bgRgb: "255, 247, 237", bgOpacity: 92, radius: 22,
    text: "#2b2118", name: "#e8590c", sub: "rgba(43,33,24,0.55)",
    border: "rgba(43,33,24,0.35)", shadow: "0 6px 0 rgba(43,33,24,0.25)",
    fontFamily: '"Comic Sans MS", "Segoe UI", system-ui, sans-serif',
    fontWeight: 700, nameWeight: 800, letterSpacing: 0.2,
    textShadow: "none", nameShadow: "none",
    iconShape: "circle", iconGlow: false, uppercaseName: false,
    swatch: ["#fff7ed", "#e8590c", "#2b2118"],
  },
  {
    id: "cyberpunk", label: "Киберпанк", desc: "Неон, свечение и жёсткий контраст",
    bgRgb: "8, 5, 20", bgOpacity: 74, radius: 6,
    text: "#e8fdff", name: "#22d3ee", sub: "rgba(232,253,255,0.5)",
    border: "rgba(255,46,166,0.55)", shadow: "0 0 22px rgba(255,46,166,0.35)",
    fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
    fontWeight: 500, nameWeight: 700, letterSpacing: 0.6,
    textShadow: "0 0 6px rgba(34,211,238,0.55)", nameShadow: "0 0 10px rgba(255,46,166,0.75)",
    iconShape: "square", iconGlow: true, uppercaseName: true,
    swatch: ["#080514", "#22d3ee", "#ff2ea6"],
  },
  {
    id: "minimal-light", label: "Светлый", desc: "Мягкий светлый вариант",
    bgRgb: "248, 249, 252", bgOpacity: 88, radius: 14,
    text: "#171a26", name: "#7c3aed", sub: "rgba(23,26,38,0.5)",
    border: "rgba(23,26,38,0.10)", shadow: "0 2px 14px rgba(23,26,38,0.14)",
    fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif',
    fontWeight: 500, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "rounded", iconGlow: false, uppercaseName: false,
    swatch: ["#f8f9fc", "#7c3aed", "#171a26"],
  },
  {
    id: "terminal", label: "Терминал", desc: "Моноширинный «консольный» вид",
    bgRgb: "2, 10, 8", bgOpacity: 78, radius: 4,
    text: "#d1fae5", name: "#34d399", sub: "rgba(209,250,229,0.45)",
    border: "rgba(52,211,153,0.32)", shadow: "0 0 18px rgba(52,211,153,0.16)",
    fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
    fontWeight: 400, nameWeight: 700, letterSpacing: 0.3,
    textShadow: "none", nameShadow: "0 0 8px rgba(52,211,153,0.5)",
    iconShape: "square", iconGlow: false, uppercaseName: false,
    swatch: ["#020a08", "#34d399", "#d1fae5"],
  },
  {
    id: "glass", label: "Стекло", desc: "Полупрозрачная подложка с размытием",
    bgRgb: "226, 239, 255", bgOpacity: 32, radius: 18,
    text: "#0f172a", name: "#2563eb", sub: "rgba(15,23,42,0.5)",
    border: "rgba(255,255,255,0.5)", shadow: "0 8px 28px rgba(15,23,42,0.18)",
    fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif',
    fontWeight: 600, nameWeight: 700, letterSpacing: 0,
    textShadow: "0 1px 2px rgba(255,255,255,0.6)", nameShadow: "none",
    iconShape: "circle", iconGlow: false, uppercaseName: false,
    swatch: ["#e2efff", "#2563eb", "#0f172a"],
  },
  {
    id: "amoled", label: "AMOLED", desc: "Чёрный фон, максимальный контраст",
    bgRgb: "0, 0, 0", bgOpacity: 86, radius: 10,
    text: "#f3f4f6", name: "#a78bfa", sub: "rgba(243,244,246,0.45)",
    border: "rgba(255,255,255,0.16)", shadow: "none",
    fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif',
    fontWeight: 500, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "rounded", iconGlow: false, uppercaseName: false,
    swatch: ["#000000", "#a78bfa", "#f3f4f6"],
  },
  {
    id: "retro", label: "Ретро", desc: "Тёплые тона и мягкая тень",
    bgRgb: "36, 18, 44", bgOpacity: 80, radius: 16,
    text: "#ffe9d6", name: "#fb923c", sub: "rgba(255,233,214,0.5)",
    border: "rgba(251,146,60,0.35)", shadow: "0 8px 28px rgba(251,113,133,0.22)",
    fontFamily: '"Unbounded", "Onest", system-ui, sans-serif',
    fontWeight: 500, nameWeight: 700, letterSpacing: 0.4,
    textShadow: "0 2px 4px rgba(0,0,0,0.4)", nameShadow: "0 2px 6px rgba(251,146,60,0.5)",
    iconShape: "circle", iconGlow: true, uppercaseName: false,
    swatch: ["#24122c", "#fb923c", "#ffe9d6"],
  },
];

export function getWidgetStyle(id: string): WidgetStyle {
  return WIDGET_STYLES.find((s) => s.id === id) ?? WIDGET_STYLES[0];
}

/** Анимации появления сообщений в виджете и оверлее. */
export type WidgetEffect =
  | "none" | "fade" | "slide-up" | "slide-left" | "scale" | "blur" | "typewriter" | "bounce";

export const WIDGET_EFFECTS: Array<{ id: WidgetEffect; label: string }> = [
  { id: "none", label: "Без анимации" },
  { id: "fade", label: "Проявление (Fade-in)" },
  { id: "slide-up", label: "Подъём снизу (Slide-up)" },
  { id: "slide-left", label: "Сдвиг справа" },
  { id: "scale", label: "Увеличение (Scale-up)" },
  { id: "blur", label: "Расфокус (Blur-in)" },
  { id: "typewriter", label: "Печатная машинка" },
  { id: "bounce", label: "Пружина" },
];

export interface WidgetConfig {
  /** id стиля оформления (заменил «базовую тему») */
  style: string;
  theme: string;
  fontSize: number;
  /** прозрачность ПОДЛОЖКИ, 0..100 (текст всегда непрозрачный) */
  bgOpacity: number;
  radius: number;
  duration: number;
  dir: "up" | "down";
  shadow: boolean;
  showPlatform: boolean;
  showTime: boolean;
  maxMessages: number;
  effect: WidgetEffect;
  effectDuration: number;
  /** ручные переопределения стиля */
  textColor: string;
  nameColor: string;
  bgColor: string;
  border: boolean;
  bgImage: string;
}

export const DEFAULT_WIDGET: WidgetConfig = {
  style: "clean",
  theme: "minimal-dark",
  fontSize: 16,
  bgOpacity: 70,
  radius: 12,
  duration: 8,
  dir: "up",
  shadow: true,
  showPlatform: true,
  showTime: true,
  maxMessages: 8,
  effect: "slide-up",
  effectDuration: 0.32,
  textColor: "",
  nameColor: "",
  bgColor: "",
  border: true,
  bgImage: "",
};

export function getTheme(id: string): WidgetTheme {
  return WIDGET_THEMES.find((t) => t.id === id) ?? WIDGET_THEMES[0];
}

/** rgba подложки: альфа применяется ТОЛЬКО к фону */
export function themeBg(theme: WidgetTheme, opacity: number): string {
  return `rgba(${theme.bgRgb}, ${Math.max(0, Math.min(100, opacity)) / 100})`;
}

/**
 * Ссылка для OBS. Содержит ТОЛЬКО адрес и токен — настройки и стиль
 * доставляются в виджет по WebSocket, поэтому URL не меняется никогда.
 */
export function buildWidgetUrl(_cfg: WidgetConfig, port: number, token: string): string {
  return `http://127.0.0.1:${port}/widget?token=${encodeURIComponent(token)}`;
}

/** Итоговое оформление виджета: стиль + ручные переопределения. */
export function resolveWidgetLook(cfg: WidgetConfig) {
  const s = getWidgetStyle(cfg.style);
  const bg = cfg.bgColor
    ? cfg.bgColor
    : `rgba(${s.bgRgb}, ${Math.max(0, Math.min(100, cfg.bgOpacity)) / 100})`;
  return {
    ...s,
    background: bg,
    text: cfg.textColor || s.text,
    name: cfg.nameColor || s.name,
    radius: cfg.radius,
    border: cfg.border ? s.border : "transparent",
    shadow: cfg.shadow ? s.shadow : "none",
    bgImage: cfg.bgImage,
  };
}

/* ---------- оверлей ---------- */

export interface OverlayConfig {
  enabled: boolean;
  /** прозрачность ПОДЛОЖКИ окна оверлея */
  bgOpacity: number;
  clickThrough: boolean;
  mode: "compact" | "widget";
  fontSize: number;
  maxMessages: number;
  locked: boolean;
  /** оформление — по аналогии с виджетом OBS */
  style: string;
  showBorder: boolean;
  effect: WidgetEffect;
  effectDuration: number;
  textColor: string;
  nameColor: string;
  bgColor: string;
  radius: number;
  bgImage: string;
  showTime: boolean;
  showPlatform: boolean;
}

export const DEFAULT_OVERLAY: OverlayConfig = {
  enabled: false,
  bgOpacity: 55,
  clickThrough: false,
  mode: "compact",
  fontSize: 12,
  maxMessages: 6,
  locked: false,
  style: "clean",
  showBorder: true,
  effect: "slide-up",
  effectDuration: 0.3,
  textColor: "",
  nameColor: "",
  bgColor: "",
  radius: 14,
  bgImage: "",
  showTime: false,
  showPlatform: true,
};

/** Итоговое оформление оверлея. */
export function resolveOverlayLook(cfg: OverlayConfig) {
  const s = getWidgetStyle(cfg.style);
  const bg = cfg.bgColor
    ? cfg.bgColor
    : `rgba(${s.bgRgb}, ${Math.max(0, Math.min(100, cfg.bgOpacity)) / 100})`;
  return {
    ...s,
    background: bg,
    text: cfg.textColor || s.text,
    name: cfg.nameColor || s.name,
    radius: cfg.radius,
    border: cfg.showBorder ? s.border : "transparent",
    bgImage: cfg.bgImage,
  };
}

/* ---------- вид ленты чата ---------- */

export type MessageEffect =
  | "none"
  | "fade"
  | "slide-up"
  | "slide-left"
  | "scale"
  | "pop"
  | "bounce";

export interface ChatViewConfig {
  style: "classic" | "minimal" | "glass" | "flat";
  fontSize: number;
  rowGap: number;
  radius: number;
  showPlatform: boolean;
  showTime: boolean;
  showBadges: boolean;
  messageEffect: MessageEffect;
  effectDuration: number;
}

export const DEFAULT_CHAT_VIEW: ChatViewConfig = {
  style: "classic",
  fontSize: 15,
  rowGap: 6,
  radius: 16,
  showPlatform: true,
  showTime: true,
  showBadges: true,
  messageEffect: "slide-up",
  effectDuration: 0.34,
};

/* ---------- горячие клавиши (дефолты зеркалят desktop/electron/settings.js) ---------- */

export const DEFAULT_HOTKEYS: Record<string, string> = {
  "overlay:toggle": "Control+Shift+G",
  "overlay:clicks": "Control+Shift+C",
  "tts:toggle": "Control+Shift+T",
  "tts:pause": "Control+Shift+P",
  "tts:skip": "Control+Shift+S",
  "tts:clear": "Control+Shift+Q",
  "window:toggle": "Control+Shift+H",
  "feed:clear": "Control+Shift+L",
};

export interface HotkeyMeta {
  id: string;
  label: string;
  group: string;
}

export const HOTKEY_META: HotkeyMeta[] = [
  { id: "tts:toggle", label: "Озвучка вкл / выкл", group: "Озвучка" },
  { id: "tts:pause", label: "Пауза / продолжить", group: "Озвучка" },
  { id: "tts:skip", label: "Пропустить текущее", group: "Озвучка" },
  { id: "tts:clear", label: "Очистить очередь", group: "Озвучка" },
  { id: "overlay:toggle", label: "Игровой оверлей вкл / выкл", group: "Оверлей" },
  { id: "overlay:clicks", label: "Сквозные клики оверлея", group: "Оверлей" },
  { id: "window:toggle", label: "Скрыть / показать окно", group: "Окно" },
  { id: "feed:clear", label: "Очистить ленту", group: "Окно" },
];
