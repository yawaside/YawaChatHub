export interface TelemetryConfig {
  enabled: boolean;
  clickThrough: boolean;
  locked: boolean;
  /** Загрузка процессора, % */
  showCpuLoad: boolean;
  /** Температура процессора */
  showCpuTemp: boolean;
  /** Загрузка дискретного GPU, % */
  showGpuLoad: boolean;
  /** Температура дискретного GPU */
  showGpuTemp: boolean;
  /** Непрозрачность подложки, 0..100 */
  opacity: number;
  /** Размер текста, px */
  fontSize: number;
}

export interface TelemetrySnapshot {
  updatedAt: number;
  cpu: {
    usage: number | null;
    temperature: number | null;
  };
  gpu: {
    name: string | null;
    usage: number | null;
    temperature: number | null;
    /** Показывается только выделенный GPU (на ноутбуке — только дискретный). */
    discrete: boolean;
  };
}

export const DEFAULT_TELEMETRY: TelemetryConfig = {
  enabled: false,
  clickThrough: true,
  locked: false,
  showCpuLoad: true,
  showCpuTemp: true,
  showGpuLoad: true,
  showGpuTemp: true,
  opacity: 76,
  fontSize: 14,
};

export const EMPTY_TELEMETRY: TelemetrySnapshot = {
  updatedAt: 0,
  cpu: { usage: null, temperature: null },
  gpu: { name: null, usage: null, temperature: null, discrete: false },
};

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.max(0, Math.round(value))}%`;
}

export function formatTemperature(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value)}°C`;
}
