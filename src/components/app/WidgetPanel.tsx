import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, Palette, Radio, Send } from "lucide-react";
import { getSp } from "../../lib/bridge";
import { makeMessage } from "../../lib/core";
import { resolveWidgetLook, WIDGET_EFFECTS, WIDGET_STYLES } from "../../lib/widget";
import type { WidgetConfig, WidgetEffect } from "../../lib/widget";
import type { TtsConfig } from "../../lib/tts-config";
import { PlatformIcon } from "../bits";
import { Btn, ColorInput, Label, Panel, Segmented, Select, Slider, Toggle } from "./ui";

export default function WidgetPanel({
  cfg, onChange, url, clients, toast, tts,
}: {
  cfg: WidgetConfig;
  onChange: (c: WidgetConfig) => void;
  url: string;
  clients: number;
  toast: (t: string) => void;
  tts: TtsConfig;
}) {
  const [copied, setCopied] = useState(false);
  const [run, setRun] = useState(0);
  const look = useMemo(() => resolveWidgetLook(cfg), [cfg]);
  const set = (patch: Partial<WidgetConfig>) => onChange({ ...cfg, ...patch });

  /* Конфиг уходит в OBS-виджет мгновенно — ссылка при этом не меняется. */
  useEffect(() => {
    getSp()?.widgetConfig?.({ cfg, look, tts });
  }, [cfg, look, tts]);

  const demo = useMemo(
    () => [
      { ...makeMessage("twitch"), author: "neon_wolf", text: "Отличный стрим, так держать!", color: "#a78bfa" },
      { ...makeMessage("youtube"), author: "mila_lav", text: "Привет из чата :)", color: "#f472b6" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.style, cfg.fontSize, cfg.effect, run]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Ссылка скопирована — вставьте её в OBS");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Не удалось скопировать — скопируйте вручную");
    }
  };

  const sendTest = () => {
    const sp = getSp();
    const msg = { ...makeMessage("tiktok"), text: "Тестовое сообщение из YawaChatHub" };
    if (sp) {
      sp.widgetTest(msg);
      toast("Тестовое сообщение отправлено в виджет");
    } else {
      toast("В браузере сервер виджета не запущен — работает в desktop-версии");
    }
  };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <Panel
          title="Стили оформления"
          desc="Пресет задаёт стиль текста, ника и иконки. Ссылка для OBS не меняется."
          right={<Palette size={14} style={{ color: "#a78bfa" }} />}
          collapsible
        >
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {WIDGET_STYLES.map((s) => {
              if (!s) return null;
              const on = cfg.style === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => set({ style: s.id, bgOpacity: s.bgOpacity, radius: s.radius })}
                  className="rounded-xl border p-2.5 text-left transition-all"
                  style={{
                    borderColor: on ? "#8b5cf6" : "var(--dw-line)",
                    background: on ? "#8b5cf612" : "transparent",
                  }}
                >
                  <span className="flex h-8 items-center justify-center gap-1 rounded-lg" style={{ background: s.swatch[0] }}>
                    {s.swatch.map((c, i) => (
                      <span key={i} className="h-3 w-3 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="mt-1.5 block text-[11.5px] font-semibold" style={{ color: on ? "#a78bfa" : "var(--dw-text)" }}>
                    {s.label}
                  </span>
                  <span className="block text-[9.5px] leading-tight" style={{ color: "var(--dw-dim)" }}>
                    {s.desc}
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
              <Label hint={`${cfg.fontSize}px`}>Размер шрифта</Label>
              <Slider value={cfg.fontSize} min={11} max={34} onChange={(v) => set({ fontSize: v })} format={(v) => `${v}px`} />
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
            <Toggle label="Рамка вокруг сообщений" on={cfg.border} onChange={(v) => set({ border: v })} />
            <Toggle label="Тень плашки" on={cfg.shadow} onChange={(v) => set({ shadow: v })} />
          </div>
        </Panel>

        <Panel title="Поведение" collapsible>
          <div className="space-y-3">
            <div>
              <Label hint={`${cfg.duration} с`}>Длительность показа</Label>
              <Slider value={cfg.duration} min={3} max={30} onChange={(v) => set({ duration: v })} format={(v) => `${v}с`} color="#22d3ee" />
            </div>
            <div>
              <Label hint={`${cfg.maxMessages}`}>Сообщений на экране</Label>
              <Slider value={cfg.maxMessages} min={2} max={14} onChange={(v) => set({ maxMessages: v })} format={(v) => `${v}`} />
            </div>
            <div>
              <Label>Направление ленты</Label>
              <Segmented
                value={cfg.dir}
                onChange={(v) => set({ dir: v })}
                options={[
                  { id: "up", label: "Снизу вверх" },
                  { id: "down", label: "Сверху вниз" },
                ]}
              />
            </div>
            <Toggle label="Значок площадки" on={cfg.showPlatform} onChange={(v) => set({ showPlatform: v })} />
            <Toggle label="Время сообщения" on={cfg.showTime} onChange={(v) => set({ showTime: v })} />
          </div>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        {/* Предпросмотр — всегда раскрыт */}
        <Panel
          title="Предпросмотр"
          desc="Точная копия того, что видно в OBS."
          right={
            <Btn variant="ghost" onClick={() => setRun((n) => n + 1)}>
              Повторить
            </Btn>
          }
        >
          <div className="checker relative overflow-hidden rounded-xl p-3" style={{ minHeight: 220 }}>
            <div
              className="absolute inset-x-3 flex flex-col gap-2"
              style={{ [cfg.dir === "up" ? "bottom" : "top"]: 12 } as React.CSSProperties}
            >
              {demo.map((m) => (
                <div
                  key={`${m.id}-${run}`}
                  className="relative overflow-hidden"
                  style={{
                    padding: "9px 12px",
                    borderRadius: cfg.radius,
                    border: `1px solid ${look.border}`,
                    boxShadow: look.shadow,
                    background: look.background,
                    backgroundImage: look.bgImage ? `url("${look.bgImage}")` : undefined,
                    backgroundSize: "cover",
                    fontFamily: look.fontFamily,
                    fontSize: cfg.fontSize,
                    fontWeight: look.fontWeight,
                    letterSpacing: look.letterSpacing,
                    color: look.text,
                    textShadow: look.textShadow,
                    lineHeight: 1.4,
                    overflowWrap: "anywhere",
                  }}
                >
                  <div className="flex items-start gap-2">
                    {cfg.showPlatform && (
                      <span
                        className="mt-[0.15em] grid shrink-0 place-items-center text-white"
                        style={{
                          width: "1.15em",
                          height: "1.15em",
                          fontSize: "0.8em",
                          fontWeight: 700,
                          background: m.platform === "twitch" ? "#a970ff" : "#ff4e45",
                          borderRadius: look.iconShape === "circle" ? "50%" : look.iconShape === "square" ? 2 : 5,
                          boxShadow: look.iconGlow ? "0 0 10px currentColor" : "none",
                        }}
                      >
                        <PlatformIcon id={m.platform} size={cfg.fontSize * 0.85} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
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
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Ссылка для OBS — всегда раскрыта */}
        <Panel
          title="Ссылка для OBS"
          desc="Статичная ссылка: при смене стиля её менять не нужно."
          right={
            <span
              className="flex items-center gap-1.5 font-mono text-[10px]"
              style={{ color: clients ? "#4ade80" : "var(--dw-dim)" }}
            >
              <Radio size={11} />
              {clients} OBS
            </span>
          }
        >
          <div
            className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}
          >
            <Link2 size={13} style={{ color: "var(--dw-dim)" }} className="shrink-0" />
            <code className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: "#a78bfa" }}>
              {url}
            </code>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Btn variant="primary" onClick={copy}>
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Скопировано" : "Копировать"}
            </Btn>
            <Btn variant="ghost" onClick={sendTest}>
              <Send size={12} /> Тест
            </Btn>
          </div>
          <p className="mt-2 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            OBS → Источники → + → Browser. Ширина 520, высота 600. Настройки применяются сразу,
            обновлять источник не нужно.
          </p>
        </Panel>
      </div>
    </div>
  );
}
