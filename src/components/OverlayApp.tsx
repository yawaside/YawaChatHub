import { useEffect, useMemo, useState } from "react";
import { getSp } from "../lib/bridge";
import type { ChatMsg } from "../lib/core";
import { fmtTime, PLATFORMS } from "../lib/core";
import { DEFAULT_OVERLAY, resolveOverlayLook } from "../lib/widget";
import type { OverlayConfig } from "../lib/widget";
import { parseEmotes, loadGlobalEmotes } from "../lib/emotes";
import { PlatformIcon } from "./bits";

/** CSS-класс анимации появления. */
function fxClass(effect: string): string {
  return effect && effect !== "none" ? `ov-fx-${effect}` : "";
}

export default function OverlayApp() {
  const sp = getSp();
  const [cfg, setCfg] = useState<OverlayConfig>(DEFAULT_OVERLAY);
  const [feed, setFeed] = useState<ChatMsg[]>([]);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    loadGlobalEmotes();
    return () => document.documentElement.classList.remove("overlay-mode");
  }, []);

  useEffect(() => {
    if (!sp) {
      try {
        const raw = localStorage.getItem("yawa:overlay");
        if (raw) setCfg({ ...DEFAULT_OVERLAY, ...JSON.parse(raw) });
      } catch { /* noop */ }
      return;
    }
    sp.onChat((m) => setFeed((prev) => [...prev.slice(-60), m]));
    sp.overlay.get().then((o) => o && setCfg({ ...DEFAULT_OVERLAY, ...o }));
    sp.overlay.onChange((o) => setCfg((cur) => ({ ...cur, ...DEFAULT_OVERLAY, ...o })));
  }, [sp]);

  const look = useMemo(() => resolveOverlayLook(cfg), [cfg]);
  const shown = feed.filter((m) => !m.sys).slice(-cfg.maxMessages);
  const draggable = !cfg.clickThrough && !cfg.locked;
  const dragStyle = (on: boolean) =>
    ({ WebkitAppRegion: on ? "drag" : "no-drag" }) as React.CSSProperties;

  const borderColor = cfg.showBorder
    ? hover && draggable
      ? "rgba(139,92,246,0.55)"
      : look.border
    : "transparent";

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{
        background: look.background,
        backgroundImage: look.bgImage ? `url("${look.bgImage}")` : undefined,
        backgroundSize: "cover",
        borderRadius: cfg.radius,
        border: `1px solid ${borderColor}`,
        fontFamily: look.fontFamily,
        pointerEvents: cfg.clickThrough ? "none" : "auto",
        transition: "border-color 0.2s",
        ...dragStyle(draggable),
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="flex shrink-0 items-center gap-2 px-3 py-1.5"
        style={{
          borderBottom: cfg.showBorder ? `1px solid ${look.border}` : "none",
          ...dragStyle(draggable),
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: look.name, boxShadow: `0 0 8px ${look.name}` }} />
        <span className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: look.sub }}>
          YawaChatHub
        </span>
        <span className="ml-auto font-mono text-[9px]" style={{ color: look.sub }}>
          {cfg.clickThrough
            ? "клики насквозь"
            : cfg.locked
            ? "закреплён"
            : hover
            ? "тяните за шапку"
            : `${shown.length}/${cfg.maxMessages}`}
        </span>
      </div>

      <div
        className="scroll-thin flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-y-auto p-3"
        style={dragStyle(false)}
      >
        {shown.length === 0 && (
          <p className="text-[11px] leading-snug" style={{ color: look.sub }}>
            Оверлей активен — жду сообщения из чата…
            <br />
            <span className="font-mono text-[9.5px]">Ctrl+Shift+G — скрыть</span>
          </p>
        )}

        {shown.map((m) => (
          <div
            key={m.id}
            className={fxClass(cfg.effect)}
            style={{
              ["--ov-dur" as string]: `${cfg.effectDuration}s`,
              ...(cfg.mode === "widget"
                ? {
                    borderRadius: Math.max(cfg.radius - 4, 4),
                    border: cfg.showBorder ? `1px solid ${look.border}` : "1px solid transparent",
                    background: "rgba(0,0,0,0.2)",
                    padding: "6px 9px",
                  }
                : {}),
            }}
          >
            <div className="flex items-start gap-2">
              {cfg.showPlatform && (
                <span
                  className="mt-[0.15em] grid shrink-0 place-items-center text-white"
                  style={{
                    width: "1.15em",
                    height: "1.15em",
                    fontSize: cfg.fontSize * 0.8,
                    fontWeight: 700,
                    background: PLATFORMS[m.platform].color,
                    borderRadius: look.iconShape === "circle" ? "50%" : look.iconShape === "square" ? 2 : 5,
                    boxShadow: look.iconGlow ? "0 0 10px currentColor" : "none",
                  }}
                >
                  <PlatformIcon id={m.platform} size={cfg.fontSize * 0.85} />
                </span>
              )}
              <p
                className="min-w-0 leading-snug"
                style={{
                  fontSize: cfg.fontSize,
                  color: look.text,
                  fontWeight: look.fontWeight,
                  letterSpacing: look.letterSpacing,
                  textShadow: look.textShadow,
                  overflowWrap: "anywhere",
                }}
              >
                {cfg.showTime && (
                  <span className="mr-1.5 font-mono opacity-60" style={{ fontSize: "0.72em" }}>
                    {fmtTime(m.ts)}
                  </span>
                )}
                <span
                  className="mr-1.5"
                  style={{
                    color: look.id === "clean" ? m.color : look.name,
                    fontWeight: look.nameWeight,
                    textShadow: look.nameShadow,
                    textTransform: look.uppercaseName ? "uppercase" : "none",
                  }}
                >
                  {m.author}
                </span>
                {(m.parts && m.parts.length ? m.parts : parseEmotes(m.text)).map((part, i) =>
                  part.type === "emote" ? (
                    <img
                      key={`${m.id}-e${i}`}
                      src={part.url}
                      alt={part.value}
                      title={part.value}
                      className="inline-block align-[-0.3em]"
                      style={{ height: cfg.fontSize * 1.5 }}
                    />
                  ) : (
                    <span key={`${m.id}-t${i}`}>{part.value}</span>
                  )
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
