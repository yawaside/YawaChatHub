import { useEffect, useState } from "react";
import {
  AlignLeft, Blend, Crosshair, Eye, Gamepad2, LayoutPanelTop, Lock, MousePointerClick,
  Move, Power, Timer, Unlock,
} from "lucide-react";
import type { OverlayConfig } from "../../lib/types";
import { isDesktop, openExternal, overlayBridge } from "../../lib/bridge";

import { OVERLAY_PRESETS } from "../../lib/presets";
import { PresetGrid } from "./Presets";
import { Box, CheckRow, Chip, EffectPicker, Slider, SpacingSlider, ToggleRow } from "./ui";

interface Props {
  cfg: OverlayConfig;
  patch: (c: OverlayConfig) => void;
  toast: (t: string) => void;
  hotkey?: string;
}

export default function OverlayPanel({ cfg, patch, toast, hotkey }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDesktop()) void overlayBridge.isVisible().then(setVisible);
  }, []);

  const apply = (c: OverlayConfig) => {
    patch(c);
    overlayBridge.set(c);
  };

  const toggleOverlay = async () => {
    if (isDesktop()) {
      const v = await overlayBridge.toggle();
      setVisible(v);
      toast(v ? "Оверлей показан поверх игры" : "Оверлей скрыт");
    } else {
      openExternal(`${location.origin}${location.pathname}#/overlay`);
      toast("Оверлей открыт в новой вкладке (предпросмотр)");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-2">
      {/* ---------- состояние и активация ---------- */}
      <Box
        title="Оверлей поверх игры"
        icon={<Gamepad2 size={14} style={{ color: "var(--dw-dim)" }} />}
        className="xl:col-span-2"
        defaultOpen={false}
        hint={visible ? "показан" : "скрыт"}
        actions={
          <button
            onClick={toggleOverlay}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-white transition-all hover:brightness-110"
            style={{ background: visible ? "#ef4444" : "var(--dw-accent)" }}
          >
            <Power size={12} /> {visible ? "Скрыть" : "Показать"}
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleOverlay}
            className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-bold text-white transition-all hover:brightness-110"
            style={{ background: visible ? "#ef4444" : "var(--dw-accent)" }}
          >
            <Power size={14} /> {visible ? "Скрыть оверлей" : "Показать оверлей"}
          </button>
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px]"
            style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
          >
            Горячая клавиша:
            <b className="font-mono" style={{ color: "var(--dw-accent-2)" }}>
              {hotkey || "не назначена"}
            </b>
            <span className="opacity-70">— работает и поверх игры</span>
          </span>
          <ToggleRow
            label=""
            checked={cfg.enabled}
            onChange={(v) => {
              apply({ ...cfg, enabled: v });
              if (!v && isDesktop()) {
                overlayBridge.close();
                setVisible(false);
              }
            }}
          />
          <span className="-ml-1 text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
            автозапуск вместе с приложением
          </span>
        </div>
      </Box>

      {/* ---------- готовые варианты оформления ---------- */}
      <Box title="Стиль оформления" icon={<Blend size={14} style={{ color: "var(--dw-dim)" }} />} className="xl:col-span-2">
        <PresetGrid presets={OVERLAY_PRESETS} cfg={cfg} onApply={(p) => apply({ ...cfg, ...p })} />
      </Box>

      {/* ---------- подложка и читаемость ---------- */}
      <Box title="Фон и читаемость" icon={<Blend size={14} style={{ color: "var(--dw-dim)" }} />}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--dw-dim)" }}>
              <span>Прозрачность подложки</span>
              <span>{cfg.backdropOpacity === 0 ? "полностью прозрачная" : "текст не затрагивается"}</span>
            </label>
            <Slider
              value={cfg.backdropOpacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => apply({ ...cfg, backdropOpacity: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Прозрачность текста (отдельно)
            </label>
            <Slider
              value={cfg.textOpacity}
              min={0.3}
              max={1}
              step={0.01}
              onChange={(v) => apply({ ...cfg, textOpacity: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Скругление подложки
            </label>
            <Slider value={cfg.radius} min={0} max={20} step={1} onChange={(v) => apply({ ...cfg, radius: v })} format={(v) => `${v}px`} />
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
              onChange={(v) => apply({ ...cfg, outlineWidth: v })}
              format={(v) => (v === 0 ? "без обводки" : `${v.toFixed(1)}px`)}
            />
          </div>
          <CheckRow
            label="Тень текста (мягкое свечение для читаемости)"
            checked={cfg.textShadow ?? cfg.shadowText ?? true}
            onChange={(v) => apply({ ...cfg, textShadow: v, shadowText: v })}
          />
          <CheckRow label="Цветная полоса площадки слева" checked={cfg.accentBar} onChange={(v) => apply({ ...cfg, accentBar: v })} />
          {/* предпросмотр — в правой колонке настроек, здесь не дублируем */}
        </div>
      </Box>

      {/* ---------- эффект появления ---------- */}
      <Box title="Эффект появления" icon={<Blend size={14} style={{ color: "var(--dw-dim)" }} />}>
        <EffectPicker effect={cfg.effect} speed={cfg.effectSpeed} onChange={(v) => apply({ ...cfg, ...v })} />
      </Box>

      {/* ---------- размещение ---------- */}
      {/* установка позиции и размера — интерактивно прямо на оверлее */}
      <Box title="Положение окна" icon={<Move size={14} style={{ color: "var(--dw-dim)" }} />} hint="меняется перетаскиванием">
        <ToggleRow
          label="Свободное перемещение"
          hint="между шапкой и центром экрана; зафиксировать — без рамки"
          checked={cfg.freePosition}
          onChange={(v) => {
            apply({ ...cfg, freePosition: v, corner: v ? "free" : "top-left", locked: false });
            toast(v ? "Тяните оверлей мышью; края меняют размер" : "Оверлей привязан к углу экрана");
          }}
        />
        <ToggleRow
          label="Сквозной клик"
          hint="нажатие мыши проходит сквозь оверлей в игру"
          checked={cfg.clickThrough}
          onChange={(v) => apply({ ...cfg, clickThrough: v })}
        />
      </Box>

      {/* ---------- панель площадок ---------- */}
      <Box title="Панель площадок" icon={<LayoutPanelTop size={14} style={{ color: "var(--dw-dim)" }} />}>
        <div className="flex flex-col gap-1">
          <ToggleRow label="Показывать панель" hint="донаты и статусы подключённых площадок" checked={cfg.showStats} onChange={(v) => apply({ ...cfg, showStats: v })} />

          <div className="flex items-center gap-1.5 py-1.5">
            <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>Расположение:</span>
            <Chip active={cfg.statsPos === "bottom"} onClick={() => apply({ ...cfg, statsPos: "bottom" })}>снизу ↓</Chip>
            <Chip active={cfg.statsPos === "top"} onClick={() => apply({ ...cfg, statsPos: "top" })}>сверху ↑</Chip>
          </div>

          <ToggleRow
            label="Сумма донатов первым элементом"
            hint="оригинальная иконка DonationAlerts, сумма за сессию"
            checked={cfg.showDonations}
            onChange={(v) => apply({ ...cfg, showDonations: v })}
          />
          <ToggleRow
            label="Скрывать неподключённые площадки"
            hint="в панели остаются только реально подключённые каналы"
            checked={cfg.hideDisconnected}
            onChange={(v) => apply({ ...cfg, hideDisconnected: v })}
          />
          <ToggleRow label="Счётчик зрителей у площадок" checked={cfg.showViewers} onChange={(v) => apply({ ...cfg, showViewers: v })} />
          <ToggleRow label="Компактный вид панели" hint="без числа донатов, только сумма" checked={cfg.statsCompact} onChange={(v) => apply({ ...cfg, statsCompact: v })} />
          <p className="pt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            У каждой подключённой площадки показываются иконка и индикатор эфира: зелёная точка — в эфире,
            приглушённая — офлайн. Данные обновляются из коннекторов в реальном времени.
          </p>
        </div>
      </Box>

      {/* ---------- содержимое строки ---------- */}
      <Box title="Содержимое строки" icon={<AlignLeft size={14} style={{ color: "var(--dw-dim)" }} />}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>Размер текста</label>
            <Slider value={cfg.fontSize} min={10} max={30} step={1} onChange={(v) => apply({ ...cfg, fontSize: v })} format={(v) => `${v}px`} />
          </div>
          <SpacingSlider value={cfg.spacing} onChange={(v) => apply({ ...cfg, spacing: v })} />
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>Сообщений видно</label>
            <Slider value={cfg.maxMessages} min={1} max={20} step={1} onChange={(v) => apply({ ...cfg, maxMessages: v })} format={(v) => `${v}`} />
          </div>
          <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
            <CheckRow label="Иконка площадки" checked={cfg.showPlatform} onChange={(v) => apply({ ...cfg, showPlatform: v })} />
            <CheckRow label="Время сообщения" checked={cfg.showTime} onChange={(v) => apply({ ...cfg, showTime: v })} />
            <CheckRow label="Значки (мод, саб, vip)" checked={cfg.showBadges} onChange={(v) => apply({ ...cfg, showBadges: v })} />
            <CheckRow label="Стикеры и эмоуты" checked={cfg.showEmotes} onChange={(v) => apply({ ...cfg, showEmotes: v })} />
          </div>
          <ToggleRow
            label="Только события"
            hint="донаты, сабы, рейды — без обычного чата"
            checked={cfg.eventsOnly}
            onChange={(v) => apply({ ...cfg, eventsOnly: v })}
          />
        </div>
      </Box>

      {/* ---------- авто-скрытие ---------- */}
      <Box title="Исчезновение сообщений" icon={<Timer size={14} style={{ color: "var(--dw-dim)" }} />}>
        <ToggleRow
          label="Скрывать старые сообщения"
          hint="строка исчезает через заданное время"
          checked={cfg.autoFade}
          onChange={(v) => apply({ ...cfg, autoFade: v })}
        />
        {cfg.autoFade && (
          <div className="pt-2">
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>Время жизни строки</label>
            <Slider value={cfg.fadeAfterSec} min={5} max={180} step={5} onChange={(v) => apply({ ...cfg, fadeAfterSec: v })} format={(v) => `${v} сек`} />
          </div>
        )}
        <div className="mt-3 flex items-start gap-2 rounded-lg p-2.5" style={{ background: "var(--dw-input)" }}>
          <MousePointerClick size={13} className="mt-0.5 shrink-0" style={{ color: "var(--dw-dim)" }} />
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            В WebView2-сборке оверлей — отдельное окно поверх всех окон. Все настройки применяются
            мгновенно, без перезапуска. Показ/скрытие — кнопкой выше или горячей клавишей.
          </p>
        </div>
      </Box>

    </div>
  );
}
