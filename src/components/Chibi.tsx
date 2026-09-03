/**
 * 2D чиби-модельки в аниме-стиле (PNG с прозрачностью).
 * Используются и в приложении (VoicePanel), и в OBS-виджете.
 *
 * Анимация без артефактов:
 * - Контейнер .chibi-body анимируется (translateY), без фильтров.
 * - Картинка внутри имеет drop-shadow через filter, но сама не анимируется transform-ом.
 * - Рот — отдельный абсолютно позиционированный слой с CSS-анимацией scaleY (липсинк).
 */

import { CSSProperties } from "react";

export type ChibiId = "rust" | "tarkov" | "anime" | "none";

export const CHIBI_OPTIONS: Array<{ id: ChibiId; label: string }> = [
  { id: "none", label: "Без модельки" },
  { id: "rust", label: "RUST" },
  { id: "tarkov", label: "Tarkov" },
  { id: "anime", label: "Аниме" },
];

interface ChibiMeta {
  src: string;
  /** рот: центр и размер в % от контейнера, цвет */
  mouth: { cx: number; cy: number; w: number; h: number; color: string; innerColor: string };
}

/* Координаты рта подобраны под сгенерированные PNG (full-body, голова в верхней половине). */
function chibiSrc(name: string): string {
  if (typeof window !== "undefined") {
    const sp = (window as unknown as { sp?: unknown }).sp;
    // В Electron-рендерере index.html открывается через file:// — абсолютный /chibi не работает
    if (sp || window.location.protocol === "file:") return `./chibi/${name}.png`;
  }
  return `/chibi/${name}.png`;
}

export const CHIBI_META: Record<Exclude<ChibiId, "none">, ChibiMeta> = {
  anime: {
    src: chibiSrc("anime"),
    mouth: { cx: 50, cy: 42.5, w: 7, h: 9, color: "#c94a5a", innerColor: "#ffb3c6" },
  },
  rust: {
    src: chibiSrc("rust"),
    mouth: { cx: 50, cy: 40.5, w: 7.5, h: 8.5, color: "#8b3a22", innerColor: "#d4a08a" },
  },
  tarkov: {
    src: chibiSrc("tarkov"),
    mouth: { cx: 50, cy: 39.8, w: 6.5, h: 7.5, color: "#5a4a38", innerColor: "#c7b8a0" },
  },
};

export function ChibiSprite({
  id,
  speaking,
  className,
  style,
}: {
  id: ChibiId;
  speaking: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (id === "none") return null;
  const meta = CHIBI_META[id];
  if (!meta) return null;

  return (
    <div
      className={`chibi-root ${speaking ? "chibi-talk" : "chibi-idle"} ${className ?? ""}`}
      style={{
        position: "relative",
        display: "inline-block",
        lineHeight: 0,
        isolation: "isolate",
        ...style,
      }}
    >
      {/* тело, которое покачивается — без фильтров, чтобы не было артефактов */}
      <div className="chibi-body" style={{ width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={meta.src}
          alt={id}
          draggable={false}
          decoding="async"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center bottom",
            userSelect: "none",
            pointerEvents: "none",
            filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))",
            willChange: "transform",
          }}
        />
      </div>

      {/* рот — отдельный слой, поверх картинки */}
      <div
        className="chibi-mouth-layer"
        style={{
          position: "absolute",
          left: `${meta.mouth.cx - meta.mouth.w / 2}%`,
          top: `${meta.mouth.cy - meta.mouth.h / 2}%`,
          width: `${meta.mouth.w}%`,
          height: `${meta.mouth.h}%`,
          pointerEvents: "none",
          display: speaking ? "block" : "none",
        }}
      >
        <div
          className="chibi-mouth-open"
          style={{
            width: "100%",
            height: "100%",
            background: meta.mouth.color,
            borderRadius: "50% / 60%",
            position: "relative",
            overflow: "hidden",
            boxShadow: "inset 0 -1px 2px rgba(0,0,0,0.3)",
          }}
        >
          {/* язычок / блик */}
          <div
            style={{
              position: "absolute",
              left: "18%",
              top: "55%",
              width: "64%",
              height: "38%",
              background: meta.mouth.innerColor,
              borderRadius: "50%",
              opacity: 0.85,
            }}
          />
        </div>
      </div>
    </div>
  );
}
