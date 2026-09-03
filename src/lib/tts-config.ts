import { DEFAULT_FILTERS } from "./core";
import type { TTSTemplate, TTSFilters } from "./core";

/** Настройки озвучки. Хранятся целиком и сохраняются сразу при изменении. */
export interface TtsConfig {
  enabled: boolean;
  rate: number;
  volume: number;
  voiceURI: string;
  obsTts: boolean;
  template: TTSTemplate;
  filters: TTSFilters;
}

export const DEFAULT_TTS: TtsConfig = {
  enabled: false,
  rate: 1,
  volume: 0.9,
  voiceURI: "",
  obsTts: false,
  template: { author: true, platform: true, text: true },
  filters: DEFAULT_FILTERS,
};

export function sanitizeTts(raw: unknown): TtsConfig {
  const src = (raw ?? {}) as Partial<TtsConfig>;
  const out: TtsConfig = {
    ...DEFAULT_TTS,
    ...src,
    template: { ...DEFAULT_TTS.template, ...(src.template ?? {}) },
    filters: { ...DEFAULT_TTS.filters, ...(src.filters ?? {}) },
  };
  // Миграция: раньше смайлы озвучивались по умолчанию. Если пользователь не трогал
  // переключатель «Вырезать эмодзи», применяем новое поведение — смайлы молчат.
  if (!out.filters.emojiTouched) out.filters.emoji = DEFAULT_FILTERS.emoji;
  return out;
}
