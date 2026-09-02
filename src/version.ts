/**
 * Единственный источник правды о версии YawaChatHub.
 * Держите это число в синхроне с файлом VERSION в корне репозитория —
 * При локальной сборке используется 3.0.0. GitHub Actions передаёт
 * VITE_APP_VERSION и автоматически увеличивает patch-версию релиза.
 *
 * Next.js подставляет NEXT_PUBLIC_APP_VERSION на этапе сборки;
 * Vite (рендерер для Electron) подставляет сюда VITE_APP_VERSION через `define` в vite.config.ts.
 */
export const APP_VERSION = (process.env.NEXT_PUBLIC_APP_VERSION || "").trim() || "3.2.5";
export const APP_TAG = `v${APP_VERSION}`;
export const APP_NAME = "YawaChatHub";
export const APP_CHANNEL = "portable x64";
