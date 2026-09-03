import { useMemo } from "react";
import { Ban, Eye, ListX, Mic, Pause, Play, SkipForward, Volume2 } from "lucide-react";
import type { SpeechEngine } from "../../lib/core";
import type { TtsConfig } from "../../lib/tts-config";
import { isDesktop } from "../../lib/bridge";
import { Eq } from "../bits";
import { Btn, Label, Panel, Slider, Toggle } from "./ui";

/** Панель обычной SAPI5/Web Speech озвучки. */
export default function VoicePanel({ speech, cfg, onChange, toast }: {
  speech: SpeechEngine;
  cfg: TtsConfig;
  onChange: (patch: Partial<TtsConfig>) => void;
  toast: (t: string) => void;
}) {
  const desktop = isDesktop();
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
                {sortedVoices.length === 0 && <option>—</option>}
              </select>
              <Btn variant="ghost" onClick={listen} disabled={!cfg.voiceURI} title="Прослушать выбранный голос"><Play size={12} /></Btn>
            </div>
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
              return <button key={label} type="button" onClick={() => onChange({ template: preset })} className="rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-all" style={{ borderColor: on ? "#8b5cf6" : "var(--dw-line)", background: on ? "#8b5cf61f" : "transparent", color: on ? "#a78bfa" : "var(--dw-dim)" }}>{label}</button>;
            })}
          </div>
          <div className="mt-3"><Label hint={t.author && t.platform ? "neon_wolf с Твича говорит: привет!" : t.author ? "neon_wolf говорит: привет!" : "привет!"}>Пример</Label><div className="mt-1 rounded-lg border border-dashed p-2.5 text-[11.5px] leading-snug" style={{ borderColor: "var(--dw-line)", color: "var(--dw-text)" }}>{previewText}</div></div>
        </Panel>

        <Panel title="Базовые правила" desc="Быстрые переключатели обработки текста до озвучки." collapsible defaultOpen>
          <div className="space-y-3">
            <Toggle label="Ссылки → слово «ссылка»" hint="адрес не диктуется по буквам" on={f.links} onChange={(v) => onChange({ filters: { ...f, links: v } })} />
            <Toggle label="Игнорировать команды" hint="сообщения, начинающиеся с ! или /" on={f.commands} onChange={(v) => onChange({ filters: { ...f, commands: v } })} />
            <Toggle
              label="Вырезать эмодзи и смайлы"
              hint="смайлы, :коды: и [emote:] не озвучиваются — включено по умолчанию"
              on={f.emoji}
              onChange={(v) => onChange({ filters: { ...f, emoji: v, emojiTouched: true } })}
            />
            <Toggle label="Анти-повтор" hint="то же сообщение того же автора за 45 секунд не повторяется" on={f.dedupe} onChange={(v) => onChange({ filters: { ...f, dedupe: v } })} />
          </div>
        </Panel>

        <Panel title="Фильтры озвучки" desc="Исключает сообщения по правилам — например, если есть мат, скам-ссылки, 18+ или стоп-слова." collapsible>
          <div className="space-y-3">
            <div>
              <Label hint={`${(f.banWords || []).length} шт.`}>Запрещённые слова</Label>
              <textarea
                value={(f.banWords || []).join(", ")}
                onChange={(e) => onChange({
                  filters: {
                    ...f,
                    banWords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })}
                placeholder="через запятую: слово1, слово2, слово3"
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border bg-transparent px-2.5 py-2 text-[11.5px] outline-none placeholder:text-[var(--dw-dim)] focus:border-viol"
                style={{ borderColor: "var(--dw-line)", color: "var(--dw-text)" }}
              />
              <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Сообщения с этими словами пропускаются при озвучке.
              </p>
            </div>

            <div>
              <Label hint={`${(f.maskWords || []).length} шт.`}>Маскируемые слова</Label>
              <textarea
                value={(f.maskWords || []).join(", ")}
                onChange={(e) => onChange({
                  filters: {
                    ...f,
                    maskWords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })}
                placeholder="через запятую: слово1, слово2, слово3"
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border bg-transparent px-2.5 py-2 text-[11.5px] outline-none placeholder:text-[var(--dw-dim)] focus:border-viol"
                style={{ borderColor: "var(--dw-line)", color: "var(--dw-text)" }}
              />
              <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Эти слова заменяются на «***» при озвучке.
              </p>
            </div>

            <div>
              <Label hint={`${(f.banAuthors || []).length} шт.`}>Игнорировать авторов</Label>
              <textarea
                value={(f.banAuthors || []).join(", ")}
                onChange={(e) => onChange({
                  filters: {
                    ...f,
                    banAuthors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })}
                placeholder="через запятую: nick1, nick2, nick3"
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border bg-transparent px-2.5 py-2 text-[11.5px] outline-none placeholder:text-[var(--dw-dim)] focus:border-viol"
                style={{ borderColor: "var(--dw-line)", color: "var(--dw-text)" }}
              />
            </div>

            <div>
              <Label hint={`${(f.allowAuthors || []).length} шт.`}>Только эти авторы</Label>
              <textarea
                value={(f.allowAuthors || []).join(", ")}
                onChange={(e) => onChange({
                  filters: {
                    ...f,
                    allowAuthors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })}
                placeholder="через запятую: nick1, nick2, nick3"
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border bg-transparent px-2.5 py-2 text-[11.5px] outline-none placeholder:text-[var(--dw-dim)] focus:border-viol"
                style={{ borderColor: "var(--dw-line)", color: "var(--dw-text)" }}
              />
              <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Если заполнено — озвучиваются только сообщения от этих авторов.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Предпросмотр" desc="Так будет выглядеть сообщение в озвучке." collapsible defaultOpen>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: "var(--dw-dim)" }}><Eye size={10} /> так прозвучит сообщение</div>
          <div className="rounded-xl border border-dashed p-3 text-[12px] leading-snug" style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}>{previewText}</div>
          <Btn variant="ghost" className="mt-2.5 w-full" disabled={!cfg.voiceURI} onClick={listen}><Play size={11} /> Прослушать пример</Btn>
        </Panel>
      </div>
    </div>
  );
}
