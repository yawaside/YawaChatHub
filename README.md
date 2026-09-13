# YawaChatHub WebView2

**Порт [yawaside/YawaChat_Hub](https://github.com/yawaside/YawaChat_Hub) с Electron на WebView2.**
Интерфейс десктоп-приложения перенесён **1:1 без изменений** — окно программы рендерит тот же
Vite-рендерер, что и раньше; меняется только «несущий» слой: вместо связки Node.js + Chromium-связки
— лёгкий exe на .NET 8 с движком Edge WebView2 (входит в Windows 10/11).

Площадки: **Twitch · YouTube Live · VK Play Live · Kick · TikTok Live · DonationAlerts**.

| Часть               | Путь                              | Описание                                                         |
| ------------------- | --------------------------------- | ---------------------------------------------------------------- |
| Рендерер (интерфейс) | `src/`                            | окно приложения (`#/app`), оверлей (`#/overlay`), виджет (`#/widget`) |
| WebView2-хост       | `webview2/`                       | окно без рамки, трей, SAPI TTS, хоткеи, оверлей, сервер виджета  |
| Авторелиз           | `.github/workflows/release.yml`   | сборка → zip → тег → Release + автобамп версии                  |
| Версионирование     | `VERSION`, `scripts/*.mjs`        | схема с переносом разряда (1.1.9 → 1.2.0 → …)                   |

---

## Загрузка на GitHub (первый раз)

```bash
git init
git add .
git commit -m "feat: порт на WebView2, интерфейс 1:1"
git branch -M main
git remote add origin https://github.com/<ваш-логин>/YawaChatHub-WebView2.git
git push -u origin main
```

Один раз включите доступ на запись для Actions:
**Settings → Actions → General → Workflow permissions → Read and write permissions**.

Дальше всё автоматически:

- **`release.yml`** — пуш в `main` → Actions собирает `dist/` (Vite single-file),
  публикует WebView2-хоста (`win-x64`, single-file exe), создаёт тег `v<версия>` из файла `VERSION`,
  публикует Release с zip и увеличивает `VERSION` коммитом `[skip ci]`. Повторный тег не создаётся —
  дубли пропускаются. Промежуточные сборки всегда есть в **Actions → Artifacts**.
- **`ci.yml`** — автосборка на каждый пуш в другие ветки и на каждый pull request:
  проверяет, что собираются и рендерер, и хост, и складывает проверочную сборку в Artifacts.

---

## Разработка

```bash
npm install
npm run dev                         # браузерное демо интерфейса (http://localhost:5173)
npm run build                       # dist/index.html (single-file) — фид для хоста

cd webview2
dotnet restore
dotnet run -- --dev                 # окно WebView2 против dev-сервера Vite
dotnet run                          # окно WebView2 на собранном dist
dotnet run -- --hidden              # старт в трей
```

Требования для хоста: **.NET 8 SDK**, Windows 10/11 (WebView2 Runtime предустановлен).

### Локальный релиз exe

```bash
npm install && npm run build
dotnet publish webview2/YawaChatHub.WebView2.csproj -c Release -r win-x64 ^
  --self-contained true -p:PublishSingleFile=true ^
  -p:IncludeNativeLibrariesForSelfExtract=true -o publish
# → publish\YawaChatHub.exe  (переносимый, .NET не требуется на целевом ПК)
```

---

## Версии и релизы

Как в исходном репозитории: каждый сегмент `minor`/`patch` — одна цифра 0–9,
при переполнении перенос в старший разряд:

| Последняя версия | Следующая |
| ---------------- | --------- |
| 1.1.9            | **1.2.0** |
| 1.2.9            | **1.3.0** |
| 1.9.9            | **2.0.0** |

- Файл **`VERSION`** в корне — версия, которая будет выпущена следующим пушем в `main`.
- `scripts/sync-version.mjs` копирует её в csproj (что видно и в свойствах exe),
  `scripts/bump-version.mjs` поднимает версию после релиза (`node scripts/bump-version.mjs`).
- Заметки релиза workflow берёт из раздела `## [X.Y.Z]` в `CHANGELOG.md`.

---

## Мост рендерер ↔ хост

Рендерер (`src/lib/bridge.ts`) — `chrome.webview.postMessage({id, method, args})`;
хост (`webview2/HostApi.cs`) отвечает `PostWebMessageAsJson({id, ok, result|error})`,
события хоста — `{event, payload}` (`hotkey`, `chat.message`). В браузере моста нет —
включается демо-режим (localStorage + speechSynthesis), интерфейс работает как сайт-витрина.

Подробная таблица соответствия «часть Electron → часть WebView2» — в [`webview2/README.md`](webview2/README.md).

### Что осталось перенести из `desktop/electron/connectors`

Коннекторы площадок (Twitch IRC, YouTube polling, Kick pusher, VK/TikTok Live WS,
DonationAlerts Centrifugo) подключаются в единственную точку `HostApi.PushChatMessage(...)` —
форма сообщения уже совпадает с лентой (`ChatMsg`, `src/lib/types.ts`). Лента, озвучка,
оверлей и виджет получают его одновременно.

---

Лицензия: [MIT](LICENSE) (как у оригинального репозитория).
