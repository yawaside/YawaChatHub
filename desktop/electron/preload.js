// Мост между системным процессом и интерфейсом (contextIsolation включён).
const { contextBridge, ipcRenderer } = require("electron");

const mode = location.hash.includes("overlay") ? "overlay" : "app";

contextBridge.exposeInMainWorld("sp", {
  mode,
  platform: process.platform,

  /* чат и каналы */
  onChat: (cb) => ipcRenderer.on("sp:chat", (_e, m) => cb(m)),
  onChannels: (cb) => ipcRenderer.on("sp:channels", (_e, list) => cb(list)),
  getChannels: () => ipcRenderer.invoke("channels:list"),
  addChannel: (platform, channelId) => ipcRenderer.send("channels:add", { platform, channelId }),
  removeChannel: (platform, channelId) => ipcRenderer.send("channels:remove", { platform, channelId }),
  diagnoseNet: () => ipcRenderer.send("net:diagnose"),

  /* виджет OBS */
  widgetUrl: () => ipcRenderer.invoke("widget:url"),
  widgetInfo: () => ipcRenderer.invoke("widget:info"),
  widgetTest: (msg) => ipcRenderer.send("widget:test", msg),
  widgetConfig: (payload) => ipcRenderer.send("widget:config", payload),
  onWidgetClients: (cb) => ipcRenderer.on("sp:widget-clients", (_e, n) => cb(n)),

  /* настройки (settings.json рядом с exe) — сохраняются сразу, без кнопки */
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    patch: (patch) => ipcRenderer.send("settings:patch", patch),
    onChange: (cb) => ipcRenderer.on("sp:settings", (_e, s) => cb(s)),
  },

  /* глобальные горячие клавиши */
  onHotkey: (cb) => ipcRenderer.on("sp:hotkey", (_e, action) => cb(action)),
  hotkeys: {
    apply: (map) => ipcRenderer.send("hotkeys:apply", map),
  },

  /* окно: свернуть / скрыть в трей / во весь экран / закрыть */
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    hideToTray: () => ipcRenderer.send("window:hide-to-tray"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    close: () => ipcRenderer.send("window:close"),
    onMaximize: (cb) => ipcRenderer.on("sp:maximize", (_e, v) => cb(v)),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  },

  /* SAPI + Edge TTS озвучка */
  tts: {
    speak: ({ text, rate, volume, voice }) => {
      const id = `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      ipcRenderer.send("tts:speak", { id, text, rate, volume, voice });
      return id;
    },
    skip: () => ipcRenderer.send("tts:skip"),
    stopAll: () => ipcRenderer.send("tts:stopAll"),
    voices: () => ipcRenderer.invoke("tts:voices"),
    onEnd: (cb) => ipcRenderer.on("sp:tts-end", (_e, id) => cb(id)),
    /** Edge TTS: MP3 base64 приходит отдельным каналом — проигрывается через <audio>. */
    onEdgeAudio: (cb) => ipcRenderer.on("sp:edge-audio", (_e, data) => cb(data)),
  },

  /* игровой оверлей */
  overlay: {
    get: () => ipcRenderer.invoke("overlay:get"),
    set: (cfg) => ipcRenderer.send("overlay:set", cfg),
    onChange: (cb) => ipcRenderer.on("sp:overlay", (_e, o) => cb(o)),
  },


  /* полный выход (минуя трей) */
  app: {
    quit: () => ipcRenderer.send("app:quit"),
  },
});
