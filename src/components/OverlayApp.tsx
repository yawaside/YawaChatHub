import { useEffect, useMemo, useState } from "react";
import { getSp, useChatSource } from "../lib/bridge";
import type { ChatMsg } from "../lib/core";
import { fmtTime, PLATFORMS } from "../lib/core";
import { DEFAULT_OVERLAY, resolveOverlayLook } from "../lib/widget";
import type { OverlayConfig } from "../lib/widget";
import { parseEmotes, loadGlobalEmotes } from "../lib/emotes";
import { aggregateViewers, fmtViewers, fmtViewersFull, pluralViewers } from "../lib/viewers";
import { PlatformIcon } from "./bits";

/** CSS-класс анимации появления. */
function fxClass(effect: string): string {
  return effect && effect !== "none" ? `ov-fx-${effect}` : "";
}

type Look = ReturnType<typeof resolveOverlayLook>;

/**
 * Нижняя полоса онлайна: иконки площадок и число зрителей.
 * Показываются ТОЛЬКО подключённые площадки (есть канал в статусе online);
 * неподключённые, офлайн и с ошибкой — не отображаются.
 */
export function OverlayOnlineBar({
  items, look, fontSize, mode, showBorder, radius,
}: {
  items: ReturnType<typeof aggregateViewers>;
  look: Look;
  fontSize: number;
  mode: OverlayConfig["mode"];
  showBorder: boolean;
  radius: number;
}) {
  if (!items.length) return null;
  const size = Math.max(9, Math.round(fontSize * 0.88));
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
      style={{
        borderTop: showBorder && mode !== "widget" ? `1px solid ${look.border}` : "none",
        ...(mode === "widget"
          ? {
              margin: "0 12px 12px",
              padding: "6px 9px",
              borderRadius: Math.max(radius - 4, 4),
              border: showBorder ? `1px solid ${look.border}` : "1px solid transparent",
              background: "rgba(0,0,0,0.2)",
            }
          : {}),
        fontFamily: look.fontFamily,
        fontSize: size,
        color: look.text,
        fontWeight: look.nameWeight,
        letterSpacing: look.letterSpacing,
        textShadow: look.textShadow,
      }}
    >
      {items.map((p) => {
        const meta = PLATFORMS[p.platform];
        return (
          <span
            key={p.platform}
            className="inline-flex items-center gap-1.5 leading-none"
            title={
              p.viewers === null
                ? `${meta.label}: подключено, онлайн уточняется`
                : `${meta.label}: ${fmtViewersFull(p.viewers)} ${pluralViewers(p.viewers)}${p.channels > 1 ? ` · каналов: ${p.channels}` : ""}`
            }
          >
            <span
              className="grid shrink-0 place-items-center text-white"
              style={{
                width: "1.3em",
                height: "1.3em",
                background: meta.color,
                borderRadius: look.iconShape === "circle" ? "50%" : look.iconShape === "square" ? 2 : 5,
                boxShadow: look.iconGlow ? `0 0 10px ${meta.color}` : "none",
              }}
            >
              <PlatformIcon id={p.platform} size={Math.round(size * 0.95)} />
            </span>
            <span className="font-mono tabular-nums" style={{ opacity: p.viewers === null ? 0.55 : 1 }}>
              {fmtViewers(p.viewers)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default function OverlayApp() {
  const sp = getSp();
  const [cfg, setCfg] = useState<OverlayConfig>(DEFAULT_OVERLAY);
  const [feed, setFeed] = useState<ChatMsg[]>([]);

  /* Один источник для сообщений и каналов: в приложении — реальные коннекторы,
     в браузере (#/overlay) — та же демо-симуляция, что и на сайте. */
  const { channels } = useChatSource((m) => setFeed((prev) => [...prev.slice(-60), m]));

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
      const onStorage = (e: StorageEvent) => {
        if (e.key !== "yawa:overlay" || !e.newValue) return;
        try { setCfg({ ...DEFAULT_OVERLAY, ...JSON.parse(e.newValue) }); } catch { /* noop */ }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    sp.overlay.get().then((o) => o && setCfg({ ...DEFAULT_OVERLAY, ...o }));
    sp.overlay.onChange((o) => setCfg((cur) => ({ ...cur, ...DEFAULT_OVERLAY, ...o })));
  }, [sp]);

  const look = useMemo(() => resolveOverlayLook(cfg), [cfg]);
  const online = useMemo(() => aggregateViewers(channels), [channels]);

  /* В оверлее — только сообщения зрителей: системные уведомления (подключения,
     обрывы, статусы) сюда не попадают. */
  /* Тик раз в секунду, чтобы сообщения с истёкшим TTL исчезали сами. */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!cfg.ttl || cfg.ttl <= 0) return;
    const iv = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(iv);
  }, [cfg.ttl]);

  const nowMs = Date.now();
  const shown = feed
    .filter((m) => !m.sys && (cfg.ttl <= 0 || nowMs - m.ts < cfg.ttl * 1000))
    .slice(-cfg.maxMessages);

  /* Шапки больше нет — окно перетаскивается за любую точку, пока оно не закреплено
     и не включены сквозные клики. */
  const draggable = !cfg.clickThrough && !cfg.locked;
  const dragStyle = (on: boolean) =>
    ({ WebkitAppRegion: on ? "drag" : "no-drag" }) as React.CSSProperties;

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{
        background: look.background,
        backgroundImage: look.bgImage ? `url("${look.bgImage}")` : undefined,
        backgroundSize: "cover",
        borderRadius: cfg.radius,
        border: `1px solid ${cfg.showBorder ? look.border : "transparent"}`,
        fontFamily: look.fontFamily,
        pointerEvents: cfg.clickThrough ? "none" : "auto",
        ...dragStyle(draggable),
      }}
    >
      <div
        className="scroll-thin flex min-h-0 flex-1 flex-col justify-end overflow-y-auto p-3"
        style={{ ...dragStyle(draggable), gap: `${cfg.rowGap ?? 6}px` }}
      >
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
              {cfg.showTime && (
                <span className="mt-[0.2em] shrink-0 font-mono opacity-60" style={{ fontSize: cfg.fontSize * 0.72, color: look.text }}>
                  {fmtTime(m.ts)}
                </span>
              )}
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
                  <span style={{ opacity: 0.55 }}>:</span>
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

      {cfg.showViewers && (
        <OverlayOnlineBar
          items={online}
          look={look}
          fontSize={cfg.fontSize}
          mode={cfg.mode}
          showBorder={cfg.showBorder}
          radius={cfg.radius}
        />
      )}
    </div>
  );
}
