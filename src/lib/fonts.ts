import type { FontId } from "./types";

/**
 * Шрифтовые наборы для оформления ленты, виджета и оверлея.
 * Первым идёт веб-шрифт, дальше — системные запасные варианты,
 * поэтому оформление не ломается без интернета.
 */
export interface FontDef {
  id: FontId;
  name: string;
  desc: string;
  stack: string;
}

export const FONT_FAMILIES: FontDef[] = [
  {
    id: "inter",
    name: "Inter",
    desc: "нейтральный гротеск",
    stack: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  {
    id: "mono",
    name: "JetBrains Mono",
    desc: "моноширинный, кибер",
    stack: '"JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace',
  },
  {
    id: "rounded",
    name: "Nunito",
    desc: "округлый и дружелюбный",
    stack: '"Nunito", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "gaming",
    name: "Игровой",
    desc: "плотный рубленый, как в игровых чатах",
    // Bebas/Anton отсутствуют в Windows — опираемся на системные аналоги
    stack: '"Segoe UI Semibold", "Arial Black", "Roboto Condensed", Impact, sans-serif',
  },
  {
    id: "condensed",
    name: "Oswald",
    desc: "узкий, много текста в строке",
    stack: '"Oswald", "Arial Narrow", "Segoe UI", sans-serif',
  },
  {
    id: "serif",
    name: "Georgia",
    desc: "с засечками, книжный",
    stack: 'Georgia, "Times New Roman", ui-serif, serif',
  },
  {
    id: "system",
    name: "Системный",
    desc: "шрифт оформления Windows",
    stack: 'system-ui, "Segoe UI", Tahoma, sans-serif',
  },
];

export function fontStack(id: FontId | undefined): string {
  return (FONT_FAMILIES.find((f) => f.id === id) ?? FONT_FAMILIES[0]).stack;
}
