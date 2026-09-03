import { useMemo, useState } from "react";
import { Ban, Copy, ExternalLink, Eye, ListX, Mic, Pause, Play, SkipForward, Volume2 } from "lucide-react";
import type { SpeechEngine } from "../../lib/core";
import type { TtsConfig } from "../../lib/tts-config";
import { isDesktop } from "../../lib/bridge";
import { CHIBI_OPTIONS, ChibiSprite } from "../Chibi";
import { Eq } from "../bits";
import { Btn, Label, Panel, Slider, Toggle } from "./ui";

/** Панель обычной SAPI5/Web Speech озвучки после отката встроенных движков. */
export default function VoicePanel({ speech, cfg, onChange, toast, chibiUrl }: {
  speech: SpeechEngine;
  cfg: TtsConfig;
  onChange: (patch: Partial<TtsConfig>) => void;
  toast: (t: string) => void;
  /** отдельная ссылка Browser Source только для чиби-модельки */
  chibiUrl: string;
}) {
  const desktop = isDesktop();
  const [chibiPreviewTalk, setChibiPreviewTalk] = useState(false);
  const t = cfg.template;
  const f = cfg.filters;
  const sortedVoices = useMemo(
    () => [...speech.voices].sort((a, b) => {
      const ar = /^ru/i.test(a.lang || "") || /ru|рус|russian|ирина|павел|silero/i.test(a.name) ? 0 : 1;
      const br = /^ru/i.test(b.lang || "") || /ru|рус|russian|ирина|павел|silero/i.test(b.name) ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name, "ru");
    }),
    [speech.voices]
  );

  const previewText = (() => {
    const parts: string[] = [];
    if (t.author || t.platform) {
      let who = t.author ? "neon_wolf" : "Зритель";
      if (t.platform) who += " с Твича";
      parts.push(`${who} говорит`);
    }
    parts.push("привет из чата!");
    return parts.join(": ");
  })();

  const setEnabled = (enabled: boolean) => {
    onChange({ enabled });
    speech.setEnabled(enabled);
  };

  const listen = async () => {
    const result = await speech.preview(cfg.voiceURI, previewText);
    if (result?.ok) toast("Тестовая фраза");
    else toast(result?.error || "Не удалось запустить озвучку");
  };

  const copyChibiUrl = async () => {
    if (!chibiUrl) {
      toast("Ссылка чиби-виджета доступна в desktop-сборке");
      return;
    }
    try {
      await navigator.clipboard.writeText(chibiUrl);
      toast("Ссылка чиби-виджета скопирована");
    } catch {
      toast("Не удалось скопировать ссылку");
    }
  };

  const testChibiLipSync = () => {
    setChibiPreviewTalk(true);
    window.setTimeout(() => setChibiPreviewTalk(false), 1800);
    if (cfg.enabled) speech.test();
    toast(cfg.enabled ? "Тестовая фраза и липсинк" : "Тест липсинка без звука");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        desc={desktop ? "Системные русские голоса Windows (SAPI5). Интернет не требуется." : "Голоса браузера (Web Speech API)."}
        right={<Btn variant={cfg.enabled ? "primary" : "outline"} onClick={() => setEnabled(!cfg.enabled)}><Mic size={12} /> {cfg.enabled ? "Включена" : "Выключена"}</Btn>}
      >
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}>
          <div className="flex items-center gap-2.5">
            {speech.now ? <Eq /> : <Volume2 size={13} style={{ color: "var(--dw-dim)" }} />}
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--dw-dim)" }}>{speech.now ? "говорит" : "тишина"} · очередь {speech.queueSize}</span>
          </div>
          <div className="mt-1.5 min-h-[16px] truncate text-[11.5px]" style={{ color: speech.now ? "var(--dw-text)" : "var(--dw-dim)" }}>{speech.now ? speech.now.label : "—"}</div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Btn variant={speech.paused ? "primary" : "ghost"} disabled={!cfg.enabled} onClick={() => speech.setPaused(!speech.paused)}>{speech.paused ? <Play size={12} /> : <Pause size={12} />} {speech.paused ? "Продолжить" : "Пауза"}</Btn>
            <Btn variant="ghost" disabled={!cfg.enabled} onClick={speech.skip}><SkipForward size={12} /> Пропустить</Btn>
            <Btn variant="danger" disabled={!speech.queueSize} onClick={() => { speech.clearQueue(); toast("Очередь очищена"); }}><ListX size={12} /> Очередь</Btn>
            <Btn variant="primary" className="ml-auto" disabled={!cfg.enabled} onClick={() => { speech.test(); toast("Тестовая фраза"); }}><Play size={11} /> Тест</Btn>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <Toggle label="Озвучивать через виджет OBS" hint="WAV отправляется в Browser Source, чтобы OBS мог управлять аудио источника." on={cfg.obsTts} onChange={(v) => onChange({ obsTts: v })} />
          <div><Label hint={`×${cfg.rate.toFixed(1)}`}>Скорость речи</Label><Slider value={cfg.rate} min={0.5} max={2} step={0.1} onChange={(v) => onChange({ rate: v })} format={(v) => `×${v.toFixed(1)}`} /></div>
          <div><Label hint={`${Math.round(cfg.volume * 100)}%`}>Громкость</Label><Slider value={Math.round(cfg.volume * 100)} min={0} max={100} onChange={(v) => onChange({ volume: v / 100 })} format={(v) => `${v}%`} /></div>
          <div>
            <Label hint={`${sortedVoices.length} шт.`}>Голос</Label>
            <div className="flex gap-2">
              <select value={cfg.voiceURI} onChange={(e) => onChange({ voiceURI: e.target.value })} className="dw-select min-w-0 flex-1">
                {sortedVoices.length === 0 && <option value="">Голоса загружаются…</option>}
                {sortedVoices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang || "ru-RU"}</option>)}
              </select>
              <Btn variant="ghost" onClick={listen} disabled={!cfg.voiceURI} title="Прослушать выбранный голос"><Play size={12} /></Btn>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>Используются системные голоса Windows. Список обновляется из реестра.</p>
          </div>
        </div>
      </Panel>

      {/* ---------- чиби-моделька в OBS-виджете ---------- */}
      <Panel
        title="Отдельный чиби-виджет OBS"
        desc="Отдельный Browser Source только с 2D-моделькой: без чата и без дублирования звука. Рот двигается по TTS-событиям."
        right={
          <Btn variant={cfg.chibiEnabled ? "primary" : "outline"} onClick={() => onChange({ chibiEnabled: !cfg.chibiEnabled })}>
            {cfg.chibiEnabled ? "Включён" : "Выключен"}
          </Btn>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          {/* крупный живой предпросмотр */}
          <div
            className="flex flex-col items-center gap-2 rounded-2xl border p-4"
            style={{
              borderColor: "var(--dw-line)",
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.14), transparent 70%), var(--dw-bg)",
            }}
          >
            <ChibiSprite
              id={cfg.chibi}
              speaking={cfg.chibiEnabled && (chibiPreviewTalk || !!speech.now)}
              className="shrink-0"
              style={{ height: cfg.chibiSize, width: cfg.chibiSize * 0.75 }}
            />
            <span
              className="font-mono text-[9px] uppercase tracking-[0.14em]"
              style={{ color: (speech.now || chibiPreviewTalk) && cfg.chibiEnabled ? "#4ade80" : "var(--dw-dim)" }}
            >
              {cfg.chibiEnabled ? (speech.now || chibiPreviewTalk ? "говорит · липсинк" : "ждёт озвучку") : "выключена"}
            </span>
            <Btn
              variant="ghost"
              disabled={!cfg.chibiEnabled || cfg.chibi === "none"}
              onClick={testChibiLipSync}
            >
              <Play size={11} /> Проверить липсинк
            </Btn>
          </div>

          <div className="min-w-0 space-y-3">
            <Toggle
              label="Включить отдельный чиби-виджет"
              hint="создайте в OBS отдельный Browser Source по ссылке ниже"
              on={cfg.chibiEnabled}
              onChange={(v) => onChange({ chibiEnabled: v })}
            />

            <div>
              <Label>Ссылка OBS Browser Source</Label>
              <div className="flex min-w-0 gap-2">
                <input
                  readOnly
                  value={chibiUrl || "Доступно в desktop-сборке после запуска локального сервера"}
                  className="h-8 min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 font-mono text-[10.5px] outline-none"
                  style={{ borderColor: "var(--dw-line)", color: chibiUrl ? "var(--dw-text)" : "var(--dw-dim)" }}
                />
                <Btn variant="ghost" onClick={copyChibiUrl} title="Скопировать ссылку чиби-виджета">
                  <Copy size={12} />
                </Btn>
                {chibiUrl && (
                  <a href={chibiUrl} target="_blank" rel="noreferrer" title="Открыть чиби-виджет">
                    <Btn variant="ghost"><ExternalLink size={12} /></Btn>
                  </a>
                )}
              </div>
            </div>

            <div>
              <Label>Персонаж</Label>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                {CHIBI_OPTIONS.map((o) => {
                  const on = cfg.chibi === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onChange({ chibi: o.id })}
                      className="flex flex-col items-center gap-1 rounded-xl border p-2 transition-all"
                      style={{
                        borderColor: on ? "#8b5cf6" : "var(--dw-line)",
                        background: on ? "#8b5cf614" : "transparent",
                      }}
                    >
                      <span className="grid h-14 place-items-center">
                        {o.id === "none" ? (
                          <Ban size={18} style={{ color: "var(--dw-dim)" }} />
                        ) : (
                          <ChibiSprite id={o.id} speaking={false} style={{ height: 52, width: 39 }} />
                        )}
                      </span>
                      <span
                        className="text-center text-[10.5px] leading-tight"
                        style={{ color: on ? "#a78bfa" : "var(--dw-dim)" }}
                      >
                        {o.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {cfg.chibiEnabled && cfg.chibi !== "none" && (
              <div>
                <Label hint={`${cfg.chibiSize} px`}>Размер в виджете</Label>
                <Slider
                  value={cfg.chibiSize}
                  min={80}
                  max={320}
                  step={10}
                  onChange={(v) => onChange({ chibiSize: v })}
                  format={(v) => `${v}px`}
                />
              </div>
            )}

            <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
              Рот двигается только пока идёт озвучка сообщения. Настройка применяется в OBS мгновенно,
              ссылка Browser Source не меняется.
            </p>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Шаблон озвучки" desc="Собирается блоками — вручную писать шаблон не нужно." collapsible defaultOpen>
          <div className="flex flex-wrap gap-1.5">
            {([["author", "Автор"], ["platform", "Площадка"], ["text", "Сообщение"]] as const).map(([key, label]) => {
              const locked = key === "text";
              const on = t[key];
              return <button key={key} type="button" onClick={() => !locked && onChange({ template: { ...t, [key]: !on } })} className="rounded-lg border px-3 py-2 text-[12px] font-medium transition-all" style={{ borderColor: on ? "#8b5cf6" : "var(--dw-line)", background: on ? "#8b5cf61f" : "transparent", color: on ? "#a78bfa" : "var(--dw-dim)", opacity: locked ? 0.8 : 1 }}>{label}{locked && " *"}</button>;
            })}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {([[{ author: true, platform: false, text: true }, "Автор: текст"], [{ author: true, platform: true, text: true }, "Полный"], [{ author: false, platform: false, text: true }, "Только текст"]] as const).map(([preset, label]) => {
              const on = t.author === preset.author && t.platform === preset.platform;
              return <button key={label} type="button" onClick={() => onChange({ template: { ...preset } })} className="rounded-lg border py-1.5 text-[10.5px] transition-all" style={{ borderColor: on ? "#8b5cf6" : "var(--dw-line)", color: on ? "#a78bfa" : "var(--dw-dim)", background: on ? "#8b5cf614" : "transparent" }}>{label}</button>;
            })}
          </div>
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: "var(--dw-dim)" }}><Eye size={10} /> так прозвучит сообщение</div>
            <p className="font-mono text-[11px] leading-snug" style={{ color: "#22d3ee" }}>«{previewText}»</p>
            <Btn variant="ghost" className="mt-2.5 w-full" disabled={!cfg.voiceURI} onClick={listen}><Play size={11} /> Прослушать пример</Btn>
          </div>
        </Panel>

        <Panel title="Базовые правила" desc="Быстрые переключатели обработки текста." collapsible>
          <Toggle label="Ссылки → слово «ссылка»" hint="адрес не диктуется по буквам" on={f.links} onChange={(v) => onChange({ filters: { ...f, links: v } })} />
          <Toggle label="Игнорировать команды" hint="сообщения с ! или /" on={f.commands} onChange={(v) => onChange({ filters: { ...f, commands: v } })} />
          <Toggle label="Вырезать эмодзи" hint="смайлы не попадают в озвучку" on={f.emoji} onChange={(v) => onChange({ filters: { ...f, emoji: v } })} />
          <Toggle label="Анти-повтор" on={f.dedupe} onChange={(v) => onChange({ filters: { ...f, dedupe: v } })} />
        </Panel>

        <Panel title="Ограничения" collapsible>
          <div className="space-y-3">
            <div><Label hint={`${f.maxLen} симв.`}>Максимальная длина</Label><Slider value={f.maxLen} min={40} max={400} step={10} onChange={(v) => onChange({ filters: { ...f, maxLen: v } })} format={(v) => `${v}`} color="#22d3ee" /></div>
            <div><Label hint={`${f.minLen} симв.`}>Минимальная длина</Label><Slider value={f.minLen} min={1} max={20} onChange={(v) => onChange({ filters: { ...f, minLen: v } })} format={(v) => `${v}`} color="#22d3ee" /></div>
            <div><Label hint={`${f.perMin} / мин`}>Сообщений в минуту</Label><Slider value={f.perMin} min={2} max={60} onChange={(v) => onChange({ filters: { ...f, perMin: v } })} format={(v) => `${v}`} /></div>
            <div><Label hint={`${f.maxCapsRatio}%`}>Порог КАПСА</Label><Slider value={f.maxCapsRatio} min={0} max={100} onChange={(v) => onChange({ filters: { ...f, maxCapsRatio: v } })} format={(v) => `${v}%`} /></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}