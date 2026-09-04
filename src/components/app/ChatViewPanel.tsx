import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Eye, Play, Sparkles } from "lucide-react";
import { makeMessage } from "../../lib/core";
import { getMessageMotion } from "../../lib/message-motion";
import type { ChatViewConfig, MessageEffect } from "../../lib/widget";
import { PlatformChip } from "../bits";
import { Btn, Label, Panel, Segmented, Slider, Toggle } from "./ui";

const EFFECTS: Array<{ id: MessageEffect; label: string; desc: string }> = [
  { id: "none", label: "Без эффекта", desc: "Мгновенно" },
  { id: "fade", label: "Проявление", desc: "Мягкая прозрачность" },
  { id: "slide-up", label: "Снизу", desc: "Подъём строки" },
  { id: "slide-left", label: "Справа", desc: "Сдвиг в ленту" },
  { id: "scale", label: "Масштаб", desc: "Плавное увеличение" },
  { id: "pop", label: "Pop", desc: "Быстрый акцент" },
  { id: "bounce", label: "Пружина", desc: "Лёгкий отскок" },
];

export default function ChatViewPanel({ cfg, onChange }: {
  cfg: ChatViewConfig;
  onChange: (c: ChatViewConfig) => void;
}) {
  const [previewRun, setPreviewRun] = useState(0);
  const set = (patch: Partial<ChatViewConfig>) => {
    onChange({ ...cfg, ...patch });
    setPreviewRun((n) => n + 1);
  };
  const demo = useMemo(
    () => [
      { ...makeMessage("twitch"), author: "neon_wolf", text: "Красиво! Вот это момент", color: "#a78bfa" },
      { ...makeMessage("kick"), author: "wisp_gg", text: "Чат теперь выглядит живее", color: "#69db7c" },
    ],
    []
  );

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
      <Panel title="Внешний вид ленты" desc="Настройка строк сообщений на главной странице." collapsible>
        <div className="space-y-3">
          <div>
            <Label hint={`${cfg.fontSize}px`}>Размер текста</Label>
            <Slider value={cfg.fontSize} min={12} max={19} onChange={(v) => set({ fontSize: v })} format={(v) => `${v}px`} />
          </div>
          <div>
            <Label hint={`${cfg.rowGap}px`}>Интервал между сообщениями</Label>
            <Slider value={cfg.rowGap} min={0} max={14} onChange={(v) => set({ rowGap: v })} format={(v) => (v === 0 ? "вплотную" : `${v}px`)} color="#22d3ee" />
          </div>
          <div>
            <Label hint={`${cfg.radius}px`}>Скругление строк</Label>
            <Slider value={cfg.radius} min={0} max={18} onChange={(v) => set({ radius: v })} format={(v) => `${v}px`} />
          </div>
          <div>
            <Label>Стиль строк</Label>
            <Segmented
              value={cfg.style}
              onChange={(v) => set({ style: v })}
              options={[
                { id: "classic", label: "Classic" },
                { id: "minimal", label: "Minimal" },
                { id: "glass", label: "Glass" },
                { id: "flat", label: "Flat" },
              ]}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Появление сообщений"
        desc="Эффект срабатывает только у новых сообщений и не мешает прокрутке."
        right={<Sparkles size={14} style={{ color: "#a78bfa" }} />}
        collapsible
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {EFFECTS.map((effect) => {
            const active = cfg.messageEffect === effect.id;
            return (
              <button
                key={effect.id}
                type="button"
                onClick={() => set({ messageEffect: effect.id })}
                className="rounded-xl border px-3 py-2.5 text-left transition-all"
                style={{
                  borderColor: active ? "#8b5cf6" : "var(--dw-line)",
                  background: active ? "#8b5cf615" : "var(--dw-input)",
                  color: active ? "#c4b5fd" : "var(--dw-text)",
                }}
              >
                <span className="block text-[12px] font-semibold">{effect.label}</span>
                <span className="mt-0.5 block text-[10px]" style={{ color: "var(--dw-dim)" }}>{effect.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <Label hint={`${cfg.effectDuration.toFixed(2)} с`}>Скорость эффекта</Label>
          <Slider
            value={cfg.effectDuration}
            min={0.12}
            max={0.9}
            step={0.02}
            onChange={(v) => set({ effectDuration: v })}
            format={(v) => `${v.toFixed(2)}с`}
            color="#22d3ee"
          />
        </div>
      </Panel>

      <Panel title="Элементы строки" collapsible>
        <Toggle label="Показывать площадку" on={cfg.showPlatform} onChange={(v) => set({ showPlatform: v })} />
        <Toggle label="Показывать время" on={cfg.showTime} onChange={(v) => set({ showTime: v })} />
        <Toggle label="Показывать бейджи" on={cfg.showBadges} onChange={(v) => set({ showBadges: v })} />
      </Panel>
      </div>

      <Panel
        title="Предпросмотр"
        right={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px]" style={{ color: "var(--dw-dim)" }}>
              <Eye size={11} /> live
            </span>
            <Btn variant="ghost" onClick={() => setPreviewRun((n) => n + 1)}>
              <Play size={11} /> Повторить
            </Btn>
          </div>
        }
      >
        <div className="space-y-2 overflow-hidden rounded-xl border p-3" style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}>
          {demo.map((m, index) => (
            <motion.div
              key={`${m.id}-${previewRun}`}
              {...getMessageMotion(cfg.messageEffect, cfg.effectDuration, index * 0.08)}
              className="flex items-start gap-3 px-2 py-2"
              style={{
                borderRadius: cfg.radius,
                marginBottom: cfg.rowGap,
                background:
                  cfg.style === "glass"
                    ? "rgba(255,255,255,0.04)"
                    : cfg.style === "flat"
                    ? "rgba(255,255,255,0.02)"
                    : cfg.style === "classic"
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                border: cfg.style === "classic" ? "1px solid var(--dw-line)" : "1px solid transparent",
              }}
            >
              {cfg.showTime && <span className="mt-1 shrink-0 font-mono text-[11px]" style={{ color: "var(--dw-dim)" }}>23:10</span>}
              {cfg.showPlatform && <span className="shrink-0"><PlatformChip id={m.platform} /></span>}
              <div className="min-w-0">
                <span className="font-bold" style={{ color: m.color, fontSize: cfg.fontSize }}>{m.author}<span style={{ opacity: 0.55 }}>: </span></span>
                <span className="break-words" style={{ fontSize: cfg.fontSize, color: "var(--dw-text)" }}>{m.text}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </Panel>
    </div>
  );
}