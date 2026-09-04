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
  /* ---------- игровые стили ---------- */
  {
    id: "rust",
    label: "RUST",
    bgRgb: "0, 0, 0",
    text: "#f2f2f2",
    name: "#55aaff",
    sub: "rgba(242,242,242,0.5)",
    border: "rgba(255,255,255,0.06)",
    shadow: "none",
    swatch: ["#111111", "#55aaff", "#f2f2f2"],
  },
  {
    id: "tarkov",
    label: "Escape from Tarkov",
    bgRgb: "24, 24, 22",
    text: "#c7c5b3",
    name: "#bfa680",
    sub: "rgba(199,197,179,0.45)",
    border: "rgba(154,136,102,0.45)",
    shadow: "none",
    swatch: ["#181816", "#bfa680", "#c7c5b3"],
  },
  {
    id: "wot",
    label: "World of Tanks",
    bgRgb: "0, 0, 0",
    text: "#ffffff",
    name: "#80d639",
    sub: "rgba(255,255,255,0.5)",
    border: "rgba(255,255,255,0.08)",
    shadow: "none",
    swatch: ["#0a0a0a", "#80d639", "#ffffff"],
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
  /** градиент для полосы прогресса / акцента */
  bar?: string;
  /** рекомендуемая толщина обводки текста для стиля, px (игровые HUD-чаты) */
  recTextOutline?: number;
  /** рекомендуемая мягкая тень под текстом */
  recTextShadow?: boolean;
  swatch: [string, string, string];
}

const _STYLES = [

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
  /* ---------- игровые стили ---------- */
  {
    id: "rust", label: "RUST", desc: "Как в игре: Roboto Condensed полужирный, голубой ник, тонкая чёрная обводка текста",
    bgRgb: "0, 0, 0", bgOpacity: 55, radius: 2,
    text: "#f2f2f2", name: "#55aaff", sub: "rgba(242,242,242,0.5)",
    border: "rgba(255,255,255,0.06)", shadow: "none",
    fontFamily: '"Roboto Condensed", "Arial Narrow", "Roboto", Arial, sans-serif',
    fontWeight: 600, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "rounded", iconGlow: false, uppercaseName: false,
    // В самой игре текст читается за счёт тонкого контура, а не плашки.
    recTextOutline: 1, recTextShadow: true,
    swatch: ["#111111", "#55aaff", "#f2f2f2"],
  },
  {
    id: "tarkov", label: "Escape from Tarkov", desc: "Чат Tarkov: шрифт Bender, серо-бежевый текст, угольный фон",
    bgRgb: "24, 24, 22", bgOpacity: 88, radius: 0,
    text: "#c7c5b3", name: "#bfa680", sub: "rgba(199,197,179,0.45)",
    border: "rgba(154,136,102,0.45)", shadow: "none",
    fontFamily: '"Bender", "Roboto Condensed", "Arial Narrow", Arial, sans-serif',
    fontWeight: 400, nameWeight: 700, letterSpacing: 0.2,
    textShadow: "none", nameShadow: "none",
    iconShape: "square", iconGlow: false, uppercaseName: false,
    swatch: ["#181816", "#bfa680", "#c7c5b3"],
  },
  {
    id: "wot", label: "World of Tanks", desc: "Боевой чат WoT: зелёный ник союзника, белый текст, чёрная полупрозрачная подложка",
    bgRgb: "0, 0, 0", bgOpacity: 45, radius: 0,
    text: "#ffffff", name: "#80d639", sub: "rgba(255,255,255,0.5)",
    border: "rgba(255,255,255,0.08)", shadow: "none",
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontWeight: 400, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "square", iconGlow: false, uppercaseName: false,
    recTextOutline: 1, recTextShadow: true,
    swatch: ["#0a0a0a", "#80d639", "#ffffff"],
  },

  /* ---------- дополнительные стили ---------- */
  {
    id: "subway", label: "Метро", desc: "Тёмный минимализм: тонкие линии, ровный шрифт, приглушённые цвета",
    bgRgb: "14, 14, 16", bgOpacity: 82, radius: 8,
    text: "#a0a0b0", name: "#6c9eff", sub: "rgba(160,160,176,0.40)",
    border: "rgba(108,158,255,0.20)", shadow: "none",
    fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif',
    fontWeight: 400, nameWeight: 600, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "rounded", iconGlow: false, uppercaseName: false,
    swatch: ["#0e0e10", "#6c9eff", "#a0a0b0"],
  },
  {
    id: "brutalist", label: "Брутализм", desc: "Жёсткие контрасты, толстые рамки, угловатый шрифт без скруглений",
    bgRgb: "255, 255, 255", bgOpacity: 92, radius: 0,
    text: "#111111", name: "#e60000", sub: "rgba(17,17,17,0.55)",
    border: "#000000", shadow: "4px 4px 0 #000000",
    fontFamily: '"Impact", "Arial Black", sans-serif',
    fontWeight: 400, nameWeight: 400, letterSpacing: 1,
    textShadow: "none", nameShadow: "none",
    iconShape: "square", iconGlow: false, uppercaseName: true,
    swatch: ["#ffffff", "#e60000", "#111111"],
  },
  {
    id: "paper", label: "Бумага", desc: "Светлый тёплый фон, тёмный текст, как распечатка лога чата",
    bgRgb: "245, 240, 230", bgOpacity: 95, radius: 4,
    text: "#2c2c2c", name: "#1a5276", sub: "rgba(44,44,44,0.50)",
    border: "rgba(44,44,44,0.15)", shadow: "0 1px 3px rgba(0,0,0,0.08)",
    fontFamily: '"Courier New", "Consolas", monospace',
    fontWeight: 400, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "square", iconGlow: false, uppercaseName: false,
    swatch: ["#f5f0e6", "#1a5276", "#2c2c2c"],
  },
  {
    id: "lofi", label: "Ло-фай", desc: "Мягкий фиолетовый фон, тёплый текст, расслабляющий вид",
    bgRgb: "28, 18, 38", bgOpacity: 76, radius: 14,
    text: "#e8d4c0", name: "#c9a0dc", sub: "rgba(232,212,192,0.45)",
    border: "rgba(201,160,220,0.30)", shadow: "0 0 20px rgba(201,160,220,0.15)",
    fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif',
    fontWeight: 400, nameWeight: 600, letterSpacing: 0.1,
    textShadow: "0 1px 2px rgba(0,0,0,0.4)", nameShadow: "0 0 8px rgba(201,160,220,0.4)",
    iconShape: "circle", iconGlow: true, uppercaseName: false,
    swatch: ["#1c1226", "#c9a0dc", "#e8d4c0"],
  },
  {
    id: "hud", label: "HUD", desc: "Тактический HUD-интерфейс: зелёный скан-лайн, моноширинный, как в3D-прицел",
    bgRgb: "0, 6, 0", bgOpacity: 60, radius: 0,
    text: "#33ff66", name: "#66ff99", sub: "rgba(51,255,102,0.40)",
    border: "rgba(51,255,102,0.35)", shadow: "0 0 12px rgba(51,255,102,0.20)",
    fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
    fontWeight: 400, nameWeight: 700, letterSpacing: 0.5,
    textShadow: "0 0 6px rgba(51,255,102,0.4)", nameShadow: "0 0 10px rgba(51,255,102,0.5)",
    iconShape: "square", iconGlow: true, uppercaseName: true,
    swatch: ["#000600", "#33ff66", "#66ff99"],
  },
  {
    id: "newspaper", label: "Газета", desc: "Чёрно-белая газетная вёрстка: serif-шрифт, узкие колонки, винтаж",
    bgRgb: "250, 248, 240", bgOpacity: 96, radius: 0,
    text: "#1a1a1a", name: "#8b0000", sub: "rgba(26,26,26,0.50)",
    border: "rgba(26,26,26,0.25)", shadow: "none",
    fontFamily: '"Georgia", "Times New Roman", serif',
    fontWeight: 400, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "none",
    iconShape: "square", iconGlow: false, uppercaseName: false,
    swatch: ["#faf8f0", "#8b0000", "#1a1a1a"],
  },
  {
    id: "plasma", label: "Плазма", desc: "Розово-голубой неон, яркие свечения, как киберпанк-дисплей",
    bgRgb: "10, 0, 20", bgOpacity: 65, radius: 8,
    text: "#f0e0ff", name: "#ff4088", sub: "rgba(240,224,255,0.45)",
    border: "rgba(255,64,136,0.40)", shadow: "0 0 24px rgba(255,64,136,0.30)",
    fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
    fontWeight: 500, nameWeight: 700, letterSpacing: 0.3,
    textShadow: "0 0 8px rgba(100,100,255,0.3)", nameShadow: "0 0 14px rgba(255,64,136,0.6)",
    iconShape: "circle", iconGlow: true, uppercaseName: false,
    swatch: ["#0a0014", "#ff4088", "#f0e0ff"],
    bar: "linear-gradient(90deg,#ff4088,#8060ff)",
  },
  {
    id: "ocean", label: "Океан", desc: "Глубоководный синий, бирюзовые акценты, спокойный и читаемый",
    bgRgb: "6, 14, 28", bgOpacity: 72, radius: 10,
    text: "#c8e0f0", name: "#22d3ee", sub: "rgba(200,224,240,0.40)",
    border: "rgba(34,211,238,0.25)", shadow: "0 0 16px rgba(34,211,238,0.15)",
    fontFamily: '"Onest", "Segoe UI", system-ui, sans-serif',
    fontWeight: 400, nameWeight: 700, letterSpacing: 0,
    textShadow: "none", nameShadow: "0 0 8px rgba(34,211,238,0.35)",
    iconShape: "rounded", iconGlow: false, uppercaseName: false,
    swatch: ["#060e1c", "#22d3ee", "#c8e0f0"],
  },
] as WidgetStyle[];

export const WIDGET_STYLES = _STYLES;

export function getWidgetStyle(id: string): WidgetStyle {
  // Защита: даже битый/пустой элемент в массиве не должен ронять интерфейс.
  const found = WIDGET_STYLES.find((s) => !!s && s.id === id);
  return found ?? WIDGET_STYLES.find((s) => !!s) ?? ({} as WidgetStyle);
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
  /** отступ между сообщениями, px; 0 — почти вплотную */
  rowGap: number;
  /** мягкая тень под текстом сообщений */
  textShadow: boolean;
  /** толщина чёрной обводки текста, px; 0 — выключена */
  textOutline: number;
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
  rowGap: 6,
  textShadow: true,
  textOutline: 0,
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
 * Обводка текста через text-shadow.
 *
 * -webkit-text-stroke даёт грубый контур и «съедает» тонкие шрифты, поэтому
 * обводка собирается из 8 смещённых теней — она получается очень тонкой
 * и одинаково работает в приложении, оверлее и Browser Source OBS.
 */
function outlineShadows(width: number, color = "#000"): string[] {
  const w = Math.max(0, width);
  if (!w) return [];
  const d = Number((w * 0.72).toFixed(2));
  return [
    `-${w}px 0 0 ${color}`,
    `${w}px 0 0 ${color}`,
    `0 -${w}px 0 ${color}`,
    `0 ${w}px 0 ${color}`,
    `-${d}px -${d}px 0 ${color}`,
    `${d}px -${d}px 0 ${color}`,
    `-${d}px ${d}px 0 ${color}`,
    `${d}px ${d}px 0 ${color}`,
  ];
}

/**
 * Итоговый text-shadow: обводка (сверху) → мягкая тень → собственное свечение стиля.
 * Порядок важен: первая тень рисуется поверх остальных.
 */
export function composeTextShadow(styleShadow: string, outline: number, dropShadow: boolean): string {
  const parts: string[] = [...outlineShadows(outline)];
  if (dropShadow) parts.push("0 2px 4px rgba(0,0,0,0.9)");
  if (styleShadow && styleShadow !== "none") parts.push(styleShadow);
  return parts.length ? parts.join(", ") : "none";
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
    // Тень и обводка текста управляются пользователем и накладываются
    // поверх собственного свечения стиля (неон, HUD и т.п.).
    textShadow: composeTextShadow(s.textShadow, cfg.textOutline, cfg.textShadow),
    nameShadow: composeTextShadow(s.nameShadow, cfg.textOutline, cfg.textShadow),
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
  /** нижняя полоса: иконки ПОДКЛЮЧЁННЫХ площадок и их онлайн (число зрителей) */
  showViewers: boolean;
  /** сколько секунд живёт сообщение в оверлее; 0 — не скрывать */
  ttl: number;
  /** отступ между сообщениями, px; 0 — почти вплотную */
  rowGap: number;
  /** мягкая тень под текстом сообщений */
  textShadow: boolean;
  /** толщина чёрной обводки текста, px; 0 — выключена */
  textOutline: number;
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
  showViewers: true,
  ttl: 0,
  rowGap: 6,
  textShadow: true,
  textOutline: 0,
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
    // Тень и обводка текста управляются пользователем и накладываются
    // поверх собственного свечения стиля.
    textShadow: composeTextShadow(s.textShadow, cfg.textOutline, cfg.textShadow),
    nameShadow: composeTextShadow(s.nameShadow, cfg.textOutline, cfg.textShadow),
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
