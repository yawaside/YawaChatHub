import { Activity, Cpu, Gauge, Lock, MousePointerClick, Thermometer, Unlock, Video } from "lucide-react";
import { formatPercent, formatTemperature } from "../../lib/telemetry";
import type { TelemetryConfig, TelemetrySnapshot } from "../../lib/telemetry";
import { Btn, Label, Panel, Slider, Toggle } from "./ui";

function MetricPreview({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex min-w-[106px] items-center gap-2 rounded-lg border border-white/10 bg-black/45 px-2.5 py-2">
      <Icon size={15} style={{ color: accent }} />
      <div>
        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/45">{label}</div>
        <div className="font-mono text-[16px] font-bold leading-none tabular-nums text-white">{value}</div>
      </div>
    </div>
  );
}

export default function TelemetryPanel({
  cfg,
  stats,
  desktop,
  onChange,
}: {
  cfg: TelemetryConfig;
  stats: TelemetrySnapshot;
  desktop: boolean;
  onChange: (patch: Partial<TelemetryConfig>) => void;
}) {
  const hasCpu = cfg.showCpuLoad || cfg.showCpuTemp;
  const hasGpu = cfg.showGpuLoad || cfg.showGpuTemp;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <Panel
          title="Telemetry overlay"
          desc={desktop ? "Отдельное прозрачное окно поверх игры. Метрики обновляются раз в 2 секунды." : "В браузере показан интерактивный предпросмотр. Реальное окно доступно в desktop-сборке."}
          right={
            <Btn variant={cfg.enabled ? "primary" : "outline"} onClick={() => onChange({ enabled: !cfg.enabled })}>
              <Activity size={12} /> {cfg.enabled ? "Включён" : "Выключен"}
            </Btn>
          }
        >
          <Toggle
            label="Показывать телеметрию"
            hint="отдельное окно всегда поверх игры"
            on={cfg.enabled}
            onChange={(enabled) => onChange({ enabled })}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--dw-line)", background: "var(--dw-input)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold"><MousePointerClick size={13} /> Сквозные клики</span>
                <button
                  type="button"
                  onClick={() => onChange({ clickThrough: !cfg.clickThrough })}
                  className="rounded-lg border px-2 py-1 text-[10px] font-bold uppercase"
                  style={{ borderColor: "var(--dw-line)", background: cfg.clickThrough ? "#8b5cf6" : "transparent", color: cfg.clickThrough ? "#fff" : "var(--dw-text)" }}
                >
                  {cfg.clickThrough ? "вкл" : "выкл"}
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                {cfg.clickThrough ? "Игра получает клики мыши." : "Окно можно перетащить мышью."}
              </p>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--dw-line)", background: "var(--dw-input)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold">{cfg.locked ? <Lock size={13} /> : <Unlock size={13} />} Позиция</span>
                <button
                  type="button"
                  onClick={() => onChange({ locked: !cfg.locked })}
                  className="rounded-lg border px-2 py-1 text-[10px] font-bold uppercase"
                  style={{ borderColor: "var(--dw-line)", background: cfg.locked ? "#8b5cf6" : "transparent", color: cfg.locked ? "#fff" : "var(--dw-text)" }}
                >
                  {cfg.locked ? "фикс." : "своб."}
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Зафиксируйте после размещения окна.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Label hint={`${cfg.opacity}%`}>Непрозрачность подложки</Label>
            <Slider value={cfg.opacity} min={10} max={100} onChange={(opacity) => onChange({ opacity })} format={(v) => `${v}%`} color="#22d3ee" />
          </div>
          <div className="mt-3">
            <Label hint={`${cfg.fontSize}px`}>Размер показателей</Label>
            <Slider value={cfg.fontSize} min={11} max={24} onChange={(fontSize) => onChange({ fontSize })} format={(v) => `${v}px`} color="#22d3ee" />
          </div>
        </Panel>

        <Panel title="Параметры" desc="Каждый показатель включается независимо.">
          <div className="space-y-3">
            <Toggle label="Загрузка CPU" hint="процент использования процессора" on={cfg.showCpuLoad} onChange={(showCpuLoad) => onChange({ showCpuLoad })} />
            <Toggle label="Температура CPU" hint="датчик WMI; если BIOS не предоставляет значение — будет «—»" on={cfg.showCpuTemp} onChange={(showCpuTemp) => onChange({ showCpuTemp })} />
            <Toggle label="Загрузка GPU" hint="дискретная видеокарта; на ноутбуке встроенная Intel не используется" on={cfg.showGpuLoad} onChange={(showGpuLoad) => onChange({ showGpuLoad })} />
            <Toggle label="Температура GPU" hint="дискретная видеокарта; доступно через драйвер NVIDIA" on={cfg.showGpuTemp} onChange={(showGpuTemp) => onChange({ showGpuTemp })} />
          </div>
        </Panel>
      </div>

      <Panel title="Предпросмотр" desc="Так телеметрия выглядит поверх игры.">
        <div
          className="relative min-h-[245px] overflow-hidden rounded-2xl border p-4"
          style={{
            borderColor: "var(--dw-line)",
            background: "radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.18), transparent 50%), radial-gradient(ellipse at 75% 80%, rgba(139,92,246,0.14), transparent 52%), #080b12",
          }}
        >
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.16) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
          <div
            className="relative inline-flex max-w-full flex-wrap gap-2 rounded-xl border border-white/10 bg-[#090b12] p-2 shadow-2xl"
            style={{ opacity: cfg.opacity / 100, fontSize: cfg.fontSize }}
          >
            {cfg.showCpuLoad && <MetricPreview icon={Cpu} label="CPU" value={formatPercent(stats.cpu.usage)} accent="#60a5fa" />}
            {cfg.showCpuTemp && <MetricPreview icon={Thermometer} label="CPU °C" value={formatTemperature(stats.cpu.temperature)} accent="#f97316" />}
            {hasCpu && hasGpu && <span className="w-px self-stretch bg-white/10" />}
            {cfg.showGpuLoad && <MetricPreview icon={Gauge} label="GPU" value={formatPercent(stats.gpu.usage)} accent="#a78bfa" />}
            {cfg.showGpuTemp && <MetricPreview icon={Thermometer} label="GPU °C" value={formatTemperature(stats.gpu.temperature)} accent="#ef4444" />}
            {stats.gpu.name && <span className="self-center font-mono text-[9px] text-white/40"><Video className="mr-1 inline" size={10} />{stats.gpu.name}</span>}
            {!hasCpu && !hasGpu && <span className="px-2 py-1 font-mono text-[10px] text-white/45">Выберите показатели слева</span>}
          </div>
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: "var(--dw-dim)" }}>
          {desktop ? "CPU usage вычисляется локально. CPU temperature зависит от датчиков BIOS/WMI; GPU usage/temperature доступны для дискретной NVIDIA через установленный драйвер." : "В браузере используются демонстрационные данные; реальная телеметрия работает в desktop-сборке."}
        </p>
      </Panel>
    </div>
  );
}
