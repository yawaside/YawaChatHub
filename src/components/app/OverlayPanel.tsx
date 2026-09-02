import { useMemo, useState } from "react";
import { Eye, Gamepad2, Lock, MousePointerClick, Palette, Unlock } from "lucide-react";
import { makeMessage } from "../../lib/core";
import { resolveOverlayLook, WIDGET_EFFECTS, WIDGET_STYLES } from "../../lib/widget";
import type { OverlayConfig, WidgetEffect } from "../../lib/widget";
import { Btn, ColorInput, Label, Panel, Segmented, Select, Slider, Toggle } from "./ui";
import { PlatformIcon } from "../bits";

export default function OverlayPanel({
  cfg, onChange, desktop,
}: {
  cfg: OverlayConfig;
  onChange: (patch: Partial<OverlayConfig>) => void;
  desktop: boolean;
}) {
  const [run, setRun] = useState(0);
  const set = (patch: Partial<OverlayConfig>) => onChange(patch);
  const look = useMemo(() => resolveOverlayLook(cfg), [cfg]);

  const demo = useMemo(
    () => [
      { ...makeMessage("twitch"), author: "neon_wolf", text: "ЛЕЕЕЕТС ГОООУ", color: "#a78bfa" },
      { ...makeMessage("kick"), author: "vanya_fps", text: "модератор молодец", color: "#69db7c" },
      { ...makeMessage("youtube"), author: "quiet_owl", text: "кто ещё смотрит с телефона?", color: "#ff4e45" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.mode, cfg.fontSize, cfg.style, cfg.effect, run]
  );

  const shown = demo.slice(0, cfg.maxMessages);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <Panel
          title="Игровой оверлей"
          desc={
            desktop
              ? "Компактная лента поверх игры. Перетаскивается мышью, поверх всех окон."
              : "Настройки применяются в desktop-сборке. Здесь — живой предпросмотр."
          }
          right={
            <Btn variant={cfg.enabled ? "primary" : "outline"} onClick={() => set({ enabled: !cfg.enabled })}>
              <Gamepad2 size={12} /> {cfg.enabled ? "Включён" : "Выключен"}
            </Btn>
          }
          collapsible
        >
          <Toggle
            label="Показывать оверлей"
            hint="окно всегда поверх игры, можно скрыть горячей клавишей"
            on={cfg.enabled}
            onChange={(v) => set({ enabled: v })}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div
              className="flex flex-col justify-between rounded-xl border p-3 transition-colors"
              style={{ borderColor: "var(--dw-line)", background: "rgba(255,255,255,0.02)" }}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <MousePointerClick size={13} style={{ color: "var(--dw-dim)" }} />
                    Сквозные клики
                  </div>
                  <button
                    onClick={() => set({ clickThrough: !cfg.clickThrough })}
                    className="rounded-lg border px-2 py-1 text-[10px] font-bold uppercase transition-all"
                    style={{
                      borderColor: "var(--dw-line)",
                      background: cfg.clickThrough ? "#8b5cf6" : "var(--dw-input)",
                      color: cfg.clickThrough ? "#fff" : "var(--dw-text)",
                    }}
                  >
                    {cfg.clickThrough ? "Вкл" : "Выкл"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                  {cfg.clickThrough
                    ? "Клики проходят в игру. Окно нельзя перетащить."
                    : "Окно ловит мышь: перетащите его за шапку в нужный угол экрана."}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1">
                <kbd className="kbd">Ctrl</kbd><span className="text-[10px] text-gray-500">+</span><kbd className="kbd">Shift</kbd><span className="text-[10px] text-gray-500">+</span><kbd className="kbd">C</kbd>
              </div>
            </div>

            <div
              className="flex flex-col justify-between rounded-xl border p-3 transition-colors"
              style={{ borderColor: "var(--dw-line)", background: "rgba(255,255,255,0.02)" }}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <Gamepad2 size={13} style={{ color: "var(--dw-dim)" }} />
                    Позиция окна
                  </div>
                  <button
                    onClick={() => set({ locked: !cfg.locked })}
                    className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold transition-all"
                    style={{
                      borderColor: "var(--dw-line)",
                      background: "var(--dw-input)",
                      color: "var(--dw-text)",
                    }}
                  >
                    {cfg.locked ? <Lock size={10} /> : <Unlock size={10} />}
                    {cfg.locked ? "закреплена" : "свободная"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                  Зафиксируйте после настройки, чтобы случайно не сдвинуть оверлей мышью.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Стили оформления"
          desc="Те же пресеты, что и в виджете OBS."
          right={<Palette size={14} style={{ color: "#a78bfa" }} />}
          collapsible
        >
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {WIDGET_STYLES.map((s) => {
              const on = cfg.style === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => set({ style: s.id, bgOpacity: s.bgOpacity })}
                  className="rounded-xl border p-2.5 text-left transition-all"
                  style={{
                    borderColor: on ? "#8b5cf6" : "var(--dw-line)",
                    background: on ? "#8b5cf612" : "transparent",
                  }}
                >
                  <span className="flex h-7 items-center justify-center gap-1 rounded-lg" style={{ background: s.swatch[0] }}>
                    {s.swatch.map((c, i) => (
                      <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-semibold" style={{ color: on ? "#a78bfa" : "var(--dw-text)" }}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Анимация появления" collapsible>
          <Label>Эффект</Label>
          <Select<WidgetEffect>
            value={cfg.effect}
            onChange={(v) => { set({ effect: v }); setRun((n) => n + 1); }}
            options={WIDGET_EFFECTS.map((e) => ({ id: e.id, label: e.label }))}
          />
          <div className="mt-3">
            <Label hint={`${cfg.effectDuration.toFixed(2)} с`}>Скорость анимации</Label>
            <Slider
              value={cfg.effectDuration}
              min={0.1}
              max={1.2}
              step={0.02}
              onChange={(v) => set({ effectDuration: v })}
              format={(v) => `${v.toFixed(2)}с`}
              color="#22d3ee"
            />
          </div>
        </Panel>

        <Panel title="Текст" collapsible>
          <div className="space-y-3">
            <div>
              <Label hint={`${cfg.fontSize}px`}>Размер текста</Label>
              <Slider value={cfg.fontSize} min={9} max={26} onChange={(v) => set({ fontSize: v })} format={(v) => `${v}px`} />
            </div>
            <div>
              <Label hint={cfg.textColor ? "своё значение" : "из стиля"}>Цвет текста</Label>
              <ColorInput value={cfg.textColor || look.text} onChange={(v) => set({ textColor: v })} />
            </div>
            <div>
              <Label hint={cfg.nameColor ? "своё значение" : "из стиля"}>Цвет ника</Label>
              <ColorInput value={cfg.nameColor || look.name} onChange={(v) => set({ nameColor: v })} />
            </div>
            <Btn variant="ghost" onClick={() => set({ textColor: "", nameColor: "" })}>
              Вернуть цвета стиля
            </Btn>
          </div>
        </Panel>

        <Panel title="Фон и рамка" collapsible>
          <div className="space-y-3">
            <div>
              <Label hint={`${cfg.bgOpacity}%`}>Прозрачность подложки</Label>
              <Slider value={cfg.bgOpacity} min={0} max={100} onChange={(v) => set({ bgOpacity: v, bgColor: "" })} format={(v) => `${v}%`} color="#22d3ee" />
              <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Прозрачным становится только фон — текст сообщений остаётся чётким.
              </p>
            </div>
            <div>
              <Label hint={`${cfg.radius}px`}>Скругление углов</Label>
              <Slider value={cfg.radius} min={0} max={26} onChange={(v) => set({ radius: v })} format={(v) => `${v}px`} />
            </div>
            <div>
              <Label>Фоновое изображение (URL)</Label>
              <input
                value={cfg.bgImage}
                onChange={(e) => set({ bgImage: e.target.value })}
                placeholder="https://… (необязательно)"
                className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-[11.5px] outline-none placeholder:text-[var(--dw-dim)] focus:border-viol"
                style={{ borderColor: "var(--dw-line)" }}
              />
            </div>
            <Toggle
              label="Рамка оверлея"
              hint="выключите, чтобы убрать контур вокруг окна"
              on={cfg.showBorder}
              onChange={(v) => set({ showBorder: v })}
            />
          </div>
        </Panel>

        <Panel title="Содержимое" collapsible>
          <div className="space-y-3">
            <div>
              <Label hint={`${cfg.maxMessages}`}>Сообщений в ленте</Label>
              <Slider value={cfg.maxMessages} min={2} max={20} onChange={(v) => set({ maxMessages: v })} format={(v) => `${v}`} />
            </div>
            <div>
              <Label>Вид</Label>
              <Segmented
                value={cfg.mode}
                onChange={(v) => set({ mode: v })}
                options={[
                  { id: "compact", label: "Компактная лента" },
                  { id: "widget", label: "Плашки" },
                ]}
              />
            </div>
            <Toggle label="Значок площадки" on={cfg.showPlatform} onChange={(v) => set({ showPlatform: v })} />
            <Toggle label="Время сообщения" on={cfg.showTime} onChange={(v) => set({ showTime: v })} />
          </div>
        </Panel>
      </div>

      {/* Предпросмотр — всегда раскрыт */}
      <Panel
        title="Предпросмотр"
        desc="Так оверлей выглядит поверх игры."
        right={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px]" style={{ color: "var(--dw-dim)" }}>
              <Eye size={11} /> live
            </span>
            <Btn variant="ghost" onClick={() => setRun((n) => n + 1)}>Повторить</Btn>
          </div>
        }
      >
        <div
          className="relative overflow-hidden rounded-2xl border"
          style={{
            minHeight: 360,
            borderColor: "var(--dw-line)",
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(139,92,246,0.18), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(34,211,238,0.12), transparent 50%), #0b0d16",
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="absolute left-4 top-4 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-[9.5px] text-white/60 backdrop-blur-sm">
            игра · 1920×1080
          </div>

          <div
            className="absolute right-4 top-10 w-[min(100%-2rem,290px)] overflow-hidden p-3 shadow-2xl"
            style={{
              borderRadius: cfg.radius,
              border: `1px solid ${look.border}`,
              background: look.background,
              backgroundImage: look.bgImage ? `url("${look.bgImage}")` : undefined,
              backgroundSize: "cover",
              backdropFilter: "blur(8px)",
              opacity: cfg.enabled ? 1 : 0.45,
              fontFamily: look.fontFamily,
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: look.sub }}>
                overlay · {cfg.mode}
              </span>
              {!cfg.enabled && <span className="font-mono text-[9px]" style={{ color: "#f87171" }}>выкл</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              {shown.map((m) => (
                <div
                  key={`${m.id}-${run}`}
                  style={
                    cfg.mode === "widget"
                      ? {
                          borderRadius: Math.max(cfg.radius - 4, 4),
                          border: `1px solid ${look.border}`,
                          background: "rgba(0,0,0,0.18)",
                          padding: "6px 9px",
                        }
                      : undefined
                  }
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
                          background: m.platform === "twitch" ? "#a970ff" : m.platform === "kick" ? "#53fc18" : "#ff4e45",
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
                        <span className="mr-1.5 font-mono opacity-60" style={{ fontSize: "0.72em" }}>23:10</span>
                      )}
                      <span
                        className="mr-1.5"
                        style={{
                          color: look.name,
                          fontWeight: look.nameWeight,
                          textShadow: look.nameShadow,
                          textTransform: look.uppercaseName ? "uppercase" : "none",
                        }}
                      >
                        {m.author}
                      </span>
                      <span>{m.text}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-3 left-4 right-4 flex flex-wrap gap-2">
            <span className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1 font-mono text-[9.5px] text-white/70 backdrop-blur-sm">
              Ctrl+Shift+G — показать / скрыть
            </span>
            {cfg.clickThrough && (
              <span className="rounded-lg border border-cy/30 bg-cy/10 px-2.5 py-1 font-mono text-[9.5px] text-cy backdrop-blur-sm">
                сквозные клики
              </span>
            )}
          </div>
        </div>

        {!desktop && (
          <p className="mt-2 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            В браузере оверлей показан как предпросмотр. Поверх игры он работает в desktop-версии.
          </p>
        )}
      </Panel>
    </div>
  );
}
