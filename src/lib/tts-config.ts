import { DEFAULT_FILTERS } from "./core";
import type { TTSTemplate, TTSFilters } from "./core";

/** Настройки озвучки. Хранятся целиком и сохраняются сразу при изменении. */
export type ChibiId = "none" | "rust" | "tarkov" | "anime";

export interface TtsConfig {
  enabled: boolean;
  rate: number;
  volume: number;
  voiceURI: string;
  obsTts: boolean;
  template: TTSTemplate;
  filters: TTSFilters;
  /** чиби-моделька в OBS-виджете; рот двигается в такт озвучке */
  chibi: ChibiId;
  /** чиби-моделька включена */
  chibiEnabled: boolean;
  /** размер модельки в виджете, px */
  chibiSize: number;
}

export const DEFAULT_TTS: TtsConfig = {
  enabled: false,
  rate: 1,
  volume: 0.9,
  voiceURI: "",
  obsTts: false,
  template: { author: true, platform: true, text: true },
  filters: DEFAULT_FILTERS,
  chibi: "anime",
  chibiEnabled: false,
  chibiSize: 140,
};

export function sanitizeTts(raw: unknown): TtsConfig {
  const src = (raw ?? {}) as Partial<TtsConfig>;
  return {
    ...DEFAULT_TTS,
    ...src,
    template: { ...DEFAULT_TTS.template, ...(src.template ?? {}) },
    filters: { ...DEFAULT_TTS.filters, ...(src.filters ?? {}) },
  };
}
