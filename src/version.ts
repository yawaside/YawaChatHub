/**
 * Единственный источник правды о версии YawaChatHub.
 * Держите это число в синхроне с файлом VERSION в корне репозитория —
 * При локальной сборке используется 3.0.0. GitHub Actions передаёт
 * VITE_APP_VERSION и автоматически увеличивает patch-версию релиза.
 *
 * Next.js подставляет NEXT_PUBLIC_APP_VERSION на этапе сборки;
 * Vite (рендерер для Electron) подставляет сюда VITE_APP_VERSION через `define` в vite.config.ts.
 */
export const APP_VERSION = (process.env.NEXT_PUBLIC_APP_VERSION || "").trim() || "1.0.0";
export const APP_TAG = `v${APP_VERSION}`;
export const APP_NAME = "YawaChatHub";
export const APP_VERSION_MAX = "1.9.9";

/** Следующая версия с переносом мажорной цифры: 1.9.9 → 2.0.0, 2.0.0 → 2.0.1 ... */
export function bumpVersion(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || "").trim());
  if (!m) return v;
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  pat += 1;
  if (pat > 9) { pat = 0; min += 1; }
  if (min > 9) { min = 0; maj += 1; }
  return `${maj}.${min}.${pat}`;
}

export const APP_CHANNEL = "portable x64";
