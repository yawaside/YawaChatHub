import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { WidgetConfig } from "../../lib/types";
import { copyText, isDesktop, openExternal, widgetConfig, widgetInfo } from "../../lib/bridge";
import { WIDGET_STYLES, styleName } from "../../lib/presets";
import { effectName } from "../../lib/effects";
import { usePersisted } from "../../lib/persist";
import { StyleGallery } from "./Presets";
import { CheckRow, Chip, Collapsible, EffectPicker, Slider } from "./ui";

interface Props {
  cfg: WidgetConfig;
  patch: (c: WidgetConfig) => void;
  toast: (t: string) => void;
}

export default function WidgetPanel({ cfg, patch, toast }: Props) {
  const [copied, setCopied] = useState(false);
  const [port, setPort] = usePersisted("widgetPort", 8085);
  const [localOnly, setLocalOnly] = usePersisted("widgetLocalhost", true);
  const [info, setInfo] = useState({ url: "http://127.0.0.1:8085/widget", port: 8085, running: false });

  useEffect(() => {
    void widgetInfo().then(setInfo);
  }, []);

  // ССЫЛКА ПОСТОЯННАЯ: оформление уходит в OBS живым событием по SSE
  const url = info.url;

  useEffect(() => {
    widgetConfig(cfg);
  }, [cfg]);

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast("Ссылка на виджет скопирована");
    }
  };

  const rawOp = cfg.backdropOpacity ?? (cfg.transparent ? 0 : 0.7);
  const currentOpacity = rawOp > 1 ? rawOp / 100 : rawOp;

  return (
    <div className="flex flex-col gap-2">
      <Collapsible title="Стиль оформления" hint={styleName(WIDGET_STYLES, cfg.styleId)} defaultOpen>
        <StyleGallery styles={WIDGET_STYLES} cfg={cfg} onApply={(s) => patch({ ...cfg, ...s })} />
      </Collapsible>

      {/* ссылка для OBS — главное действие раздела */}
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
      >
        <div className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px]" style={{ color: "var(--dw-accent-2)" }}>
            {url}
          </span>
          <span className="block text-[10px]" style={{ color: "var(--dw-dim)" }}>
            постоянная ссылка — добавьте в OBS один раз, оформление меняется на лету
          </span>
        </div>
        <button onClick={copy} className="shrink-0 cursor-pointer" title="Скопировать" style={{ color: copied ? "#4ade80" : "var(--dw-dim)" }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button onClick={() => openExternal(url)} className="shrink-0 cursor-pointer" title="Открыть" style={{ color: "var(--dw-dim)" }}>
          <ExternalLink size={14} />
        </button>
      </div>

      <Collapsible
        title="Фон и подложка"
        hint={`${Math.round(currentOpacity * 100)}% прозрачность · скругление ${cfg.radius ?? 10}px`}
      >
        <div className="flex flex-col gap-2">
          <div>
            <label className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--dw-dim)" }}>
              <span>Прозрачность подложки сообщений</span>
              <span>{currentOpacity === 0 ? "полностью прозрачный фон" : `${Math.round(currentOpacity * 100)}%`}</span>
            </label>
            <Slider
              value={currentOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => patch({ ...cfg, transparent: v === 0, backdropOpacity: Number(v.toFixed(2)) })}
              format={(v) => (v === 0 ? "0% (полностью прозрачно)" : `${Math.round(v * 100)}%`)}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Скругление плашек сообщений
            </label>
            <Slider
              value={cfg.radius ?? 10}
              min={0}
              max={24}
              step={1}
              onChange={(v) => patch({ ...cfg, radius: v })}
              format={(v) => `${v}px`}
            />
          </div>

          <CheckRow
            label="Цветная полоса площадки слева"
            checked={cfg.stripe ?? false}
            onChange={(v) => patch({ ...cfg, stripe: v })}
          />

          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>Тема оформления:</span>
            <Chip active={cfg.theme === "dark"} onClick={() => patch({ ...cfg, theme: "dark" })}>тёмная</Chip>
            <Chip active={cfg.theme === "light"} onClick={() => patch({ ...cfg, theme: "light" })}>светлая</Chip>
          </div>
        </div>
      </Collapsible>

      <Collapsible title="Размер и плотность" hint={`${cfg.fontSize}px · интервал ${cfg.spacing}px`}>
        <div className="flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Размер текста
            </label>
            <Slider value={cfg.fontSize} min={11} max={34} step={1} onChange={(v) => patch({ ...cfg, fontSize: v })} format={(v) => `${v}px`} />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Сообщений на экране
            </label>
            <Slider value={cfg.max} min={2} max={20} step={1} onChange={(v) => patch({ ...cfg, max: v })} format={(v) => `${v}`} />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Интервал между сообщениями
            </label>
            <Slider value={cfg.spacing} min={0} max={16} step={1} onChange={(v) => patch({ ...cfg, spacing: v })} format={(v) => (v === 0 ? "вплотную" : `${v}px`)} />
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--dw-dim)" }}>
              <span>Обводка текста (тонкий контур)</span>
              <span>{(cfg.outlineWidth ?? 0.8) === 0 ? "без обводки" : `${(cfg.outlineWidth ?? 0.8).toFixed(1)}px`}</span>
            </label>
            <Slider
              value={cfg.outlineWidth ?? 0.8}
              min={0}
              max={4}
              step={0.2}
              onChange={(v) => patch({ ...cfg, outlineWidth: v, outlines: v > 0 })}
              format={(v) => (v === 0 ? "без обводки" : `${v.toFixed(1)}px`)}
            />
          </div>
          <CheckRow
            label="Мягкая тень текста (читаемость поверх игры)"
            checked={cfg.textShadow ?? cfg.outlines ?? true}
            onChange={(v) => patch({ ...cfg, textShadow: v })}
          />
        </div>
      </Collapsible>

      <Collapsible title="Исчезновение сообщений" hint={cfg.autoFade ? `через ${cfg.fadeAfterSec ?? 30} сек` : "выключено"}>
        <div className="flex flex-col gap-2">
          <CheckRow
            label="Скрывать старые сообщения"
            checked={cfg.autoFade ?? false}
            onChange={(v) => patch({ ...cfg, autoFade: v })}
          />
          {cfg.autoFade && (
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Время жизни сообщения
              </label>
              <Slider
                value={cfg.fadeAfterSec ?? 30}
                min={5}
                max={180}
                step={5}
                onChange={(v) => patch({ ...cfg, fadeAfterSec: v })}
                format={(v) => `${v} сек`}
              />
            </div>
          )}
        </div>
      </Collapsible>

      <Collapsible
        title="Звук в OBS"
        hint={cfg.sound ? `вкл · ${Math.round((cfg.soundVolume ?? 0.5) * 100)}%` : "выключен"}
      >
        <div className="flex flex-col gap-2">
          <CheckRow
            label="Звук новых сообщений"
            checked={cfg.sound ?? false}
            onChange={(v) => patch({ ...cfg, sound: v })}
          />
          {cfg.sound && (
            <>
              <CheckRow
                label="Только донаты и события"
                checked={cfg.soundEventsOnly ?? true}
                onChange={(v) => patch({ ...cfg, soundEventsOnly: v })}
              />
              <div>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Громкость
                </label>
                <Slider
                  value={cfg.soundVolume ?? 0.5}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => patch({ ...cfg, soundVolume: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
              <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                В свойствах Browser Source включите «Управлять аудио через OBS» —
                звук попадёт в микшер и останется слышен на компьютере.
              </p>
            </>
          )}
        </div>
      </Collapsible>

      <Collapsible title="Эффект появления" hint={effectName(cfg.effect)}>
        <EffectPicker
          effect={cfg.effect}
          speed={cfg.effectSpeed}
          onChange={(v) => patch({ ...cfg, ...v })}
        />
      </Collapsible>

      <Collapsible title="Подключение к OBS" hint={`порт ${port}`}>
        <div className="flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Порт для OBS Browser Source
            </label>
            <input
              type="number"
              value={port}
              min={1024}
              max={65535}
              onChange={(e) => setPort(Math.max(1024, Math.min(65535, Number(e.target.value))))}
              className="w-28 rounded-lg border border-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
              style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
            />
            <p className="pt-1 text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
              применится после перезапуска приложения
            </p>
          </div>
          <CheckRow label="Принимать только локальные подключения" checked={localOnly} onChange={setLocalOnly} />
          {!isDesktop() && (
            <p className="text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
              Сервер работает внутри приложения — в браузере это предпросмотр.
            </p>
          )}
        </div>
      </Collapsible>
    </div>
  );
}
