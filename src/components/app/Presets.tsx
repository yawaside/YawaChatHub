import type { Style } from "../../lib/presets";
import { isStyleActive } from "../../lib/presets";
import { PlatformIcon, nickColor, platformMeta } from "../../lib/platforms";
import { fontStack } from "../../lib/fonts";
import { composeTextShadow } from "../../lib/effects";
import type { ChatViewConfig, OverlayConfig, PlatformId, WidgetConfig } from "../../lib/types";

/* ---------------- сетка пресетов v1.2.4 ---------------- */
export function PresetGrid<T extends object>({
  presets,
  cfg,
  onApply,
}: {
  presets: Style<T>[];
  cfg: T;
  onApply: (patch: Partial<T>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {presets.map((p) => {
        const on = isStyleActive(p, cfg);
        return (
          <button
            key={p.id}
            onClick={() => onApply(p.patch)}
            title={p.desc}
            className="cursor-pointer rounded-xl border p-2 text-left transition-all hover:brightness-110"
            style={{
              background: on ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)" : "var(--dw-input)",
              borderColor: on ? "var(--dw-accent)" : "transparent",
            }}
          >
            <div
              className="mb-1.5 flex h-9 flex-col justify-center gap-1 rounded-lg px-1.5"
              style={{
                background: p.swatch[1] === "transparent" ? "repeating-conic-gradient(#2a2e3d 0% 25%, #1b1e29 0% 50%) 50%/8px 8px" : p.swatch[1],
                outline: "1px solid var(--dw-line)",
              }}
            >
              <span className="truncate text-[10px] font-bold" style={{ color: p.swatch[0], fontFamily: p.font }}>
                Аа Bb
              </span>
              <span className="h-1 rounded-full" style={{ background: p.swatch[0], opacity: 0.45, width: "80%" }} />
            </div>
            <p className="truncate text-[11.5px] font-semibold" style={{ color: on ? "var(--dw-accent-2)" : "var(--dw-text)", fontFamily: p.font }}>
              {p.name}
            </p>
            <p className="truncate text-[9.5px]" style={{ color: "var(--dw-dim)" }}>
              {p.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ================= галерея стилей ================= */

export function StyleGallery<T extends { styleId?: string }>({
  styles,
  cfg,
  onApply,
}: {
  styles: Style<T>[];
  cfg: T;
  onApply: (patch: Partial<T>) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {styles.map((s) => {
        const on = isStyleActive(s, cfg);
        return (
          <button
            key={s.id}
            onClick={() => onApply(s.patch)}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-colors"
            style={{
              background: on ? "color-mix(in srgb, var(--dw-accent) 12%, transparent)" : "transparent",
              borderColor: on ? "var(--dw-accent)" : "var(--dw-line)",
            }}
          >
            {/* образец: свой шрифт и фон стиля */}
            <span
              className="flex h-8 w-[68px] shrink-0 flex-col justify-center gap-[2px] rounded-md px-1.5"
              style={{
                background:
                  s.swatch[1] === "transparent"
                    ? "repeating-conic-gradient(#2a2e3d 0% 25%, #1b1e29 0% 50%) 50%/6px 6px"
                    : s.swatch[1],
              }}
            >
              <span className="truncate text-[8.5px] font-bold" style={{ color: s.swatch[0], fontFamily: s.font }}>
                nekto_san
              </span>
              <span className="truncate text-[7.5px]" style={{ color: "#e6e8f0aa", fontFamily: s.font }}>
                привет всем
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[12px] font-semibold"
                style={{ color: on ? "var(--dw-accent-2)" : "var(--dw-text)" }}
              >
                {s.name}
              </span>
              <span className="block truncate text-[10px]" style={{ color: "var(--dw-dim)" }}>
                {s.desc}
              </span>
            </span>

            {/* отметка выбора */}
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
              style={{
                borderColor: on ? "var(--dw-accent)" : "var(--range-rest)",
                background: on ? "var(--dw-accent)" : "transparent",
              }}
            >
              {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ================= демо-данные ================= */

const SAMPLE: { platform: PlatformId; author: string; text: string; kind?: string; amount?: number }[] = [
  { platform: "twitch", author: "nekto_san", text: "привет всем, погнали!" },
  { platform: "youtube", author: "wesna_life", text: "красиво затащил" },
  { platform: "donationalerts", author: "kot1k_tv", text: "на новый микрофон", kind: "donate", amount: 500 },
  { platform: "vkplay", author: "lazy_panda", text: "а какая катка следующая?" },
  { platform: "kick", author: "gg_wp_ez", text: "изи" },
];

const nick = (name: string, upper?: boolean) => (upper ? name.toUpperCase() : name);

/* ================= предпросмотр ленты ================= */

export function FeedPreview({ view }: { view: ChatViewConfig }) {
  const pad = view.density === "cozy" ? 9 : view.density === "standard" ? 6 : view.density === "compact" ? 3 : 1;

  return (
    <PreviewFrame title="Лента">
      <div
        className="flex flex-col"
        style={{ gap: view.spacing, fontSize: view.fontSize, fontFamily: fontStack(view.fontFamily) }}
      >
        {SAMPLE.slice(0, 4).map((m, i) => (
          <div
            key={i}
            className="leading-snug break-words"
            style={{
              padding: `${pad}px ${pad + 4}px`,
              borderRadius: view.radius,
              background: view.backdrop
                ? m.kind === "donate"
                  ? "color-mix(in srgb, #f59e0b 12%, transparent)"
                  : "var(--dw-panel)"
                : "transparent",
              borderLeft: view.stripe ? `3px solid ${platformMeta(m.platform).color}` : "none",
              borderBottom: view.separators ? "1px solid var(--dw-line)" : "none",
            }}
          >
            {view.showTime && (
              <span className="inline-block mr-1 tabular-nums align-baseline" style={{ fontSize: "0.78em", color: "var(--dw-dim)" }}>
                12:34
              </span>
            )}
            {view.showPlatform && (
              <span className="inline-flex mr-1 translate-y-[1.5px] align-baseline">
                <PlatformIcon id={m.platform} size={Math.round(view.fontSize * 0.85)} />
              </span>
            )}
            {view.showBadges && i === 0 && (
              <span
                className="inline-block mr-1 rounded px-1 font-bold uppercase align-baseline"
                style={{ fontSize: "0.6em", background: "rgba(52,211,153,0.2)", color: "#34d399" }}
              >
                mod
              </span>
            )}
            <span
              className="inline font-semibold mr-1"
              style={{ color: view.accentNick ? nickColor(m.author, platformMeta(m.platform).color) : "var(--dw-text)" }}
            >
              {nick(m.author, view.nickCase === "upper") + ":"}
            </span>
            {m.amount && (
              <span className="inline-block mr-1 rounded px-1 font-bold align-baseline" style={{ background: "#f59e0b22", color: "#fbbf24" }}>
                {m.amount} ₽
              </span>
            )}
            <span className="inline" style={{ color: "var(--dw-text)", textShadow: composeTextShadow(view.outlineWidth, view.textShadow ?? false) }}>{m.text}</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

/* ================= предпросмотр виджета ================= */

export function WidgetPreview({ cfg }: { cfg: WidgetConfig }) {
  const dark = cfg.theme !== "light";
  const shown = SAMPLE.slice(0, Math.min(cfg.max, 5));
  const size = Math.min(cfg.fontSize, 20);

  const rawOp = cfg.backdropOpacity ?? (cfg.transparent ? 0 : 0.7);
  const opacity = cfg.transparent ? 0 : Math.max(0, Math.min(1, rawOp > 1 ? rawOp / 100 : rawOp));
  const cardBg =
    opacity <= 0.001
      ? "transparent"
      : dark
        ? `rgba(10, 12, 20, ${opacity})`
        : `rgba(255, 255, 255, ${opacity})`;

  return (
    <PreviewFrame title="Виджет OBS" scene>
      <div
        className="flex flex-col justify-end rounded-lg p-2"
        style={{
          fontSize: size,
          fontFamily: fontStack(cfg.fontFamily),
          gap: cfg.spacing,
          background: "transparent",
          minHeight: 110,
        }}
      >
        {shown.map((m, i) => (
          <div
            key={i}
            className="px-2 py-1 leading-snug break-words"
            style={{
              borderRadius: cfg.radius ?? 10,
              background: cardBg,
              borderLeft: cfg.stripe ? `3px solid ${platformMeta(m.platform).color}` : "none",
              color: dark || opacity < 0.35 ? "#eef0f8" : "#121524",
              textShadow: composeTextShadow(cfg.outlineWidth, cfg.textShadow ?? cfg.outlines ?? true),
            }}
          >
            <span className="inline-flex mr-1 translate-y-[1px] align-baseline">
              <PlatformIcon id={m.platform} size={Math.round(size * 0.85)} />
            </span>
            <span className="inline font-bold mr-1" style={{ color: nickColor(m.author, platformMeta(m.platform).color) }}>
              {nick(m.author, cfg.nickCase === "upper") + ":"}
            </span>
            <span className="inline">{m.text}</span>
          </div>
        ))}

      </div>
      <p className="pt-1.5 text-[10px]" style={{ color: "var(--dw-dim)" }}>
        Шахматный фон — прозрачность в OBS. Показано {shown.length} из {cfg.max}.
      </p>
    </PreviewFrame>
  );
}

/* ================= предпросмотр оверлея ================= */

export function OverlayPreview({ cfg }: { cfg: OverlayConfig }) {
  const rawOp = cfg.backdropOpacity ?? 0;
  const op = Math.max(0, Math.min(1, rawOp > 1 ? rawOp / 100 : rawOp));
  const backdrop = { background: op <= 0.001 ? "transparent" : `rgba(8, 10, 16, ${op})`, borderRadius: cfg.radius };
  const textShadow = composeTextShadow(cfg.outlineWidth, cfg.textShadow ?? cfg.shadowText ?? true);
  const list = (cfg.showEvents ? SAMPLE : SAMPLE.filter((s) => !s.kind)).slice(
    0,
    Math.min(cfg.maxMessages, 4)
  );

  const statsBar = cfg.showStats ? (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1"
      style={{ ...backdrop, color: "#fff", textShadow }}
    >
      {cfg.showDonations && (
        <span className="font-bold" style={{ color: "#FFB454" }}>
          3 250 ₽{!cfg.statsCompact && <span className="font-medium opacity-75"> · 7</span>}
        </span>
      )}
      {(["twitch", "youtube", "vkplay"] as PlatformId[]).map((p) => (
        <span key={p} className="flex items-center gap-1">
          <PlatformIcon id={p} size={Math.round(cfg.fontSize * 0.9)} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4ade80" }} />
          {cfg.showViewers && <span className="tabular-nums" style={{ fontSize: "0.85em" }}>1.2k</span>}
        </span>
      ))}
    </div>
  ) : null;

  return (
    <PreviewFrame title="Оверлей" scene>
      <div
        className="flex flex-col"
        style={{
          gap: cfg.spacing,
          fontSize: cfg.fontSize,
          fontFamily: fontStack(cfg.fontFamily),
          opacity: cfg.textOpacity,
          minHeight: 110,
        }}
      >
        {cfg.statsPos === "top" && statsBar}
        {list.map((m, i) => (
          <div
            key={i}
            className="px-2 py-1 leading-snug break-words"
            style={{
              ...backdrop,
              color: "#fff",
              textShadow,
              borderLeft: cfg.accentBar
                ? `3px solid ${m.kind === "donate" ? "#f59e0b" : platformMeta(m.platform).color}`
                : "none",
            }}
          >
            {cfg.showTime && <span className="inline-block mr-1 text-[0.78em] opacity-70 align-baseline">12:34</span>}
            {cfg.showPlatform && (
              <span className="inline-flex mr-1 translate-y-[1px] align-baseline">
                <PlatformIcon id={m.platform} size={Math.round(cfg.fontSize * 0.85)} />
              </span>
            )}
            <span className="inline font-bold mr-1" style={{ color: nickColor(m.author, platformMeta(m.platform).color) }}>
              {nick(m.author, cfg.nickCase === "upper") + ":"}
            </span>
            {m.amount && (
              <span className="inline-block mr-1 rounded px-1 font-bold align-baseline" style={{ background: "rgba(245,158,11,0.28)", color: "#fde68a" }}>
                {m.amount} ₽
              </span>
            )}
            <span className="inline">{m.text}</span>
          </div>
        ))}
        {cfg.statsPos === "bottom" && statsBar}
      </div>
    </PreviewFrame>
  );
}

/* ================= рамка ================= */

function PreviewFrame({ title, children, scene }: { title: string; children: React.ReactNode; scene?: boolean }) {
  return (
    <div className="rounded-xl border p-2" style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}>
      <p className="pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--dw-dim)" }}>
        {title}
      </p>
      <div
        className="rounded-lg p-2"
        style={
          scene
            ? {
                background:
                  "linear-gradient(120deg, rgba(31,111,235,0.35), rgba(139,92,246,0.35)), repeating-conic-gradient(#2a2e3d 0% 25%, #1b1e29 0% 50%) 50%/14px 14px",
              }
            : { background: "var(--dw-bg)" }
        }
      >
        {children}
      </div>
    </div>
  );
}
