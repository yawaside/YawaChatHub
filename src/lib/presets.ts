import type { ChatViewConfig, OverlayConfig, WidgetConfig } from "./types";

/**
 * СТИЛИ ОФОРМЛЕНИЯ — единый набор стилей из YawaChat_Hub для всех трёх поверхностей:
 * Лента чата, Виджет OBS и Игровой оверлей.
 *
 * Стиль отвечает за шрифт, плотность, скругления, подложку, цвет ника и полосы.
 * Стиль НЕ сбрасывает эффекты появления, авто-затухание и состав строки.
 */

export interface Style<T> {
  id: string;
  name: string;
  desc: string;
  /** цвета для миниатюры */
  swatch: [string, string];
  /** шрифт миниатюры */
  font: string;
  patch: Partial<T>;
}

const INTER = '"Inter", sans-serif';
const MONO = '"JetBrains Mono", monospace';
const NUNITO = '"Nunito", sans-serif';
const OSWALD = '"Oswald", "Roboto Condensed", sans-serif';
const SERIF = "Georgia, serif";

/* ========================= ЛЕНТА ЧАТА ========================= */

export const FEED_STYLES: Style<ChatViewConfig>[] = [
  {
    id: "clean",
    name: "Чистый",
    desc: "современный вид с мягкой тёмной плашкой",
    swatch: ["#a78bfa", "#161929"],
    font: INTER,
    patch: {
      styleId: "clean", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5,
      radius: 10, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "rust",
    name: "Rust",
    desc: "как в игре: без плашек, плотный шрифт с тонким контуром",
    swatch: ["#cd412b", "transparent"],
    font: OSWALD,
    patch: {
      styleId: "rust", density: "tight", fontSize: 14, fontFamily: "gaming", spacing: 1,
      radius: 0, stripe: false, separators: false, nickCase: "normal", backdrop: false, outlineWidth: 0.8, textShadow: true,
    },
  },
  {
    id: "wot",
    name: "World of Tanks",
    desc: "боевой чат: узкий шрифт, зелёные ники, полоса",
    swatch: ["#80d639", "#14171c"],
    font: OSWALD,
    patch: {
      styleId: "wot", density: "compact", fontSize: 14, fontFamily: "condensed", spacing: 3,
      radius: 2, stripe: true, separators: false, nickCase: "upper", backdrop: true, outlineWidth: 0.6, textShadow: true,
    },
  },
  {
    id: "glass",
    name: "Стекло",
    desc: "полупрозрачная стеклянная подложка",
    swatch: ["#2563eb", "#1c2438"],
    font: INTER,
    patch: {
      styleId: "glass", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5,
      radius: 14, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "neon",
    name: "Неон",
    desc: "киберпанк: неоновые ники, цветная полоса",
    swatch: ["#22d3ee", "#080514"],
    font: MONO,
    patch: {
      styleId: "neon", density: "standard", fontSize: 13, fontFamily: "mono", spacing: 4,
      radius: 6, stripe: true, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0.6, textShadow: true,
    },
  },
  {
    id: "terminal",
    name: "Терминал",
    desc: "моноширинный консольный чат",
    swatch: ["#34d399", "#020a08"],
    font: MONO,
    patch: {
      styleId: "terminal", density: "compact", fontSize: 13, fontFamily: "mono", spacing: 2,
      radius: 0, stripe: false, separators: true, nickCase: "normal", backdrop: false, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "tarkov",
    name: "Tarkov",
    desc: "чат Escape from Tarkov: угольный фон, бежевый текст",
    swatch: ["#bfa680", "#181816"],
    font: OSWALD,
    patch: {
      styleId: "tarkov", density: "compact", fontSize: 13, fontFamily: "condensed", spacing: 3,
      radius: 0, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "глубокий чёрный контраст под каждой строкой",
    swatch: ["#a78bfa", "#000000"],
    font: INTER,
    patch: {
      styleId: "amoled", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 4,
      radius: 8, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "minimal-light",
    name: "Светлый",
    desc: "светлые плашки для дневного режима",
    swatch: ["#7c3aed", "#f4f6fb"],
    font: INTER,
    patch: {
      styleId: "minimal-light", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5,
      radius: 12, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "lofi",
    name: "Ло-фай",
    desc: "мягкий фиолетовый фон, округлый шрифт",
    swatch: ["#c9a0dc", "#1c1226"],
    font: NUNITO,
    patch: {
      styleId: "lofi", density: "cozy", fontSize: 14, fontFamily: "rounded", spacing: 7,
      radius: 14, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "hud",
    name: "HUD",
    desc: "зелёный тактический интерфейс",
    swatch: ["#66ff99", "#000600"],
    font: MONO,
    patch: {
      styleId: "hud", density: "compact", fontSize: 13, fontFamily: "mono", spacing: 2,
      radius: 0, stripe: true, separators: false, nickCase: "upper", backdrop: true, outlineWidth: 0.6, textShadow: true,
    },
  },
  {
    id: "ocean",
    name: "Океан",
    desc: "глубокий синий с бирюзовыми акцентами",
    swatch: ["#22d3ee", "#060e1c"],
    font: INTER,
    patch: {
      styleId: "ocean", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5,
      radius: 10, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
];

/* ========================= ВИДЖЕТ OBS ========================= */

export const WIDGET_STYLES: Style<WidgetConfig>[] = [
  {
    id: "clean",
    name: "Чистый",
    desc: "современный вид с мягкой полупрозрачной подложкой",
    swatch: ["#0e0f18", "#a78bfa"],
    font: INTER,
    patch: {
      styleId: "clean", transparent: false, backdropOpacity: 0.7, outlines: true, outlineWidth: 0.8, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "inter", spacing: 4, radius: 12, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "rust",
    name: "Rust",
    desc: "как в игре: без фона, плотный шрифт с аккуратным контуром",
    swatch: ["#cd412b", "transparent"],
    font: OSWALD,
    patch: {
      styleId: "rust", transparent: true, backdropOpacity: 0, outlines: true, outlineWidth: 1.0, textShadow: true, theme: "dark",
      fontSize: 20, fontFamily: "gaming", spacing: 1, radius: 0, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "wot",
    name: "World of Tanks",
    desc: "боевой чат WoT: зелёный ник, полупрозрачная подложка",
    swatch: ["#f2a900", "#14171c"],
    font: OSWALD,
    patch: {
      styleId: "wot", transparent: false, backdropOpacity: 0.5, outlines: true, outlineWidth: 0.8, textShadow: true, theme: "dark",
      fontSize: 19, fontFamily: "condensed", spacing: 3, radius: 2, stripe: true, nickCase: "upper",
    },
  },
  {
    id: "glass",
    name: "Стекло",
    desc: "размытая стеклянная подложка",
    swatch: ["#e2efff", "rgba(37,99,235,0.35)"],
    font: INTER,
    patch: {
      styleId: "glass", transparent: false, backdropOpacity: 0.35, outlines: true, outlineWidth: 0.6, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "inter", spacing: 4, radius: 16, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "neon",
    name: "Неон",
    desc: "яркие неоновые акценты, киберпанк-плашки",
    swatch: ["#060810", "#22d3ee"],
    font: MONO,
    patch: {
      styleId: "neon", transparent: false, backdropOpacity: 0.75, outlines: true, outlineWidth: 0.8, textShadow: true, theme: "dark",
      fontSize: 17, fontFamily: "mono", spacing: 4, radius: 6, stripe: true, nickCase: "normal",
    },
  },
  {
    id: "terminal",
    name: "Терминал",
    desc: "консольный вид, моноширинный шрифт",
    swatch: ["#020a08", "#34d399"],
    font: MONO,
    patch: {
      styleId: "terminal", transparent: false, backdropOpacity: 0.8, outlines: false, outlineWidth: 0, textShadow: false, theme: "dark",
      fontSize: 17, fontFamily: "mono", spacing: 2, radius: 4, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "tarkov",
    name: "Tarkov",
    desc: "чат Escape from Tarkov: угольный фон, бежевый текст",
    swatch: ["#181816", "#bfa680"],
    font: OSWALD,
    patch: {
      styleId: "tarkov", transparent: false, backdropOpacity: 0.85, outlines: false, outlineWidth: 0, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "condensed", spacing: 3, radius: 0, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "глубокий чёрный контраст под каждой строкой",
    swatch: ["#000000", "#a78bfa"],
    font: INTER,
    patch: {
      styleId: "amoled", transparent: false, backdropOpacity: 0.9, outlines: false, outlineWidth: 0, textShadow: false, theme: "dark",
      fontSize: 18, fontFamily: "inter", spacing: 4, radius: 8, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "minimal-light",
    name: "Светлый",
    desc: "для светлых и пастельных сцен OBS",
    swatch: ["#f8f9fc", "#7c3aed"],
    font: INTER,
    patch: {
      styleId: "minimal-light", transparent: false, backdropOpacity: 0.9, outlines: false, outlineWidth: 0, textShadow: false, theme: "light",
      fontSize: 17, fontFamily: "inter", spacing: 5, radius: 12, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "lofi",
    name: "Ло-фай",
    desc: "мягкий фиолетовый фон, тёплые тона",
    swatch: ["#1c1226", "#c9a0dc"],
    font: NUNITO,
    patch: {
      styleId: "lofi", transparent: false, backdropOpacity: 0.75, outlines: true, outlineWidth: 0.6, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "rounded", spacing: 6, radius: 14, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "hud",
    name: "HUD",
    desc: "тактический зелёный интерфейс",
    swatch: ["#000600", "#33ff66"],
    font: MONO,
    patch: {
      styleId: "hud", transparent: false, backdropOpacity: 0.6, outlines: true, outlineWidth: 0.8, textShadow: true, theme: "dark",
      fontSize: 16, fontFamily: "mono", spacing: 2, radius: 0, stripe: false, nickCase: "upper",
    },
  },
  {
    id: "ocean",
    name: "Океан",
    desc: "глубоководный синий с бирюзовыми акцентами",
    swatch: ["#060e1c", "#22d3ee"],
    font: INTER,
    patch: {
      styleId: "ocean", transparent: false, backdropOpacity: 0.72, outlines: true, outlineWidth: 0.6, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "inter", spacing: 5, radius: 10, stripe: false, nickCase: "normal",
    },
  },
];

/* ========================= ОВЕРЛЕЙ ========================= */

export const OVERLAY_STYLES: Style<OverlayConfig>[] = [
  {
    id: "clean",
    name: "Чистый",
    desc: "полупрозрачные плашки с мягким контуром",
    swatch: ["#0e0f18", "#a78bfa"],
    font: INTER,
    patch: {
      styleId: "clean", backdropOpacity: 0.65, textOpacity: 1, radius: 10, accentBar: true,
      shadowText: true, outlineWidth: 0.8, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "rust",
    name: "Rust",
    desc: "как в игре: без подложки, плотный текст с контуром",
    swatch: ["#cd412b", "transparent"],
    font: OSWALD,
    patch: {
      styleId: "rust", backdropOpacity: 0, textOpacity: 1, radius: 0, accentBar: false,
      shadowText: true, outlineWidth: 1.0, fontFamily: "gaming", fontSize: 16, spacing: 1, nickCase: "normal",
    },
  },
  {
    id: "wot",
    name: "World of Tanks",
    desc: "боевой чат WoT: зелёные ники, полупрозрачная подложка",
    swatch: ["#80d639", "rgba(20,23,28,0.6)"],
    font: OSWALD,
    patch: {
      styleId: "wot", backdropOpacity: 0.6, textOpacity: 1, radius: 2, accentBar: true,
      shadowText: true, outlineWidth: 0.8, fontFamily: "condensed", fontSize: 14, spacing: 3, nickCase: "upper",
    },
  },
  {
    id: "glass",
    name: "Стекло",
    desc: "размытая стеклянная подложка",
    swatch: ["#2563eb", "rgba(37,99,235,0.3)"],
    font: INTER,
    patch: {
      styleId: "glass", backdropOpacity: 0.45, textOpacity: 1, radius: 14, accentBar: true,
      shadowText: true, outlineWidth: 0.6, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "neon",
    name: "Неон",
    desc: "киберпанк-неон с акцентными полосами",
    swatch: ["#22d3ee", "rgba(8,5,20,0.7)"],
    font: MONO,
    patch: {
      styleId: "neon", backdropOpacity: 0.7, textOpacity: 1, radius: 6, accentBar: true,
      shadowText: true, outlineWidth: 0.8, fontFamily: "mono", fontSize: 13, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "terminal",
    name: "Терминал",
    desc: "моноширинный консольный чат",
    swatch: ["#34d399", "rgba(2,10,8,0.75)"],
    font: MONO,
    patch: {
      styleId: "terminal", backdropOpacity: 0.75, textOpacity: 1, radius: 0, accentBar: false,
      shadowText: false, outlineWidth: 0, fontFamily: "mono", fontSize: 13, spacing: 2, nickCase: "normal",
    },
  },
  {
    id: "tarkov",
    name: "Tarkov",
    desc: "чат Tarkov: угольная подложка, бежевый текст",
    swatch: ["#bfa680", "rgba(24,24,22,0.85)"],
    font: OSWALD,
    patch: {
      styleId: "tarkov", backdropOpacity: 0.85, textOpacity: 1, radius: 0, accentBar: false,
      shadowText: true, outlineWidth: 0, fontFamily: "condensed", fontSize: 14, spacing: 3, nickCase: "normal",
    },
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "глубокий чёрный фон, максимальный контраст",
    swatch: ["#a78bfa", "#000000"],
    font: INTER,
    patch: {
      styleId: "amoled", backdropOpacity: 0.9, textOpacity: 1, radius: 8, accentBar: false,
      shadowText: false, outlineWidth: 0, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "lofi",
    name: "Ло-фай",
    desc: "мягкий фиолетовый фон, тёплый текст",
    swatch: ["#c9a0dc", "rgba(28,18,38,0.7)"],
    font: NUNITO,
    patch: {
      styleId: "lofi", backdropOpacity: 0.7, textOpacity: 1, radius: 14, accentBar: false,
      shadowText: true, outlineWidth: 0.6, fontFamily: "rounded", fontSize: 14, spacing: 6, nickCase: "normal",
    },
  },
  {
    id: "hud",
    name: "HUD",
    desc: "зелёный тактический интерфейс",
    swatch: ["#66ff99", "rgba(0,6,0,0.65)"],
    font: MONO,
    patch: {
      styleId: "hud", backdropOpacity: 0.65, textOpacity: 1, radius: 0, accentBar: true,
      shadowText: true, outlineWidth: 0.8, fontFamily: "mono", fontSize: 13, spacing: 2, nickCase: "upper",
    },
  },
  {
    id: "ocean",
    name: "Океан",
    desc: "глубоководный синий с бирюзовыми акцентами",
    swatch: ["#22d3ee", "rgba(6,14,28,0.7)"],
    font: INTER,
    patch: {
      styleId: "ocean", backdropOpacity: 0.7, textOpacity: 1, radius: 10, accentBar: false,
      shadowText: true, outlineWidth: 0.6, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "ghost",
    name: "Прозрачный",
    desc: "полностью без подложки, только текст с контуром",
    swatch: ["#ffffff", "transparent"],
    font: INTER,
    patch: {
      styleId: "ghost", backdropOpacity: 0, textOpacity: 1, radius: 0, accentBar: false,
      shadowText: true, outlineWidth: 0.8, fontFamily: "inter", fontSize: 15, spacing: 4, nickCase: "normal",
    },
  },
];

/** Переезд удалённых стилей на новые темы */
const STYLE_ALIAS: Record<string, string> = {
  classic: "clean", cards: "clean", focus: "clean", broadcast: "clean",
  console: "terminal", lines: "terminal", dense: "rust", minimal: "clean",
  journal: "clean", book: "clean",
  ticker: "terminal", "dark-card": "clean", "light-card": "minimal-light",
  bubbles: "lofi", stripe: "wot", solid: "amoled",
  compact: "terminal", events: "clean", stealth: "ghost", spotlight: "wot",
};

export function resolveStyleId(id: string | undefined): string | undefined {
  if (!id) return id;
  return STYLE_ALIAS[id] ?? id;
}

export function isStyleActive<T extends { styleId?: string }>(style: Style<T>, cfg: T): boolean {
  return resolveStyleId(cfg.styleId) === style.id;
}

/** название выбранного стиля — для заголовка свёрнутого блока */
export function styleName<T>(styles: Style<T>[], id: string | undefined): string {
  const resolved = resolveStyleId(id);
  return styles.find((s) => s.id === resolved)?.name ?? "свой";
}

/* совместимость со старыми импортами */
export const FEED_PRESETS = FEED_STYLES;
export const WIDGET_PRESETS = WIDGET_STYLES;
export const OVERLAY_PRESETS = OVERLAY_STYLES;
