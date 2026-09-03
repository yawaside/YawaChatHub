/**
 * 2D чиби-модельки в аниме-стиле (PNG-иллюстрации) с «живой» анимацией.
 *
 * Картинка режется на слои через clip-path и каждый слой анимируется отдельно:
 *   • тело      — дыхание (scaleY)
 *   • плечи     — лёгкий подъём/опускание
 *   • руки      — покачивание вокруг плеча
 *   • голова    — покачивание (rotate + bob)
 *   • глаза     — моргание накладными веками
 *   • рот       — плавно открывается в такт озвучке
 */

import { CSSProperties, useEffect, useRef, useState } from "react";

export type ChibiId = "rust" | "tarkov" | "anime" | "none";

export const CHIBI_OPTIONS: Array<{ id: ChibiId; label: string }> = [
  { id: "none", label: "Без модельки" },
  { id: "rust", label: "RUST" },
  { id: "tarkov", label: "Tarkov" },
  { id: "anime", label: "Аниме" },
];

/** Геометрия лица в системе координат 100×100 (проценты от картинки). */
export interface ChibiMeta {
  src: string;
  /** нижняя граница головы, % высоты — по ней режется слой головы */
  headCut: number;
  mouth: { cx: number; cy: number; rx: number; ry: number; color: string };
  /** веки для моргания: центр глаз и размеры + цвет кожи */
  eyes: { lx: number; rx: number; cy: number; w: number; h: number; skin: string };
}

export const CHIBI_META: Record<Exclude<ChibiId, "none">, ChibiMeta> = {
  anime: {
    src: "/chibi/anime.png",
    headCut: 46,
    mouth: { cx: 50, cy: 34, rx: 1.7, ry: 2.6, color: "#c94a5a" },
    eyes: { lx: 43.5, rx: 56.5, cy: 28.5, w: 4.6, h: 4.2, skin: "#fbe3d8" },
  },
  rust: {
    src: "/chibi/rust.png",
    headCut: 44,
    mouth: { cx: 50, cy: 31, rx: 1.8, ry: 2.5, color: "#7a3a2a" },
    eyes: { lx: 44, rx: 56, cy: 26, w: 4.2, h: 3.6, skin: "#e8c4a4" },
  },
  tarkov: {
    src: "/chibi/tarkov.png",
    headCut: 44,
    mouth: { cx: 50, cy: 30, rx: 1.6, ry: 2.3, color: "#6a5a48" },
    eyes: { lx: 44, rx: 56, cy: 25.5, w: 4.0, h: 3.4, skin: "#e3d4c0" },
  },
};

/**
 * Единый компонент чиби-модельки.
 * `speaking` — идёт озвучка: рот открывается, движения становятся живее.
 * `intensity` — 0..1, «громкость» для плавного рта (по умолчанию плавная синусоида).
 */
export function ChibiSprite({
  id, speaking, className, style, intensity,
}: {
  id: ChibiId;
  speaking: boolean;
  className?: string;
  style?: CSSProperties;
  intensity?: number;
}) {
  const [blink, setBlink] = useState(false);
  const [auto, setAuto] = useState(0);
  const raf = useRef(0);

  /* моргание: случайные паузы 2.2–6 с, само моргание ~140 мс */
  useEffect(() => {
    let t1 = 0;
    let t2 = 0;
    const loop = () => {
      t1 = window.setTimeout(() => {
        setBlink(true);
        t2 = window.setTimeout(() => {
          setBlink(false);
          loop();
        }, 140);
      }, 2200 + Math.random() * 3800);
    };
    loop();
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  /* плавное «раскрытие» рта, когда внешняя громкость не передана */
  useEffect(() => {
    if (!speaking || intensity !== undefined) { setAuto(0); return; }
    let t = 0;
    const tick = () => {
      t += 0.16;
      // сумма синусоид — речь выглядит естественнее, чем ровное мигание
      const v = 0.55 + 0.3 * Math.sin(t) + 0.15 * Math.sin(t * 2.7);
      setAuto(Math.max(0.05, Math.min(1, v)));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [speaking, intensity]);

  if (id === "none") return null;
  const meta = CHIBI_META[id];
  if (!meta) return null;

  const open = speaking ? (intensity !== undefined ? Math.max(0, Math.min(1, intensity)) : auto) : 0;
  const layer: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `url("${meta.src}")`,
    backgroundSize: "contain",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  } as CSSProperties;

  return (
    <div
      className={`chibi ${speaking ? "is-talking" : ""} ${className ?? ""}`}
      style={{ position: "relative", display: "inline-block", aspectRatio: "1 / 1", ...style }}
    >
      {/* тело — дыхание */}
      <div
        className="chibi-body"
        style={{ ...layer, clipPath: `inset(${meta.headCut}% 0 0 0)` }}
      />
      {/* руки — покачивание вокруг плеча */}
      <div
        className="chibi-arm chibi-arm-l"
        style={{ ...layer, clipPath: `inset(${meta.headCut + 4}% 66% 12% 0)` }}
      />
      <div
        className="chibi-arm chibi-arm-r"
        style={{ ...layer, clipPath: `inset(${meta.headCut + 4}% 0 12% 66%)` }}
      />
      {/* голова — покачивание, внутри неё веки и рот */}
      <div
        className="chibi-head"
        style={{ ...layer, clipPath: `inset(0 0 ${100 - meta.headCut}% 0)`, transformOrigin: `50% ${meta.headCut}%` }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {/* веки: перекрывают глаза цветом кожи на время моргания */}
          {blink && (
            <>
              <ellipse cx={meta.eyes.lx} cy={meta.eyes.cy} rx={meta.eyes.w / 2} ry={meta.eyes.h / 2} fill={meta.eyes.skin} />
              <ellipse cx={meta.eyes.rx} cy={meta.eyes.cy} rx={meta.eyes.w / 2} ry={meta.eyes.h / 2} fill={meta.eyes.skin} />
            </>
          )}
          {/* рот: высота плавно следует за громкостью */}
          {open > 0.02 && (
            <ellipse
              cx={meta.mouth.cx}
              cy={meta.mouth.cy}
              rx={meta.mouth.rx * (0.85 + open * 0.3)}
              ry={meta.mouth.ry * open}
              fill={meta.mouth.color}
              opacity={0.9}
              style={{ transition: "ry 70ms linear" }}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
