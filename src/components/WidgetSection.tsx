import { useState } from "react";
import { Check, Copy, Layers, Palette } from "lucide-react";
import { PlatformIcon, Reveal, Section } from "./bits";
import { getTheme, themeBg, WIDGET_THEMES } from "../lib/widget";
import { makeMessage } from "../lib/core";

const DEMO = [
  { platform: "twitch" as const, author: "neon_wolf", color: "#a78bfa", text: "ЛЕЕЕЕТС ГОООУ" },
  { platform: "youtube" as const, author: "mila_lav", color: "#f472b6", text: "привет из чата, как настроение?" },
  { platform: "vk" as const, author: "КиберДед", color: "#4ade80", text: "респект за упорство" },
];

export default function WidgetSection() {
  const [themeId, setThemeId] = useState("minimal-dark");
  const [opacity, setOpacity] = useState(70);
  const [copied, setCopied] = useState(false);
  const theme = getTheme(themeId);
  const url = "http://127.0.0.1:47823/widget?token=…";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* noop */ }
  };

  return (
    <Section
      id="widget"
      index="03"
      kicker="obs"
      title="Виджет для OBS — чат прямо в сцене"
      desc="Локальный сервер на 127.0.0.1 с доступом по токену. В OBS добавьте «Browser» и вставьте URL — задержка меньше секунды."
    >
      <div className="mt-14 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
                <Palette size={12} /> Тема виджета
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {WIDGET_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    className="rounded-xl border p-2 text-left transition-all"
                    style={{
                      borderColor: themeId === t.id ? "#8b5cf6" : "rgba(255,255,255,0.1)",
                      background: themeId === t.id ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <span className="flex gap-1">
                      {t.swatch.map((c, i) => (
                        <span key={i} className="h-3.5 flex-1 rounded" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="mt-1.5 block text-[10px] text-fog">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
                <span className="inline-flex items-center gap-2">
                  <Layers size={12} /> Прозрачность подложки
                </span>
                <span>{opacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                style={{ ["--p" as string]: `${opacity}%` }}
                className="mt-3"
              />
              <p className="mt-2 text-[11.5px] leading-snug text-fog">
                Прозрачность применяется только к подложке — текст остаётся полностью непрозрачным и читаемым.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-viol">{url}</code>
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-viol"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "ОК" : "Копировать"}
              </button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="checker relative overflow-hidden rounded-2xl p-6">
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/20">
                сцена OBS 1920×1080
              </span>
            </div>
            <div
              className="relative mx-auto w-full max-w-[420px] rounded-2xl p-4"
              style={{
                background: themeBg(theme, opacity),
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadow,
              }}
            >
              <div className="space-y-2.5">
                {DEMO.map((m, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center" style={{ color: m.color }}>
                      <PlatformIcon id={m.platform} size={14} />
                    </span>
                    <div className="min-w-0">
                      <span className="mr-1.5 text-[13.5px] font-bold" style={{ color: theme.name }}>
                        {m.author}
                      </span>
                      <span className="text-[13.5px]" style={{ color: theme.text }}>{m.text}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t pt-2" style={{ borderColor: theme.border }}>
                <span className="font-mono text-[9.5px]" style={{ color: theme.sub }}>
                  {makeMessage("twitch").author} только что написал
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
