import { Command, Sun, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Варианты интерфейса десктоп-приложения YawaChatHub.
 * Каждый вариант — своя РАСКЛАДКА + своя палитра + свой характер.
 * Переключаются живьём из шапки и из настроек (вкладка «Интерфейс»).
 * Палитра повторяет оригинальный src/lib/app-variants.ts из репозитория.
 */
export type VariantId = "command" | "terminal" | "studio";

export interface AppVariant {
  id: VariantId;
  name: string;
  desc: string;
  icon: LucideIcon;
  /** где живут каналы: слева (сайдбар), сверху (полоса) или справа (рейл) */
  layout: "left" | "top" | "right";
  /** моноширинный шрифт во всём окне */
  mono?: boolean;
  /** светлая тема */
  light?: boolean;
  vars: Record<string, string>;
}

function v(base: Record<string, string>, a1: string, a2: string): Record<string, string> {
  return { ...base, "--dw-accent": a1, "--dw-accent-2": a2 };
}

export const APP_VARIANTS: AppVariant[] = [
  {
    id: "command",
    name: "Команда",
    desc: "Тёмный · фиолетовый · каналы слева",
    icon: Command,
    layout: "left",
    vars: v(
      {
        "--dw-bg": "#0a0b13",
        "--dw-panel": "#10121d",
        "--dw-panel2": "#161929",
        "--dw-line": "rgba(255,255,255,0.08)",
        "--dw-text": "#eceef6",
        "--dw-dim": "#8b91a8",
        "--dw-hover": "rgba(255,255,255,0.05)",
        "--dw-input": "rgba(255,255,255,0.06)",
        "--dw-scroll": "rgba(255,255,255,0.16)",
        "--range-rest": "rgba(255,255,255,0.14)",
      },
      "#8b5cf6",
      "#a78bfa"
    ),
  },
  {
    id: "terminal",
    name: "Терминал",
    desc: "Кибер-моно · каналы сверху · статус-бар",
    icon: Terminal,
    layout: "top",
    mono: true,
    vars: v(
      {
        "--dw-bg": "#05090c",
        "--dw-panel": "#0a1013",
        "--dw-panel2": "#0d1519",
        "--dw-line": "rgba(34,211,238,0.16)",
        "--dw-text": "#d9f6f3",
        "--dw-dim": "#5f7d84",
        "--dw-hover": "rgba(34,211,238,0.06)",
        "--dw-input": "rgba(34,211,238,0.07)",
        "--dw-scroll": "rgba(34,211,238,0.25)",
        "--range-rest": "rgba(34,211,238,0.15)",
      },
      "#22d3ee",
      "#67e8f9"
    ),
  },
  {
    id: "studio",
    name: "Студия",
    desc: "Светлый · стеклянный · каналы справа",
    icon: Sun,
    layout: "right",
    light: true,
    vars: v(
      {
        "--dw-bg": "#f2f4fa",
        "--dw-panel": "#ffffff",
        "--dw-panel2": "#e9edf6",
        "--dw-line": "rgba(15,23,42,0.08)",
        "--dw-text": "#0f172a",
        "--dw-dim": "#64748b",
        "--dw-hover": "rgba(15,23,42,0.04)",
        "--dw-input": "rgba(15,23,42,0.05)",
        "--dw-scroll": "rgba(15,23,42,0.2)",
        "--range-rest": "rgba(15,23,42,0.12)",
      },
      "#3b82f6",
      "#93c5fd"
    ),
  },
];

export function getVariant(id: string): AppVariant {
  return APP_VARIANTS.find((x) => x.id === id) ?? APP_VARIANTS[0];
}
