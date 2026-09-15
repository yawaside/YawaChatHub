import type { CSSProperties } from "react";

/**
 * Эффекты появления сообщений. Один набор на все три поверхности:
 * лента приложения, игровой оверлей и OBS-виджет. Скорость задаётся
 * отдельно и передаётся в CSS переменной --fx-speed.
 */
export type EffectId = "none" | "fade" | "slide-left" | "slide-up" | "scale" | "blur" | "typewriter" | "bounce";

export interface EffectMeta {
  id: EffectId;
  name: string;
  desc: string;
}

export const EFFECTS: EffectMeta[] = [
  { id: "none", name: "Без эффекта", desc: "мгновенное появление" },
  { id: "fade", name: "Проявление", desc: "плавная прозрачность" },
  { id: "typewriter", name: "Печатная машинка", desc: "раскрытие строки слева направо" },
  { id: "slide-left", name: "Выезд сбоку", desc: "сдвиг слева направо" },
  { id: "slide-up", name: "Выезд снизу", desc: "сдвиг снизу вверх" },
  { id: "scale", name: "Увеличение", desc: "лёгкий зум" },
  { id: "blur", name: "Из размытия", desc: "фокусировка текста" },
  { id: "bounce", name: "Отскок", desc: "пружинистое появление" },
];

/** CSS-класс анимации; none — без анимации вовсе */
export function effectClass(effect: EffectId | undefined): string {
  const id = effect ?? "fade";
  return id === "none" ? "" : `fx fx-${id}`;
}

/** Длительность эффекта: 1 = обычная (280 мс), меньше = быстрее */
export function effectVars(speed: number | undefined): CSSProperties {
  const s = Math.min(3, Math.max(0.2, speed ?? 1));
  return { ["--fx-speed" as string]: `${Math.round(280 * s)}ms` };
}

export function effectName(id: EffectId | undefined): string {
  return EFFECTS.find((e) => e.id === (id ?? "fade"))?.name ?? "Проявление";
}

/**
 * Тонкая, чёткая обводка текста с настраиваемой дробной толщиной (шаг 0.2px) + мягкая тень.
 * @param width толщина обводки, px (0 = без обводки, 0.6 = тончайшая, 1.2 = средняя, 2.4 = плотная)
 * @param dropShadow включить мягкую тень позади текста для читаемости
 */
export function composeTextShadow(
  width: number | undefined,
  dropShadow = false,
  shadowColor = "rgba(0, 0, 0, 0.95)"
): string {
  const w = Math.max(0, Math.min(6, typeof width === "number" ? width : 0));
  const shadows: string[] = [];

  if (w > 0.05) {
    // 8 направлений смещения с субпиксельной точностью для аккуратного, не жирного контура
    const d = +(w * 0.707).toFixed(2);
    const r = +w.toFixed(2);
    shadows.push(
      `-${r}px 0 0 ${shadowColor}`,
      `${r}px 0 0 ${shadowColor}`,
      `0 -${r}px 0 ${shadowColor}`,
      `0 ${r}px 0 ${shadowColor}`,
      `-${d}px -${d}px 0 ${shadowColor}`,
      `${d}px -${d}px 0 ${shadowColor}`,
      `-${d}px ${d}px 0 ${shadowColor}`,
      `${d}px ${d}px 0 ${shadowColor}`
    );
  }

  if (dropShadow) {
    shadows.push("0 2px 5px rgba(0, 0, 0, 0.92)", "0 0 3px rgba(0, 0, 0, 0.75)");
  }

  return shadows.length ? shadows.join(", ") : "none";
}

export function textOutline(width: number | undefined, fallbackShadow = false): string {
  return composeTextShadow(width, fallbackShadow);
}
