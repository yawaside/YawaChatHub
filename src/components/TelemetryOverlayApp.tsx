import { useEffect, useMemo, useState } from "react";
import { Cpu, Gauge, Thermometer, Video } from "lucide-react";
import { getSp } from "../lib/bridge";
import {
  DEFAULT_TELEMETRY,
  EMPTY_TELEMETRY,
  formatPercent,
  formatTemperature,
} from "../lib/telemetry";
import type { TelemetryConfig, TelemetrySnapshot } from "../lib/telemetry";

function Metric({
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
    <div className="flex min-w-[118px] items-center gap-2 rounded-lg border border-white/10 bg-black/45 px-2.5 py-2 backdrop-blur-md">
      <Icon size={15} style={{ color: accent }} />
      <div className="min-w-0">
        <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/45">{label}</div>
        <div className="font-mono text-[16px] font-bold leading-none tabular-nums text-white">{value}</div>
      </div>
    </div>
  );
}

function simulatedSnapshot(tick: number): TelemetrySnapshot {
  const wave = (base: number, amp: number, phase: number) => Math.round(base + Math.sin(tick / 2 + phase) * amp);
  return {
    updatedAt: Date.now(),
    cpu: { usage: wave(34, 12, 0), temperature: wave(61, 4, 1) },
    gpu: { name: "NVIDIA GeForce RTX", usage: wave(67, 16, 2), temperature: wave(69, 5, 3), discrete: true },
  };
}

export default function TelemetryOverlayApp() {
  const sp = getSp();
  const [cfg, setCfg] = useState<TelemetryConfig>(DEFAULT_TELEMETRY);
  const [stats, setStats] = useState<TelemetrySnapshot>(EMPTY_TELEMETRY);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    document.documentElement.classList.add("telemetry-mode");
    return () => document.documentElement.classList.remove("telemetry-mode");
  }, []);

  useEffect(() => {
    if (!sp?.telemetry) {
      setStats(simulatedSnapshot(0));
      const iv = window.setInterval(() => {
        setTick((next) => {
          setStats(simulatedSnapshot(next + 1));
          return next + 1;
        });
      }, 2000);
      return () => window.clearInterval(iv);
    }

    sp.telemetry.config().then((next) => next && setCfg({ ...DEFAULT_TELEMETRY, ...next }));
    sp.telemetry.get().then((next) => next && setStats(next));
    sp.telemetry.onChange((next) => setCfg((current) => ({ ...current, ...next })));
    sp.telemetry.onStats((next) => setStats(next));
  }, [sp]);

  const draggable = !cfg.clickThrough && !cfg.locked;
  const dragStyle = { WebkitAppRegion: draggable ? "drag" : "no-drag" } as React.CSSProperties;
  const hasCpu = cfg.showCpuLoad || cfg.showCpuTemp;
  const hasGpu = cfg.showGpuLoad || cfg.showGpuTemp;
  const opacity = Math.max(0, Math.min(100, cfg.opacity)) / 100;

  const metrics = useMemo(() => ({
    cpuLoad: formatPercent(stats.cpu.usage),
    cpuTemp: formatTemperature(stats.cpu.temperature),
    gpuLoad: formatPercent(stats.gpu.usage),
    gpuTemp: formatTemperature(stats.gpu.temperature),
  }), [stats]);

  return (
    <div
      className="flex h-screen w-screen items-start overflow-hidden p-3"
      style={{ pointerEvents: cfg.clickThrough ? "none" : "auto", ...dragStyle }}
    >
      <div
        className="flex max-w-full flex-wrap gap-2 rounded-xl border border-white/10 bg-[#090b12] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
        style={{ opacity, ...dragStyle }}
      >
        {hasCpu && (
          <div className="flex flex-wrap gap-2">
            {cfg.showCpuLoad && <Metric icon={Cpu} label="CPU" value={metrics.cpuLoad} accent="#60a5fa" />}
            {cfg.showCpuTemp && <Metric icon={Thermometer} label="CPU °C" value={metrics.cpuTemp} accent="#f97316" />}
          </div>
        )}
        {hasCpu && hasGpu && <span className="mx-0.5 hidden w-px self-stretch bg-white/10 sm:block" />}
        {hasGpu && (
          <div className="flex flex-wrap gap-2">
            {cfg.showGpuLoad && <Metric icon={Gauge} label="GPU" value={metrics.gpuLoad} accent="#a78bfa" />}
            {cfg.showGpuTemp && <Metric icon={Thermometer} label="GPU °C" value={metrics.gpuTemp} accent="#ef4444" />}
            {stats.gpu.name && (
              <span className="hidden max-w-[160px] self-center truncate px-1 font-mono text-[8px] text-white/35 lg:inline" title={stats.gpu.name}>
                <Video className="mr-1 inline" size={9} />{stats.gpu.name}
              </span>
            )}
          </div>
        )}
        {!hasCpu && !hasGpu && (
          <span className="px-2 py-1 font-mono text-[10px] text-white/45">Включите хотя бы один параметр в настройках телеметрии</span>
        )}
      </div>
    </div>
  );
}
