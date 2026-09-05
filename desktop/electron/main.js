// YawaChatHub — главный процесс Electron.
// Окна: главное (приложение целиком) + игровой оверлей (always-on-top, click-through, drag).
// Системный трей, глобальные горячие клавиши, локальный сервер виджета, SAPI TTS.
//
// FIX(2.0.0): «Сворачивать в трей при закрытии» — рабочая настройка.
//   Раньше переключатель в интерфейсе был заглушкой: он всегда показывал «включено»
//   и только выводил тост про settings.json. Теперь closeToTray читается из
//   settings.json при каждом закрытии окна, меняется из интерфейса (settings:patch)
//   и из меню трея, а крестик честно завершает приложение, когда настройка выключена.
// FIX: на машине пользователя стоит антивирус/корпоративный прокси с TLS-инспекцией.
// Chromium (Electron `net`) доверяет его корневому сертификату — поэтому YouTube
// работал. «Сырой» Node (ws WebSocket, https) его НЕ видит и ронял всё:
// "unable to verify the first certificate" — Twitch, Kick, VK, TikTok.
// Мы только ЧИТАЕМ публичные чаты, поэтому ослабляем проверку сертификатов
// для Node-слоя. Должно быть ДО любых сетевых require.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell } = require("electron");
const path = require("path");
const { getBaseDir, loadSettings, saveSettings } = require("./settings");
const { startWidgetServer } = require("./widgetServer");
const { ConnectorManager } = require("./connectors");
const { TtsEngine } = require("./tts");
const { warmupEdge, disposeEdge } = require("./edgeTts");
const { closeNet } = require("./net");

const baseDir = getBaseDir();
const settings = loadSettings(baseDir);

// Одинаковое имя в заголовке, трее, списке приложений и Диспетчере задач.
app.setName("YawaChatHub");
app.setAppUserModelId("chat.yawa.hub");

app.setAboutPanelOptions?.({ applicationName: "YawaChatHub", applicationVersion: settings.version || "" });

let mainWin = null;
let overlayWin = null;
let tray = null;
let widgetServer = null;
let connectors = null;
const tts = new TtsEngine();

if (!app.requestSingleInstanceLock()) app.quit();

const RENDERER = path.join(__dirname, "..", "renderer-dist", "index.html");

// Runtime-иконка лежит внутри electron/**/* и точно попадает в asar.
// Это исправляет пустой значок в трее portable и installer сборок.
// Векторный fallback в актуальном брендинге (три пузыря-«сообщения» на тёмном
// сквиркле) — используется только если ВСЕ растровые ресурсы почему-то повреждены.
const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect x="4" y="4" width="248" height="248" rx="58" fill="#0b0b18"/><circle cx="104" cy="92" r="52" fill="#8b5cf6"/><circle cx="156" cy="132" r="52" fill="#22d3ee" fill-opacity="0.92"/><circle cx="112" cy="176" r="46" fill="#ec4899" fill-opacity="0.9"/><text x="128" y="146" font-family="Arial, sans-serif" font-size="86" font-weight="700" fill="#fff" text-anchor="middle">Y</text></svg>`;

function appIcon(size) {
  // На Windows приоритет — многослойный .ico (16/32/64/128/256), собранный
  // electron-builder'ом же для exe: так Tray и заголовок окна используют тот
  // же ресурс, что и ярлык/панель задач, без потери резкости на мелких размерах.
  let icon = process.platform === "win32"
    ? nativeImage.createFromPath(path.join(__dirname, "..", "build", "icon.ico"))
    : nativeImage.createEmpty();
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(path.join(__dirname, "assets", "yawachat-tray.jpg"));
  }
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(path.join(__dirname, "..", "build", "icon.png"));
  }
  // Последний fallback: не оставляем пустой Tray, если все ресурсы повреждены.
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(APP_ICON_SVG, "utf8").toString("base64")}`
    );
  }
  return size ? icon.resize({ width: size, height: size, quality: "best" }) : icon;
}

function broadcast(channel, payload) {
  for (const win of [mainWin, overlayWin]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function persist() {
  saveSettings(settings, baseDir);
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(trayMenu());
}

/* ---------------- окна ---------------- */

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#06060b",
    title: "YawaChatHub",
    icon: appIcon(64),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      webSecurity: false, // нужен для загрузки 7TV/BTTV/FFZ смайлов из file://
    },
  });
  mainWin.loadFile(RENDERER, { hash: "/app" });
  mainWin.once("ready-to-show", () => {
    if (!settings.startHidden) mainWin.show();
  });

  // Внешние ссылки (GitHub, DonationAlerts, YouTube, Twitch, VK — «О программе»,
  // ссылки в сообщениях) открываем в БРАУЗЕРЕ ПО УМОЛЧАНИЮ, а не в новом окне
  // Electron. target=_blank перехватывается setWindowOpenHandler, обычный клик —
  // will-navigate. Внутренние file://-страницы пропускаем как есть.
  const isExternalHttp = (url) => /^https?:\/\//i.test(String(url || ""));
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttp(url) && !String(url).startsWith("http://127.0.0.1")) {
      shell.openExternal(url).catch(() => {});
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWin.webContents.on("will-navigate", (event, url) => {
    if (isExternalHttp(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  // уведомляем рендерер о развёрнутости — иконка кнопки «во весь экран»
  mainWin.on("maximize", () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("sp:maximize", true);
  });
  mainWin.on("unmaximize", () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("sp:maximize", false);
  });

  // FIX: сворачивание в трей теперь учитывает текущее значение closeToTray
  mainWin.on("close", (e) => {
    if (settings.closeToTray && !app.isQuitting) {
      e.preventDefault();
      mainWin.hide();
      if (tray) tray.displayBalloon({
        title: "YawaChatHub",
        content: "Приложение свёрнуто в трей. Двойной клик по иконке — открыть окно.",
      });
      return;
    }
    app.isQuitting = true;
  });

  mainWin.on("closed", () => {
    mainWin = null;
    app.isQuitting = true;
    app.quit();
  });
}

function applyOverlayFlags() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  // Прозрачность — только у подложки (CSS в рендерере), окно остаётся opacity=1,
  // иначе бледнел бы и текст сообщений.
  overlayWin.setOpacity(1);
  overlayWin.setIgnoreMouseEvents(!!settings.overlay.clickThrough, { forward: true });
  // FIX: окно нельзя было двигать — перетаскивание идёт через CSS-регион в рендерере,
  // поэтому здесь окно всегда «подвижное», кроме явной фиксации позиции.
  overlayWin.setMovable(!settings.overlay.locked);
  overlayWin.setResizable(!settings.overlay.locked && !settings.overlay.clickThrough);
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  // конфиг уходит именно в окно оверлея — иначе настройки «не применялись»
  overlayWin.webContents.send("sp:overlay", settings.overlay);
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("sp:overlay", settings.overlay);
}

function createOverlayWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const saved = settings.overlayBounds || {};
  overlayWin = new BrowserWindow({
    width: saved.width || 360,
    height: saved.height || 440,
    x: Number.isInteger(saved.x) ? saved.x : area.width - 390,
    y: Number.isInteger(saved.y) ? saved.y : 40,
    minWidth: 220,
    minHeight: 160,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      webSecurity: false,
    },
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile(RENDERER, { hash: "/overlay" });
  overlayWin.on("closed", () => (overlayWin = null));
  overlayWin.webContents.on("did-finish-load", applyOverlayFlags);

  // запоминаем позицию и размер окна оверлея
  const remember = () => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    settings.overlayBounds = overlayWin.getBounds();
    persist();
  };
  overlayWin.on("moved", remember);
  overlayWin.on("resized", remember);

  if (settings.overlay.enabled) overlayWin.showInactive();
}

function toggleOverlay(force) {
  if (!overlayWin || overlayWin.isDestroyed()) createOverlayWindow();
  const show = force !== undefined ? force : !overlayWin.isVisible();
  if (show) overlayWin.showInactive();
  else overlayWin.hide();
  settings.overlay.enabled = show;
  persist();
  applyOverlayFlags();
}

function toggleClickThrough() {
  settings.overlay.clickThrough = !settings.overlay.clickThrough;
  persist();
  applyOverlayFlags();
}

function toggleCloseToTray() {
  settings.closeToTray = !settings.closeToTray;
  persist();
  refreshTrayMenu();
  broadcast("sp:settings", settings);
}

/* ---------------- трей ---------------- */

const sendHotkey = (action) => broadcast("sp:hotkey", action);

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: "Открыть YawaChatHub", click: () => mainWin && mainWin.show() },
    { label: "Свернуть окно в трей", click: () => mainWin && mainWin.hide() },
    { type: "separator" },
    {
      label: "Сворачивать в трей при закрытии",
      type: "checkbox",
      checked: !!settings.closeToTray,
      click: toggleCloseToTray,
    },
    { type: "separator" },
    { label: "Озвучка вкл/выкл", click: () => sendHotkey("tts:toggle") },
    { label: "Пропустить текущее", click: () => sendHotkey("tts:skip") },
    { label: "Очистить очередь", click: () => sendHotkey("tts:clear") },
    { type: "separator" },
    { label: "Игровой оверлей вкл/выкл", click: () => toggleOverlay() },
    { label: "Сквозные клики вкл/выкл", click: () => toggleClickThrough() },
    { type: "separator" },
    { label: "Выход", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  // Используем встроенный SVG, поэтому значок не теряется после упаковки в asar.
  tray = new Tray(appIcon(16));
  tray.setToolTip(`YawaChatHub ${settings.version || ""}`.trim());
  tray.setContextMenu(trayMenu());
  tray.on("double-click", () => mainWin && mainWin.show());
}

/* ---------------- горячие клавиши ---------------- */

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const local = {
    "overlay:toggle": () => toggleOverlay(),
    "overlay:clicks": () => toggleClickThrough(),
    "window:toggle": () => {
      if (!mainWin) return;
      mainWin.isVisible() ? mainWin.hide() : mainWin.show();
    },
  };
  for (const [action, accelerator] of Object.entries(settings.hotkeys)) {
    if (!accelerator) continue;
    try {
      globalShortcut.register(accelerator, () => (local[action] ? local[action]() : sendHotkey(action)));
    } catch (e) {
      console.error(`[hotkeys] ${accelerator}: ${e.message}`);
    }
  }
}

/* ---------------- IPC ---------------- */

ipcMain.on("channels:add", (_e, c) => connectors && connectors.add(c.platform, c.channelId));
ipcMain.on("channels:remove", (_e, c) => connectors && connectors.remove(c.platform, c.channelId));
ipcMain.handle("channels:list", () => (connectors ? connectors.list() : []));
ipcMain.on("net:diagnose", () => connectors && connectors.diagnose());

ipcMain.handle("widget:url", () => (widgetServer ? widgetServer.url : ""));
ipcMain.handle("widget:info", () => ({
  port: (widgetServer && widgetServer.port) || settings.port,
  token: settings.token,
  url: widgetServer ? widgetServer.url : "",
}));
// тестовое сообщение из панели виджета — летит во все подключённые OBS-клиенты
ipcMain.on("widget:test", (_e, msg) => {
  if (widgetServer && msg && msg.text) widgetServer.broadcast(msg);
});

// Оформление виджета: применяется в OBS мгновенно, ссылка при этом не меняется.
ipcMain.on("widget:config", (_e, payload) => {
  if (payload && payload.ttsPlay && widgetServer && widgetServer.sendConfig) {
    tts.synthesizeWavBase64(payload.ttsPlay).then((res) => {
      if (res && res.audioBase64) {
        widgetServer.sendConfig({
          // volume передаём отдельно: у Edge громкость не пишется в SSML,
          // её применяет <audio> — так один синтез переиспользуется из кеша.
          ttsAudio: {
            id: payload.ttsPlay.id,
            audioBase64: res.audioBase64,
            mime: res.mime || "audio/wav",
            volume: payload.ttsPlay.volume,
          },
        });
      } else {
        // Edge офлайн / SAPI недоступен — виджет озвучит фразой через Web Speech.
        widgetServer.sendConfig({ ttsPlay: payload.ttsPlay });
      }
    });
    return;
  }
  if (widgetServer && widgetServer.sendConfig) widgetServer.sendConfig(payload);
});

ipcMain.handle("settings:get", () => settings);
ipcMain.on("settings:patch", (_e, patch) => {
  Object.assign(settings, patch);
  persist();
  refreshTrayMenu();
  broadcast("sp:settings", settings);
});

ipcMain.on("hotkeys:apply", (_e, map) => {
  settings.hotkeys = { ...settings.hotkeys, ...map };
  persist();
  registerHotkeys();
});

/* управление главным окном: свернуть / скрыть в трей / во весь экран / закрыть */
ipcMain.on("window:minimize", () => {
  if (!mainWin) return;
  if (settings.minimizeToTray) mainWin.hide();
  else mainWin.minimize();
});
ipcMain.on("window:hide-to-tray", () => mainWin && mainWin.hide());
ipcMain.on("window:toggle-maximize", () => {
  if (!mainWin) return;
  if (mainWin.isMaximized()) mainWin.unmaximize();
  else mainWin.maximize();
});
ipcMain.handle("window:is-maximized", () => (mainWin ? mainWin.isMaximized() : false));
ipcMain.on("window:close", () => {
  if (!mainWin) {
    app.isQuitting = true;
    app.quit();
    return;
  }
  if (settings.closeToTray) {
    mainWin.hide();
  } else {
    app.isQuitting = true;
    app.quit();
  }
});

tts.onEnd = (id) => broadcast("sp:tts-end", id);
// Edge-фразы играет главное окно (Chromium), а не отдельный PowerShell-плеер:
// это убирает 0.5–1.5 с задержки и постоянную нагрузку от WPF-процессов.
// Шлём ТОЛЬКО в mainWin, иначе оверлей проиграл бы ту же фразу вторым голосом.
tts.onAudio = (payload) => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("sp:tts-audio", payload);
  else tts.audioDone(payload && payload.id); // окна нет — не блокируем очередь
};
ipcMain.on("tts:audio-done", (_e, id) => tts.audioDone(id));
ipcMain.on("tts:speak", (_e, payload) => tts.speak(payload));
ipcMain.on("tts:skip", () => {
  tts.skip();
  broadcast("sp:tts-stop", null); // остановить <audio> в окне
});
ipcMain.on("tts:stopAll", () => {
  tts.stopAll();
  broadcast("sp:tts-stop", null);
});
ipcMain.handle("tts:voices", () => tts.voices());

ipcMain.handle("overlay:get", () => settings.overlay);
ipcMain.on("overlay:set", (_e, cfg) => {
  const wasEnabled = settings.overlay.enabled;
  settings.overlay = { ...settings.overlay, ...cfg };
  persist();
  if (settings.overlay.enabled !== wasEnabled) toggleOverlay(settings.overlay.enabled);
  else applyOverlayFlags();
});

ipcMain.on("app:quit", () => {
  app.isQuitting = true;
  app.quit();
});

/* ---------------- запуск ---------------- */

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  try { if (connectors) connectors.stopAll(); } catch { /* noop */ }
  try { if (widgetServer) widgetServer.close(); } catch { /* noop */ }
  try { tts.dispose(); } catch { /* noop */ }
  try { disposeEdge(); } catch { /* noop */ }
  try { closeNet(); } catch { /* noop */ }
});

// окно может быть скрыто в трей — приложение не должно завершаться
app.on("window-all-closed", (e) => {
  if (!app.isQuitting) e.preventDefault();
});

app.whenReady().then(async () => {
  // Окно создаётся ПЕРВЫМ: интерфейс появляется сразу, а сервер виджета и
  // коннекторы поднимаются параллельно — иначе старт «залипал» на несколько секунд.
  registerHotkeys();
  createMainWindow();
  createTray();
  // Открываем соединение с Edge заранее: первая фраза не ждёт TLS-рукопожатия.
  warmupEdge();

  widgetServer = await startWidgetServer({
    port: settings.port,
    token: settings.token,
    onClient: (n) => broadcast("sp:widget-clients", n),
    onPort: (p) => {
      if (p && p !== settings.port) {
        settings.port = p;
        persist();
      }
    },
    onWarn: (msg) => console.warn("[widget]", msg),
  });

  // очередь событий до готовности окна — иначе первые статусы/сообщения теряются
  let rendererReady = false;
  const pending = [];
  const emit = (channel, payload) => {
    if (mainWin && !mainWin.isDestroyed() && rendererReady) broadcast(channel, payload);
    else pending.push([channel, payload]);
  };

  connectors = new ConnectorManager({
    settings,
    onChat: (m) => {
      emit("sp:chat", m);
      // FIX(3.1.2): реальная лента в OBS-виджет — раньше улетали только тестовые сообщения
      try {
        if (widgetServer && widgetServer.broadcast) widgetServer.broadcast(m);
      } catch {}
    },
    onStatus: (list) => emit("sp:channels", list),
  });

  // коннекторы стартуют только после того, как интерфейс готов принимать события
  const startConnectors = () => {
    if (rendererReady) return;
    rendererReady = true;
    for (const [ch, p] of pending) broadcast(ch, p);
    pending.length = 0;
    connectors.startAll();
  };
  if (mainWin) {
    mainWin.webContents.once("did-finish-load", () => setTimeout(startConnectors, 150));
    // подстраховка, если событие не пришло
    setTimeout(startConnectors, 3000);
  } else {
    startConnectors();
  }

  app.on("activate", () => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.show();
  });
});
