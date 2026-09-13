# YawaChatHub — WebView2-оболочка

Порт десктоп-оболочки с **Electron на WebView2**. Интерфейс не изменён ни на пиксель:
окно рендерит ту же Vite-сборку (`dist/index.html`), что и раньше, — меняется только
«несущий» слой (main-процесс). Вместо Node.js/Chromium-связки — лёгкий exe на
.NET 8 с движком Edge WebView2 (поставляется с Windows 10/11).

## Как собрать

```bash
# 1) интерфейс (из корня репозитория)
npm install
npm run build            # → dist/index.html (single-file)

# 2) оболочка
cd webview2
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false
# готовый exe → bin/Release/net8.0-windows/win-x64/publish/YawaChatHub.exe
```

Требования: .NET 8 SDK и WebView2 Runtime (в Win11 уже есть). Флаг `--dev` запускает
окно против `vite dev` (http://localhost:5173), `--hidden` — старт в трее.

## Соответствие частям Electron-оболочки

| Electron (desktop/electron)          | WebView2 (webview2/)                                   |
| ------------------------------------ | ------------------------------------------------------ |
| main.js · BrowserWindow frame:false  | Program.cs · FormBorderStyle.None + WM_NCHITTEST       |
| ipcMain.handle("settings.*")         | HostApi settings.get/set → %LOCALAPPDATA%\...\settings.json |
| app.getPath("userData")              | %LOCALAPPDATA%\YawaChatHub                             |
| tray + контекстное меню              | NotifyIcon (Показать / Выход)                          |
| globalShortcut.register              | RegisterHotKey / WM_HOTKEY → событие `hotkey`          |
| tts.js (System.Speech / say)         | SapiTts.cs · COM «SAPI.SpVoice»                        |
| overlay.js (setIgnoreMouseEvents)    | OverlayWindow.cs · WS_EX_TRANSPARENT поверх игры       |
| widget-server (express → /widget)    | WidgetServer.cs · HttpListener + SSE /widget/events    |
| IPC main → renderer (chat message)   | PostWebMessageAsJson `{event:"chat.message"}`          |
| preload · contextBridge              | chrome.webview.postMessage + window.drag               |
| electron-updater / релизы            | без изменений: GitHub Actions (см. корень)             |

## Протокол моста

Рендерер (src/lib/bridge.ts) шлёт `chrome.webview.postMessage({id, method, args})`,
хост отвечает `PostWebMessageAsJson({id, ok, result|error})`. События от хоста:
`{event, payload}` — `hotkey`, `chat.message`. В браузере (без WebView2)
включается прежний демо-режим, интерфейс работает как сайт-витрина.

## Коннекторы площадок (webview2/Connectors.cs)

В готовом приложении демо-режима нет: каналы подключаются реальными коннекторами
(мост `channels.connect/disconnect/reconnect`), события уходят в ленту, озвучку,
оверлей и SSE-виджет одновременно через `HostApi.PushChatMessage`.

| Площадка       | Протокол                                                          | Статус / что проверено                                              |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Twitch         | IRC `irc.chat.twitch.tv:6697` (TLS, анонимный justinfan) + tags   | стабильно: сообщения, ники-цвета, бейджи, эмоуты по id, sub/gift/raid через USERNOTICE; зрители — decapi (45 сек) |
| Kick           | REST `kick.com/api/v2/channels/{u}` → Pusher WS `chatrooms.{id}.v2` | стабильно: сообщения + эмоуты `[emote:id:name]`, бейджи, зрители (60 сек) |
| VK Play Live   | REST `api.live.vkvideo.ru/v1/blog/{u}` → Centrifugo WS `channel-chat:{id}` | живая проверка нужна: формат pub-сообщений разобран защитно (regex по nick/text) |
| YouTube Live   | innertube `@user/live` → `get_live_chat` (без API-ключа)           | best-effort: HTML-парсинг YouTube ломается его обновлениями; при оффлайне перепроверка каждые 2 мин |
| DonationAlerts | REST `user/oauth` (Bearer secret) → Centrifugo WS `$alerts:donation_{uid}` | по документации API v1; нужен реальный секретный токен из профиля |
| TikTok Live    | `@user/live` → webcast `chat/fetch` поллинг                        | экспериментально: без cookies/msToken эндпоинт может отдавать 403 — тогда статус «ошибка», в остальном честно ведём reconnect |

Проверка в сборке: все коннекторы -managed, с токенами отмены и отчётом статуса
(`channel.status` → UI). Живое тестирование: подключить реальные каналы и смотреть
статусы — «подключение… → в эфире / офлайн / ошибка».
