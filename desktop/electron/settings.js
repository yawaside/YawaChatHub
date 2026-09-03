// Хранение настроек в settings.json рядом с exe. Без реестра, без БД.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_HOTKEYS = {
  "overlay:toggle": "Control+Shift+G",
  "overlay:clicks": "Control+Shift+C",
  "telemetry:toggle": "Control+Shift+M",
  "tts:toggle": "Control+Shift+T",
  "tts:pause": "Control+Shift+P",
  "tts:skip": "Control+Shift+S",
  "tts:clear": "Control+Shift+Q",
  "window:toggle": "Control+Shift+H",
  "feed:clear": "Control+Shift+L",
};

const DEFAULT_WIDGET = {
  style: "clean",
  theme: "minimal-dark",
  fontSize: 16,
  bgOpacity: 70, // прозрачность ТОЛЬКО подложки
  radius: 12,
  duration: 8,
  dir: "up",
  shadow: true,
  showPlatform: true,
  showTime: true,
  maxMessages: 8,
  effect: "slide-up",
  effectDuration: 0.32,
  rowGap: 6,
  textColor: "",
  nameColor: "",
  bgColor: "",
  border: true,
  bgImage: "",
};

const DEFAULT_OVERLAY = {
  enabled: false,
  bgOpacity: 55, // прозрачность подложки оверлея, текст остаётся чётким
  clickThrough: false,
  mode: "compact",
  fontSize: 12,
  maxMessages: 6,
  locked: false,
  style: "clean",
  showBorder: true,
  effect: "slide-up",
  effectDuration: 0.3,
  textColor: "",
  nameColor: "",
  bgColor: "",
  radius: 14,
  bgImage: "",
  showTime: false,
  showPlatform: true,
  showViewers: true, // онлайн подключённых площадок внизу оверлея
  ttl: 0, // сколько секунд живёт сообщение в оверлее (0 — не скрывать)
  rowGap: 6, // отступ между сообщениями оверлея, px
};

const DEFAULT_CHAT_VIEW = {
  style: "classic",
  fontSize: 15,
  rowGap: 6,
  radius: 16,
  showPlatform: true,
  showTime: true,
  showBadges: true,
  messageEffect: "slide-up",
  effectDuration: 0.34,
};

const DEFAULT_TELEMETRY = {
  enabled: false,
  clickThrough: true,
  locked: false,
  showCpuLoad: true,
  showCpuTemp: true,
  showGpuLoad: true,
  showGpuTemp: true,
  opacity: 76,
  fontSize: 14,
};

const DEFAULTS = {
  settingsSchemaVersion: 3,
  port: 47823,
  token: null, // генерируется при первом запуске
  theme: "midnight",
  /* Поведение окна управляется из интерфейса и из меню трея. */
  closeToTray: false, // по умолчанию крестик завершает приложение
  minimizeToTray: false, // кнопка «минус» сворачивает в трей (иначе на панель задач)
  startHidden: false, // не показывать окно при старте
  // YouTube читается без Data API (внутренний endpoint, как в браузере).
  // Ключ больше не нужен — поле оставлено только для совместимости со старыми конфигами.
  youtubeApiKey: "",
  overlayBounds: null, // позиция и размер окна оверлея
  telemetryBounds: null, // позиция и размер telemetry overlay
  channels: [],
  tts: null, // заполняется из интерфейса: { enabled, rate, volume, voiceURI, template, filters }
  chatView: null, // вид ленты
  widget: DEFAULT_WIDGET,
  overlay: DEFAULT_OVERLAY,
  telemetry: DEFAULT_TELEMETRY,
  hotkeys: DEFAULT_HOTKEYS,
};

function getBaseDir() {
  // portable-сборка electron-builder выставляет PORTABLE_EXECUTABLE_DIR
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.platform === "win32" && !process.argv[0].includes("electron")) {
    try {
      return path.dirname(process.execPath);
    } catch {
      /* noop */
    }
  }
  return path.join(__dirname, "..");
}

function getSettingsPath(baseDir) {
  return path.join(baseDir || getBaseDir(), "settings.json");
}

function loadSettings(baseDir) {
  const file = getSettingsPath(baseDir);
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* первый запуск */
  }
  const settings = {
    ...DEFAULTS,
    ...data,
    chatView: { ...DEFAULT_CHAT_VIEW, ...(data.chatView || {}) },
    widget: { ...DEFAULT_WIDGET, ...(data.widget || {}) },
    overlay: { ...DEFAULT_OVERLAY, ...(data.overlay || {}) },
    telemetry: { ...DEFAULT_TELEMETRY, ...(data.telemetry || {}) },
    hotkeys: { ...DEFAULT_HOTKEYS, ...(data.hotkeys || {}) },
  };
  // В 3.0 настройка закрытия в трей стала выключена по умолчанию. Старый конфиг
  // мигрирует один раз, затем выбор пользователя снова сохраняется как обычно.
  const migrateToV3 = Number(data.settingsSchemaVersion || 0) < 3;
  settings.closeToTray = migrateToV3 ? false : settings.closeToTray === true;
  settings.settingsSchemaVersion = 3;
  settings.minimizeToTray = settings.minimizeToTray === true;
  settings.startHidden = settings.startHidden === true;
  if (!settings.token) {
    settings.token = "yawa_" + crypto.randomBytes(6).toString("hex");
    saveSettings(settings, baseDir);
  } else if (migrateToV3) {
    saveSettings(settings, baseDir);
  }
  return settings;
}

function saveSettings(settings, baseDir) {
  try {
    fs.writeFileSync(getSettingsPath(baseDir), JSON.stringify(settings, null, 2), "utf8");
  } catch (e) {
    console.error("[settings] не удалось записать settings.json:", e.message);
  }
}

module.exports = {
  DEFAULTS, DEFAULT_HOTKEYS, DEFAULT_WIDGET, DEFAULT_OVERLAY,
  getBaseDir, getSettingsPath, loadSettings, saveSettings,
};
