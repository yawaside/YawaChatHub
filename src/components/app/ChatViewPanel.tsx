import type { ChatViewConfig } from "../../lib/types";
import { FEED_STYLES, styleName } from "../../lib/presets";
import { effectName } from "../../lib/effects";
import { StyleGallery } from "./Presets";
import { CheckRow, Collapsible, EffectPicker, Slider, ToggleRow } from "./ui";

interface Props {
  view: ChatViewConfig;
  patch: (c: ChatViewConfig) => void;
  /* поведение ленты — раньше жило отдельной вкладкой */
  maxFeed?: number;
  onMaxFeed?: (v: number) => void;
  hideDeleted?: boolean;
  setHideDeleted?: (v: boolean) => void;
  mentionHL?: boolean;
  setMentionHL?: (v: boolean) => void;
}

/**
 * Оформление ленты: сначала галерея готовых стилей, всё остальное —
 * в свёрнутых блоках, чтобы экран не был перегружен.
 */
export default function ChatViewPanel(p: Props) {
  const { view, patch } = p;

  return (
    <div className="flex flex-col gap-2">
      <Collapsible title="Стиль оформления" hint={styleName(FEED_STYLES, view.styleId)} defaultOpen>
        <StyleGallery styles={FEED_STYLES} cfg={view} onApply={(s) => patch({ ...view, ...s })} />
      </Collapsible>

      <Collapsible title="Эффект появления" hint={effectName(view.effect)}>
        <EffectPicker
          effect={view.effect}
          speed={view.effectSpeed}
          onChange={(v) => patch({ ...view, ...v })}
        />
      </Collapsible>

      <Collapsible title="Размер и плотность" hint={`${view.fontSize}px · интервал ${view.spacing}px`}>
        <div className="flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Размер текста
            </label>
            <Slider value={view.fontSize} min={10} max={24} step={1} onChange={(v) => patch({ ...view, fontSize: v })} format={(v) => `${v}px`} />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Интервал между сообщениями
            </label>
            <Slider
              value={view.spacing}
              min={0}
              max={16}
              step={1}
              onChange={(v) => patch({ ...view, spacing: v })}
              format={(v) => (v === 0 ? "вплотную" : `${v}px`)}
            />
          </div>
        </div>
      </Collapsible>

      <Collapsible title="Содержимое строки" hint="время, значки ролей, площадка">
        <CheckRow label="Время сообщения" checked={view.showTime} onChange={(v) => patch({ ...view, showTime: v })} />
        <CheckRow label="Значки ролей (мод, саб, VIP)" checked={view.showBadges} onChange={(v) => patch({ ...view, showBadges: v })} />
        <CheckRow label="Иконка площадки" checked={view.showPlatform} onChange={(v) => patch({ ...view, showPlatform: v })} />
        <CheckRow label="Цветные ники" checked={view.accentNick} onChange={(v) => patch({ ...view, accentNick: v })} />
        <CheckRow label="Анимировать новые сообщения" checked={view.animations} onChange={(v) => patch({ ...view, animations: v })} />
        <div className="pt-1">
          <label className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--dw-dim)" }}>
            <span>Обводка текста (тонкий контур)</span>
            <span>{(view.outlineWidth ?? 0) === 0 ? "без обводки" : `${(view.outlineWidth ?? 0).toFixed(1)}px`}</span>
          </label>
          <Slider
            value={view.outlineWidth ?? 0}
            min={0}
            max={4}
            step={0.2}
            onChange={(v) => patch({ ...view, outlineWidth: v })}
            format={(v) => (v === 0 ? "без обводки" : `${v.toFixed(1)}px`)}
          />
        </div>
        <CheckRow
          label="Мягкая тень текста (читаемость на светлом фоне)"
          checked={view.textShadow ?? false}
          onChange={(v) => patch({ ...view, textShadow: v })}
        />
      </Collapsible>

      {p.onMaxFeed && (
        <Collapsible title="Поведение и история" hint={`история ${p.maxFeed} сообщений`}>
          <div className="flex flex-col gap-1">
            <div className="pb-1">
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Хранить сообщений в истории
              </label>
              <Slider value={Math.min(p.maxFeed ?? 300, 400)} min={50} max={400} step={50} onChange={p.onMaxFeed} format={(v) => `${v}`} />
            </div>
            <ToggleRow
              label="Подсвечивать упоминания"
              hint="строки с «@ник»"
              checked={p.mentionHL ?? true}
              onChange={(v) => p.setMentionHL?.(v)}
            />
            <ToggleRow
              label="Скрывать удалённые сообщения"
              checked={p.hideDeleted ?? false}
              onChange={(v) => p.setHideDeleted?.(v)}
            />
          </div>
        </Collapsible>
      )}
    </div>
  );
}
