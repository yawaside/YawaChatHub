# Как правильно залить YawaChatHub на GitHub

## Почему exe не заливаются через git bash

В `.gitignore` специально указано:

```
dist/
desktop/release/
desktop/renderer-dist/
```

Причина:
1. `YawaChatHub.exe` ~150-180 МБ, `YawaChatHub-Setup.exe` ~120 МБ — **GitHub не принимает файлы больше 100 МБ** в обычный репозиторий.
2. Сборки должны собираться **автоматически в GitHub Actions**, а не коммититься вручную. Иначе репозиторий раздуется на гигабайты.

Правильный путь:
- Вы пушите **только исходники** (`src/`, `desktop/electron/`, `desktop/widget/` и т.д.)
- GitHub Actions сам собирает оба exe на Windows-раннере
- Готовые файлы появляются в двух местах:
  - `Actions → последний запуск → Artifacts → YawaChatHub-3.1.2`
  - `Releases → v3.1.2 → YawaChatHub.exe + YawaChatHub-Setup.exe`

## Первая заливка (пустой репозиторий)

Открой Git Bash в корне проекта:

```bash
git init
git add .
git status
# вы НЕ должны видеть desktop/release/ и dist/ — это нормально, они игнорируются

git commit -m "feat: YawaChatHub 3.1.2"
git branch -M main
git remote remove origin 2>/dev/null; git remote add origin https://github.com/yawaside/Yawachat.test.git
git push -u origin main --force
```

Затем включи права для авторелиза:
`Settings → Actions → General → Workflow permissions → Read and write permissions → Save`

После этого автоматически:
- соберутся exe
- создастся тег `v3.1.2`
- опубликуется Release с changelog

## Обновление уже существующего репозитория

```bash
git add .
git commit -m "fix: OBS виджет, эффекты ленты и эмодзи"
git push
```

Каждый такой push в `main` автоматически выпустит следующую версию: `3.1.2 → 3.1.3 → 3.1.4` и т.д.
В changelog попадут только коммиты с префиксами `feat:`, `fix:`, `ui:`, `perf:`.

## Если очень нужно залить exe вручную (не рекомендуется)

```bash
git lfs install
git lfs track "*.exe"
git add .gitattributes
git add -f desktop/release/YawaChatHub.exe desktop/release/YawaChatHub-Setup.exe
git commit -m "release: exe"
git push
```

Но лучше не делать так — используйте авторелиз.

## Где скачать готовые сборки

1. `https://github.com/yawaside/Yawachat.test/actions` → последний успешный `build · tag · release` → `Artifacts`
2. `https://github.com/yawaside/Yawachat.test/releases` → последний релиз

## Локальная сборка для теста (не для пуша)

```bash
npm install
npm run build
node scripts/sync-version.mjs 3.1.2
xcopy dist desktop\renderer-dist /E /I /Y
cd desktop
npm install
npm run dist:all
# результат: desktop/release/YawaChatHub.exe и YawaChatHub-Setup.exe
```
