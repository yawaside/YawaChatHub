# Сборка Windows-приложений

Из одного репозитория получаются две сборки Windows x64:

* **portable** — `YawaChatHub.exe`, один файл, установка не нужна;
* **nsis** — `YawaChatHub-Setup.exe`, обычный установщик с ярлыками.

Файл `VERSION` задаёт начало линии **3.0.0**. При каждом авторелизе workflow находит
последний тег `v3.0.x`, увеличивает patch-номер и синхронизирует версию интерфейса и exe.

## Локальная сборка

```bash
# 1. интерфейс (рендерер)
npm install
npm run build
xcopy dist desktop\renderer-dist /E /I /Y      # Git Bash: cp -r dist/. desktop/renderer-dist/
node scripts/sync-version.mjs 3.0.0

# 2. оболочка
cd desktop
npm install

npm run dist         # только portable exe
npm run dist:setup   # только установщик
npm run dist:all     # обе сборки
```

Готовые файлы: `desktop/release/`.

## Что именно собирается

* `electron-builder` с `"npmRebuild": false` — иначе `@electron/rebuild` пытается собрать
  опциональный `bufferutil` для `ws` через node-gyp и падает без Visual Studio.
  `ws` и `tiktok-live-connector` работают на чистом JS.
* В сборку попадают `electron/**`, `renderer-dist/**`, `widget/**`.
* Иконка: `desktop/build/icon.png`.

## Автосборка в GitHub Actions

Файл `.github/workflows/release.yml`, запускается на push в `main`, на тег `v*` и вручную.

1. **build** (windows-latest): Vite → интерфейс, `npm install` в `desktop`,
   `electron-builder --win` → артефакт `YawaChatHub-<версия>` с двумя exe.
2. **tag**: создаёт `v3.0.0`, а при следующих push автоматически увеличивает
   patch-номер (`v3.0.1`, `v3.0.2` и далее).
3. **release**: генерирует ченжлог (`scripts/changelog.sh`), обновляет `CHANGELOG.md` в репозитории
   и публикует Release с `YawaChatHub.exe` и `YawaChatHub-Setup.exe`.

Один раз включите: **Settings → Actions → General → Workflow permissions → Read and write permissions**.

## Следующий релиз

Версию вручную менять не нужно. Обычный push в `main` создаёт следующую patch-версию.
Для публичного changelog используйте префиксы `feat:`, `fix:`, `ui:` или `perf:` —
технические коммиты в описание релиза не попадают.
