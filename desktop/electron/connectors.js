// Коннекторы площадок. Каждый работает независимо: ошибка одной не влияет на остальные.
// Переподключение автоматическое, с ростом интервала.
//
// FIX(2.0.1) — «всегда ошибка» и «YouTube просит API»:
//   Twitch  — свой анонимный IRC поверх WebSocket (без tmi.js: библиотека в упакованном
//             приложении часто не поднималась и канал сразу падал в error).
//   YouTube — БЕЗ Data API и без ключа: читаем страницу /live и внутренний
//             endpoint youtubei/v1/live_chat (см. youtube.js).
//   Kick    — запрос через скрытое окно Chromium (net.js), иначе Cloudflare отдаёт 403.
//   VK      — публичный chat-polling, тоже через браузерный запрос.
//   TikTok  — tiktok-live-connector, если модуль доступен.

const WebSocket = require("ws");
const { getJson, postJson, request, setDebug } = require("./net");
const yt = require("./youtube");

// «Сырой» Node-запрос (обходит Chromium-стек Electron net) — нужен,
// чтобы отличить «нет сети вообще» от «проблема только в WebSocket-слое».
function rawNodeHttps(url, timeout = 8000) {
  return new Promise((resolve) => {
    let req;
    try {
      req = require("https").get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Accept": "*/*" } }, (res) => {
        res.resume();
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode || 0 });
      });
    } catch (e) {
      return resolve({ ok: false, status: 0, error: String(e.message || e) });
    }
    req.on("error", (e) => resolve({ ok: false, status: 0, error: String(e.message || e) }));
    req.setTimeout(timeout, () => {
      try { req.destroy(); } catch { /* noop */ }
      resolve({ ok: false, status: 0, error: "timeout" });
    });
  });
}

const NAME_COLORS = ["#ff6b81", "#ffa94d", "#ffd43b", "#69db7c", "#3bc9db", "#4dabf7", "#9775fa", "#f783ac"];
const TWITCH_WS = "wss://irc-ws.chat.twitch.tv:443";
const KICK_PUSHER = [
  "32cbd69e4b950bf97679",
  "eb1d5f283081a78b932c",
];
const WS_HEADERS = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Origin: "https://kick.com",
  },
};
function kickPusherUrl(key) {
  return `wss://ws-us2.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;
}

/* ---------------- разбор IRC ---------------- */

function parseTags(raw) {
  const tags = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    tags[part.slice(0, i)] = part
      .slice(i + 1)
      .replace(/\\s/g, " ")
      .replace(/\\:/g, ";")
      .replace(/\\\\/g, "\\");
  }
  return tags;
}

function parseIrc(line) {
  let rest = line;
  let tags = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  let prefix = "";
  if (rest.startsWith(":")) {
    const sp = rest.indexOf(" ");
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const sp = rest.indexOf(" ");
  const command = sp === -1 ? rest : rest.slice(0, sp);
  const params = sp === -1 ? "" : rest.slice(sp + 1);
  return { tags, prefix, command, params };
}

function twitchBadges(tags) {
  const b = [];
  const badges = String(tags.badges || "");
  if (tags.mod === "1" || badges.includes("moderator/") || badges.includes("broadcaster/")) b.push("MOD");
  if (badges.includes("vip/")) b.push("VIP");
  if (tags.subscriber === "1" || badges.includes("subscriber/")) b.push("SUB");
  return b;
}

/** Парсит Twitch-emotes из тега emotes в части с URL картинок. */
function parseTwitchEmotes(text, emotesTag) {
  if (!emotesTag || typeof emotesTag !== "string") return null;
  const ranges = [];
  for (const part of emotesTag.split("/")) {
    const [id, list] = part.split(":");
    if (!id || !list) continue;
    for (const r of list.split(",")) {
      const [s, e] = r.split("-").map((n) => parseInt(n, 10));
      if (Number.isNaN(s) || Number.isNaN(e)) continue;
      ranges.push({ id, start: s, end: e });
    }
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const range of ranges) {
    if (range.start > pos) out.push({ type: "text", value: text.slice(pos, range.start) });
    const name = text.slice(range.start, range.end + 1);
    out.push({
      type: "emote",
      value: name,
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/2.0`,
    });
    pos = range.end + 1;
  }
  if (pos < text.length) out.push({ type: "text", value: text.slice(pos) });
  return out;
}

/* ---------------- онлайн (число зрителей) по площадкам ----------------
   Каждый fetcher возвращает: число — текущий онлайн; null — эфир не идёт;
   undefined — узнать не удалось (прежнее значение не трогаем). */

// Публичный client-id сайта twitch.tv: анонимный GQL-запрос без OAuth.
const TWITCH_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wqan6j5b";
const VIEWERS_POLL_MS = 30000;

function asCount(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === "string") {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return undefined;
    const n = Number(digits);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return undefined;
}

function findViewerCount(obj) {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj;
  const direct =
    asCount(o.viewers) ??
    asCount(o.viewer_count) ??
    asCount(o.viewerCount) ??
    asCount(o.viewersCount) ??
    asCount(o.currentViewers) ??
    asCount(o.liveViewers) ??
    asCount(o.chatter_count) ??
    asCount(o?.counters?.viewers) ??
    asCount(o?.streamInfo?.counters?.viewers) ??
    asCount(o?.data?.counters?.viewers) ??
    asCount(o?.data?.streamInfo?.counters?.viewers);
  if (direct !== undefined) return direct;
  for (const value of Object.values(o)) {
    if (value && typeof value === "object") {
      const nested = findViewerCount(value);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function looksOffline(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = obj;
  return o.isOnline === false || o.online === false || o.stream === null || o.streamInfo === null || o.livestream === null;
}

async function twitchViewers(login) {
  const channel = String(login || "").toLowerCase();
  // 1) Twitch GQL сайта — самый точный viewerCount.
  const data = await postJson(
    "https://gql.twitch.tv/gql",
    {
      query: "query($login:String!){user(login:$login){stream{viewersCount}}}",
      variables: { login: channel },
    },
    { "client-id": TWITCH_GQL_CLIENT_ID, origin: "https://www.twitch.tv", referer: "https://www.twitch.tv/" }
  );
  const gql = Array.isArray(data) ? data[0] : data;
  const user = gql?.data?.user;
  if (user?.stream === null) return null;
  const gqlCount = asCount(user?.stream?.viewersCount);
  if (gqlCount !== undefined) return gqlCount;

  // 2) IVR API — публичный community endpoint, часто работает когда GQL режет запросы.
  const ivr = await getJson(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(channel)}`, {
    accept: "application/json",
    referer: "https://www.twitch.tv/",
  });
  const ivrItem = Array.isArray(ivr) ? ivr[0] : ivr;
  const ivrCount = findViewerCount(ivrItem?.stream ?? ivrItem);
  if (ivrCount !== undefined) return ivrCount;
  if (looksOffline(ivrItem)) return null;

  // 3) Последний fallback — chatter_count TMI. Это не полный viewer_count, но лучше чем «…».
  const tmi = await getJson(`https://tmi.twitch.tv/group/user/${encodeURIComponent(channel)}/chatters`, {
    accept: "application/json",
    referer: "https://www.twitch.tv/",
  });
  const chatterCount = asCount(tmi?.chatter_count);
  if (chatterCount !== undefined) return chatterCount;

  return undefined;
}

async function kickViewers(slug) {
  const h = { referer: `https://kick.com/${slug}`, origin: "https://kick.com", accept: "application/json" };
  const live = await getJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/livestream`, h);
  if (live) {
    const n = live?.data?.viewer_count ?? live?.data?.viewers;
    if (typeof n === "number") return n;
    if (live.data === null) return null;
  }
  const info = await getJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, h);
  if (info) {
    const n = info?.livestream?.viewer_count;
    if (typeof n === "number") return n;
    if (info.livestream === null) return null;
  }
  return undefined;
}

async function vkViewers(channelId) {
  const id = String(channelId || "").replace(/^@/, "");
  const encoded = encodeURIComponent(id);
  const referer = `https://live.vkvideo.ru/${id}`;
  const urls = [
    // current VK Video Live endpoints
    `https://api.live.vkvideo.ru/v1/blog/${encoded}/public_video_stream?from=layer`,
    `https://api.live.vkvideo.ru/v1/blog/${encoded}/public_info`,
    `https://api.live.vkvideo.ru/v1/blog/${encoded}`,
    // legacy / mirror VK Play Live endpoints
    `https://api.vkplay.live/v1/blog/${encoded}/public_video_stream?from=layer`,
    `https://api.vkplay.live/v1/blog/${encoded}/public_info`,
    `https://api.vkplay.live/v1/blog/${encoded}`,
  ];
  for (const url of urls) {
    // eslint-disable-next-line no-await-in-loop
    const data = await getJson(url, { referer, accept: "application/json" });
    if (!data) continue;
    const n = findViewerCount(data);
    if (n !== undefined) return n;
    if (looksOffline(data)) return null;
  }
  return undefined;
}

async function tiktokViewers(username) {
  const room = await getJson(
    `https://www.tiktok.com/api-live/user/room?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(username)}`,
    { referer: `https://www.tiktok.com/@${username}`, accept: "application/json" }
  );
  const n = room?.data?.liveRoom?.liveRoomStats?.userCount ?? room?.data?.liveRoom?.userCount;
  return typeof n === "number" ? n : undefined;
}

class ConnectorManager {
  constructor({ settings, onChat, onStatus }) {
    /** Список каналов кешируется: обновления стекаются и отправляются в UI не чаще раза в секунду,
     *  чтобы бурст-обновления статусов (несколько каналов разом) не вызывали шквал ререндеров. */
    this._pendingStatus = null;
    this._statusTimer = null;
    this._statusDirty = false;
    this.settings = settings;
    this.onChat = onChat;
    this.onStatus = onStatus;
    this.channels = new Map();
    setDebug(() => {});
  }

  _wsCheck(url, { hello, okWhen, headers } = {}) {
    return new Promise((resolve) => {
      let ws;
      const done = (msg) => {
        try { if (ws) ws.terminate(); } catch { /* noop */ }
        resolve(msg);
      };
      const t = setTimeout(() => done("таймаут 8с"), 8000);
      try {
        ws = new WebSocket(url, headers ? { headers } : undefined);
      } catch (e) {
        clearTimeout(t);
        return resolve(String(e.message || e));
      }
      ws.on("open", () => {
        if (hello) {
          try { hello(ws); } catch { /* noop */ }
        } else {
          clearTimeout(t);
          done("OK (сокет открыт)");
        }
      });
      ws.on("message", (raw) => {
        const s = raw.toString();
        if (!okWhen || okWhen(s)) {
          clearTimeout(t);
          done("OK");
        }
      });
      ws.on("error", (e) => {
        clearTimeout(t);
        done(`ошибка: ${e.message || e}`);
      });
    });
  }

  /** Диагностика доступности площадок — вызывается кнопкой «Проверить сеть». */
  async diagnose() {
    this.emitSys("twitch", "Проверка сети (Electron-сеть vs Node-сеть)…");

    // Baseline: Electron net (Chromium)
    const ytNet = await request("https://www.youtube.com/", { timeout: 8000 });
    this.emitSys("youtube", `YouTube (Electron net): ${ytNet.ok ? "OK" : "нет"} (код ${ytNet.status || 0})`);

    // Сравнение: сырой Node https. Если Electron работает, а Node нет —
    // проблема в сетевом стеке Node (обычно системный прокси).
    const kickNode = await rawNodeHttps("https://kick.com/api/v2/channels/xqc");
    this.emitSys("kick", `Kick API (Node https): ${kickNode.ok ? "OK" : "нет"} (код ${kickNode.status || 0}${kickNode.error ? ", " + kickNode.error : ""})`);

    // WebSocket (ws) — тот путь, которым ходят Twitch/Kick/TikTok/VK
    const twitch = await this._wsCheck(TWITCH_WS, {
      hello: (ws) => {
        ws.send("PASS SCHMOOPIIFS");
        ws.send("NICK justinfan12345");
      },
      okWhen: (s) => / 001 |Welcome/i.test(s),
    });
    this.emitSys("twitch", `Twitch IRC: ${twitch}`);

    const kickHttp = await request("https://kick.com/api/v2/channels/xqc", { timeout: 8000 });
    this.emitSys("kick", `Kick API: ${kickHttp.ok ? "OK" : "нет"} (код ${kickHttp.status})`);

    const kickWs = await this._wsCheck(kickPusherUrl(KICK_PUSHER[0]), {
      headers: WS_HEADERS.headers,
    });
    this.emitSys("kick", `Kick чат (Pusher WS): ${kickWs}`);

    const vk = await request("https://live.vkvideo.ru/", { timeout: 8000 });
    this.emitSys("vk", `VK Video: ${vk.ok ? "OK" : "нет"} (код ${vk.status || 0}${vk.error ? ", " + vk.error : ""})`);

    const tt = await request("https://www.tiktok.com/robots.txt", { timeout: 8000 });
    this.emitSys("tiktok", `TikTok: ${tt.ok ? "OK" : "нет"} (код ${tt.status || 0}${tt.error ? ", " + tt.error : ""})`);

    this.emitSys("twitch", "Готово. Канал должен быть В ЭФИРЕ — иначе статус «офлайн», это не ошибка сети.");
  }

  key(c) {
    return `${c.platform}:${c.channelId}`;
  }

  list() {
    return [...this.channels.values()].map((e) => ({
      id: this.key(e.channel),
      platform: e.channel.platform,
      channelId: e.channel.channelId,
      status: e.status,
      // онлайн канала: число или null (неизвестен / не в эфире)
      viewers: typeof e.viewers === "number" && Number.isFinite(e.viewers) ? e.viewers : null,
    }));
  }

  /** Обновить онлайн канала; интерфейс и оверлей получают список каналов заново. */
  setViewers(entry, n) {
    const v = typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    if ((entry.viewers ?? null) === v) return;
    entry.viewers = v;
    this.emitStatus();
  }

  /** Периодический опрос онлайна, пока канал подключён. */
  _pollViewers(entry, fetcher, intervalMs = VIEWERS_POLL_MS) {
    if (entry.viewersTimer) { clearTimeout(entry.viewersTimer); entry.viewersTimer = null; }
    const tick = async () => {
      if (!entry.alive || entry.closing || entry.status !== "online") return;
      try {
        const n = await fetcher();
        if (!entry.alive || entry.closing) return;
        if (n !== undefined) this.setViewers(entry, n);
      } catch { /* noop */ }
      if (entry.alive && !entry.closing) entry.viewersTimer = setTimeout(tick, intervalMs);
    };
    tick();
  }

  _startViewers(entry) {
    const p = entry.channel.platform;
    const id = entry.channel.channelId.trim().replace(/^@/, "");
    let fetcher = null;
    if (p === "twitch") fetcher = () => twitchViewers(id);
    else if (p === "kick") fetcher = () => kickViewers(id.toLowerCase());
    else if (p === "vk") fetcher = () => vkViewers(id);
    else if (p === "tiktok") fetcher = () => tiktokViewers(id);
    else if (p === "youtube") fetcher = () => (entry.videoId ? yt.viewers(entry.videoId) : undefined);
    if (fetcher) this._pollViewers(entry, fetcher);
  }

  emitStatus() {
    if (this._statusTimer) return;
    this._statusTimer = setTimeout(() => {
      this._statusTimer = null;
      if (!this._statusDirty) return;
      this._statusDirty = false;
      this.onStatus(this.list());
    }, 200);
    this._statusDirty = true;
  }

  setStatus(entry, status) {
    if (entry.status === status) return;
    entry.status = status;
    this.emitStatus();
  }

  emitChat(platform, { author, text, color, badges, parts }) {
    if (!text) return;
    this.onChat({
      id: `c${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      platform,
      author: author || "зритель",
      text: String(text),
      color: color || NAME_COLORS[Math.floor(Math.random() * NAME_COLORS.length)],
      badges: badges || [],
      ts: Date.now(),
      sys: false,
      parts: parts || undefined,
    });
  }

  emitSys(platform, text) {
    this.onChat({
      id: `s${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      platform,
      author: "YawaChatHub",
      text,
      color: "#8b91a8",
      badges: [],
      ts: Date.now(),
      sys: true,
    });
  }

  startAll() {
    for (const c of this.settings.channels || []) this.add(c.platform, c.channelId, { silent: true });
    this.emitStatus();
  }

  add(platform, channelId, { silent } = {}) {
    const raw = String(channelId || "").trim();
    if (!raw) return;
    if (/^https?:\/\//i.test(raw) || raw.includes("/") || raw.includes("?") || raw.includes("&")) {
      this.emitSys(platform, "Введите только username канала, без ссылок");
      return;
    }
    const uname = raw.replace(/^@/, "");
    if (!/^[a-zA-Z0-9_.-]{2,40}$/.test(uname)) {
      this.emitSys(platform, "Некорректный username канала");
      return;
    }
    const normalized = platform === "tiktok" ? `@${uname}` : uname;
    const channel = { platform, channelId: normalized };
    const k = this.key(channel);
    if (this.channels.has(k)) return;

    const entry = { channel, status: "connecting", attempts: 0, alive: true };
    this.channels.set(k, entry);
    this.emitStatus();
    this._connect(entry);

    if (!silent) {
      this.settings.channels = (this.settings.channels || []).filter(
        (c) => !(c.platform === platform && c.channelId === normalized)
      );
      this.settings.channels.push({ platform, channelId: normalized });
      this._persist();
    }
  }

  remove(platform, channelId) {
    const k = `${platform}:${channelId}`;
    const entry = this.channels.get(k);
    if (!entry) return;
    entry.alive = false;
    this._teardown(entry);
    this.channels.delete(k);
    this.settings.channels = (this.settings.channels || []).filter(
      (c) => !(c.platform === platform && c.channelId === channelId)
    );
    this._persist();
    this.emitStatus();
  }

  stopAll() {
    if (this._statusTimer) { clearTimeout(this._statusTimer); this._statusTimer = null; }
    for (const entry of this.channels.values()) {
      entry.alive = false;
      this._teardown(entry);
    }
    this.channels.clear();
  }

  _persist() {
    try {
      require("./settings").saveSettings(this.settings);
    } catch {
      /* noop */
    }
  }

  _teardown(entry) {
    entry.closing = true;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    if (entry.viewersTimer) { clearTimeout(entry.viewersTimer); entry.viewersTimer = null; }
    this.setViewers(entry, null);
    if (entry.ping) { clearInterval(entry.ping); entry.ping = null; }
    if (entry.client && entry.client.disconnect) {
      try { entry.client.disconnect(); } catch { /* noop */ }
    }
    if (entry.ws) {
      try { entry.ws.removeAllListeners(); entry.ws.close(); } catch { /* noop */ }
      entry.ws = null;
    }
    if (entry.vkClient) {
      try { entry.vkClient.disconnect(); entry.vkClient.removeAllListeners?.(); } catch { /* noop */ }
      entry.vkClient = null;
    }
  }

  /** плановый повтор: статус «подключение», без спама в ленту */
  _retry(entry, delayMs, { note } = {}) {
    if (!entry.alive) return;
    this._teardown(entry);
    entry.attempts += 1;
    const wait = Math.min(delayMs * Math.min(entry.attempts, 6), 120000);
    if (note && entry.attempts <= 2) this.emitSys(entry.channel.platform, note);
    this.setStatus(entry, entry.attempts > 2 ? "error" : "connecting");
    entry.timer = setTimeout(() => {
      if (!entry.alive) return;
      this.setStatus(entry, "connecting");
      this._connect(entry);
    }, wait);
  }

  /** канал в эфире, но чат сейчас недоступен (стрим не идёт) */
  _offline(entry, seconds, note) {
    if (!entry.alive) return;
    this._teardown(entry);
    this.setStatus(entry, "offline");
    if (note && !entry.notifiedOffline) {
      entry.notifiedOffline = true;
      this.emitSys(entry.channel.platform, note);
    }
    entry.timer = setTimeout(() => {
      if (!entry.alive) return;
      this.setStatus(entry, "connecting");
      this._connect(entry);
    }, seconds * 1000);
  }

  _online(entry, note) {
    entry.attempts = 0;
    entry.notifiedOffline = false;
    if (entry.status !== "online") {
      this.setStatus(entry, "online");
      if (note) this.emitSys(entry.channel.platform, note);
      this._startViewers(entry);
    }
  }

  _connect(entry) {
    if (!entry.alive) return;
    entry.closing = false;
    const p = entry.channel.platform;
    if (p === "twitch") this._twitch(entry);
    else if (p === "youtube") this._youtube(entry);
    else if (p === "kick") this._kick(entry);
    else if (p === "tiktok") this._tiktok(entry);
    else if (p === "vk") this._vk(entry);
    else this.setStatus(entry, "offline");
  }

  /** Страховочный таймер: если за ms мс не наступил online — пробуем заново. */
  _armTimeout(entry, ms, note) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      if (!entry.alive || entry.status === "online") return;
      this._retry(entry, 8000, { note });
    }, ms);
  }

  /* ---------------- Twitch: анонимный IRC ---------------- */
  _twitch(entry) {
    const name = entry.channel.channelId.replace(/^#/, "").toLowerCase();
    let ws;
    try {
      ws = new WebSocket(TWITCH_WS);
    } catch {
      this._retry(entry, 8000, { note: `Twitch: не удалось открыть соединение (${name})` });
      return;
    }
    entry.ws = ws;
    this._armTimeout(entry, 15000, `Twitch: нет ответа от IRC (${name})`);

    ws.on("open", () => {
      const nick = `justinfan${10000 + Math.floor(Math.random() * 80000)}`;
      try {
        ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
        ws.send("PASS SCHMOOPIIFS");
        ws.send(`NICK ${nick}`);
        ws.send(`USER ${nick} 8 * :${nick}`);
        ws.send(`JOIN #${name}`);
      } catch { /* noop */ }
      entry.ping = setInterval(() => {
        try { ws.send("PING :tmi.twitch.tv"); } catch { /* noop */ }
      }, 60000);
    });

    ws.on("message", (raw) => {
      for (const line of raw.toString().split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          try { ws.send("PONG :tmi.twitch.tv"); } catch { /* noop */ }
          continue;
        }
        const msg = parseIrc(line);
        if (msg.command === "001" || msg.command === "JOIN" || msg.command === "366") {
          this._online(entry, `Канал подключён: Twitch / ${name}`);
          this._startViewers(entry);
          continue;
        }
        if (msg.command === "NOTICE" && /msg_channel_suspended|No such channel/i.test(msg.params)) {
          this._offline(entry, 120, `Twitch: канал ${name} недоступен`);
          continue;
        }
        if (msg.command !== "PRIVMSG") continue;

        const sp = msg.params.indexOf(" :");
        if (sp === -1) continue;
        const text = msg.params.slice(sp + 2);
        const login = (msg.prefix.split("!")[0] || "").replace(/^#/, "");
        const parts = parseTwitchEmotes(text, msg.tags.emotes);
        this.emitChat("twitch", {
          author: msg.tags["display-name"] || login,
          color: msg.tags.color || "",
          badges: twitchBadges(msg.tags),
          text,
          parts: parts || undefined,
        });
      }
    });

    ws.on("close", () => {
      if (!entry.alive || entry.closing) return;
      this._retry(entry, 8000, { note: `Twitch: соединение с ${name} потеряно` });
    });
    ws.on("error", () => {
      try { ws.close(); } catch { /* noop */ }
    });
  }

  /* ---------------- YouTube Live: без API-ключа ---------------- */
  async _youtube(entry) {
    const username = entry.channel.channelId.replace(/^@/, "");
    try {
      const videoId = await yt.findLiveVideoId(username);
      if (!entry.alive) return;
      if (!videoId) {
        this._offline(entry, 60, `YouTube: ${username} сейчас не в эфире`);
        return;
      }

      const session = await yt.openChat(videoId);
      if (!entry.alive) return;
      if (!session) {
        this._offline(entry, 45, `YouTube: чат трансляции ${username} закрыт`);
        return;
      }

      entry.videoId = videoId; // для опроса онлайна («смотрят сейчас»)
      this._online(entry, `Канал подключён: YouTube Live / ${username}`);
      let cont = session.continuation;
      let misses = 0;

      // FIX(3.1.5): YouTube отдаёт сообщения пачкой каждые ~4 секунды.
      // Раздаём их поочерёдно, равномерно распределяя по времени опроса,
      // чтобы лента шла живым потоком, а не рывками.
      const loop = async () => {
        if (!entry.alive) return;
        const res = await yt.poll({ ...session, continuation: cont });
        if (!entry.alive) return;
        if (!res) {
          misses += 1;
          if (misses >= 3) {
            this._retry(entry, 15000, { note: `YouTube: чат ${username} прервался` });
            return;
          }
          entry.timer = setTimeout(loop, 5000);
          return;
        }
        misses = 0;
        cont = res.continuation;

        const total = res.messages.length;
        const nextPoll = Math.max(res.timeoutMs || 4000, 2500);
        if (total <= 1) {
          for (const m of res.messages) {
            this.emitChat("youtube", { author: m.author, text: m.text, badges: m.badges, parts: m.parts });
          }
          entry.timer = setTimeout(loop, nextPoll);
          return;
        }

        // Промежуток между сообщениями = ~80% интервала до следующего опроса
        const gap = Math.max(120, Math.min(900, Math.floor((nextPoll * 0.8) / total)));
        res.messages.forEach((m, idx) => {
          setTimeout(() => {
            if (!entry.alive) return;
            this.emitChat("youtube", { author: m.author, text: m.text, badges: m.badges, parts: m.parts });
          }, idx * gap);
        });
        // Следующий опрос стартует после выхода последнего сообщения + небольшая задержка
        entry.timer = setTimeout(loop, total * gap + Math.max(400, nextPoll - total * gap));
      };
      loop();
    } catch {
      this._retry(entry, 15000, { note: `YouTube: ошибка чтения чата ${username}` });
    }
  }

  /* ---------------- Kick ---------------- */
  async _kick(entry) {
    const slug = entry.channel.channelId.trim().toLowerCase();
    try {
      let info = await getJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
        referer: `https://kick.com/${slug}`,
        origin: "https://kick.com",
        accept: "application/json",
      });
      if (!info) {
        info = await getJson(`https://kick.com/api/v1/channels/${encodeURIComponent(slug)}`, {
          referer: `https://kick.com/${slug}`,
        });
      }
      if (!entry.alive) return;

      const chatroomId = info?.chatroom?.id;
      if (!chatroomId) {
        this._offline(entry, 60, `Kick: канал ${slug} не найден или чат закрыт`);
        return;
      }

      this._online(entry, `Канал подключён: Kick / ${slug}`);
      if (typeof info?.livestream?.viewer_count === "number") this.setViewers(entry, info.livestream.viewer_count);
      this._kickPoll(entry, slug, chatroomId);
      this._kickPusher(entry, slug, chatroomId);
    } catch {
      this._retry(entry, 15000, { note: `Kick: ошибка подключения к ${slug}` });
    }
  }

  _kickHandleMessage(entry, slug, d) {
    if (!d) return;
    const text = d.content || d.message || "";
    if (!text) return;
    this._online(entry, `Канал подключён: Kick / ${slug}`);

    // Парсинг смайлов Kick: [emote:12345:name]
    let parts;
    const emoteRe = /\[emote:(\d+):([^\]]+)\]/g;
    if (emoteRe.test(text)) {
      parts = [];
      let lastIndex = 0;
      for (const match of text.matchAll(/\[emote:(\d+):([^\]]+)\]/g)) {
        if (match.index > lastIndex) {
          parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
        }
        parts.push({
          type: "emote",
          value: match[2],
          url: `https://files.kick.com/emotes/${match[1]}/fullsize`,
        });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        parts.push({ type: "text", value: text.slice(lastIndex) });
      }
    }

    this.emitChat("kick", {
      author: d.sender?.username || d.sender?.slug || d.username,
      color: d.sender?.identity?.color,
      text: text.replace(/\[emote:\d+:([^\]]+)\]/g, "$1"),
      parts,
    });
  }

  async _kickPoll(entry, slug, chatroomId) {
    const seen = new Set();
    // Документированный публичный эндпоинт сообщений: /channels/{chatroom_id}/messages
    const urls = [
      `https://kick.com/api/v2/channels/${chatroomId}/messages`,
      `https://kick.com/api/v2/chatrooms/${chatroomId}/messages`,
    ];
    let reported = false;
    const tick = async (initial) => {
      if (!entry.alive) return;
      let data = null;
      let lastStatus = 0;
      for (const url of urls) {
        // eslint-disable-next-line no-await-in-loop
        const r = await request(url, {
          timeout: 10000,
          headers: { referer: `https://kick.com/${slug}`, accept: "application/json" },
        });
        lastStatus = r.status;
        if (r.ok) {
          try { data = JSON.parse(r.body); } catch { data = null; }
        }
        if (data) break;
      }
      if (!entry.alive) return;

      if (!reported) {
        reported = true;
        const count =
          (data?.data?.messages && data.data.messages.length) ||
          (Array.isArray(data?.data) ? data.data.length : 0) ||
          (data?.messages && data.messages.length) || 0;
        this.emitSys("kick", `Kick: опрос сообщений — код ${lastStatus}, сообщений в ответе: ${count}`);
      }

      const list = data?.data?.messages || data?.data || data?.messages || [];
      const arr = Array.isArray(list) ? list : [];
      if (arr.length && entry.status !== "online") {
        this._online(entry, `Канал подключён: Kick / ${slug}`);
      }
      for (const msg of arr) {
        const id = String(msg.id ?? `${msg.created_at}-${msg.sender?.username}`);
        if (seen.has(id)) continue;
        seen.add(id);
        if (initial) continue;
        this._kickHandleMessage(entry, slug, msg);
      }
      if (seen.size > 400) {
        const keep = [...seen].slice(-200);
        seen.clear();
        for (const k of keep) seen.add(k);
      }
      entry.timer = setTimeout(() => tick(false), 2500);
    };
    tick(true);
  }

  _kickPusher(entry, slug, chatroomId) {
    const tryKey = (idx) => {
      if (!entry.alive || idx >= KICK_PUSHER.length) return;
      let ws;
      try {
        ws = new WebSocket(kickPusherUrl(KICK_PUSHER[idx]), WS_HEADERS);
      } catch {
        tryKey(idx + 1);
        return;
      }
      entry.ws = ws;
      ws.on("open", () => {
        try {
          ws.send(JSON.stringify({
            event: "pusher:subscribe",
            data: { auth: "", channel: `chatrooms.${chatroomId}.v2` },
          }));
          ws.send(JSON.stringify({
            event: "pusher:subscribe",
            data: { auth: "", channel: `chatrooms.${chatroomId}` },
          }));
        } catch { /* noop */ }
        entry.ping = setInterval(() => {
          try { ws.send(JSON.stringify({ event: "pusher:ping", data: {} })); } catch { /* noop */ }
        }, 60000);
      });
      ws.on("message", (raw) => {
        try {
          const ev = JSON.parse(raw.toString());
          if (String(ev.event || "").includes("subscription_succeeded")) {
            this._online(entry, `Канал подключён: Kick / ${slug}`);
            return;
          }
          if (String(ev.event || "").includes("ChatMessageEvent")) {
            const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
            this._kickHandleMessage(entry, slug, d);
          }
        } catch { /* noop */ }
      });
      ws.on("close", () => {
        if (!entry.alive || entry.closing) return;
        if (idx + 1 < KICK_PUSHER.length) tryKey(idx + 1);
      });
      ws.on("error", () => {
        try { ws.close(); } catch { /* noop */ }
      });
    };
    tryKey(0);
  }

  /* ---------------- TikTok Live ---------------- */
  async _tiktok(entry) {
    let username = String(entry.channel.channelId || "").trim();
    // Поддерживаем @name, name, name/live и https://www.tiktok.com/@name/live
    const fromUrl = username.match(/tiktok\.com\/@([^/?#]+)/i);
    username = (fromUrl ? fromUrl[1] : username).replace(/^@/, "").split(/[/?&#]/)[0].trim();
    if (!username) {
      this._offline(entry, 120, "TikTok: не указан username канала");
      return;
    }

    let mod;
    try {
      mod = require("tiktok-live-connector");
    } catch {
      mod = null;
    }
    const Conn = mod && (mod.TikTokLiveConnection || mod.WebcastPushConnection);
    if (!Conn) {
      this._offline(entry, 120, "TikTok: библиотека чата недоступна в этой сборке");
      return;
    }

    // Начальный онлайн — best effort (событие roomUser выдаст точное значение позже).
    let initialViewers;
    try {
      const room = await getJson(
        `https://www.tiktok.com/api-live/user/room?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(username)}`,
        { referer: `https://www.tiktok.com/@${username}`, accept: "application/json" }
      );
      const n = room?.data?.liveRoom?.liveRoomStats?.userCount;
      if (typeof n === "number") initialViewers = n;
    } catch { /* noop */ }

    let client;
    try {
      client = new Conn(username, {
        processInitialData: true,
        // FIX: fetchRoomInfoOnConnect бросает UserOfflineError, если канала нет в эфире —
        // именно это делает поиск эфира честным, а не «вечным подключением».
        fetchRoomInfoOnConnect: true,
        enableExtendedGiftInfo: false,
      });
    } catch {
      this._offline(entry, 60, `TikTok: не удалось создать подключение к @${username}`);
      return;
    }

    entry.client = {
      disconnect: () => {
        try { client.disconnect(); } catch { /* noop */ }
      },
    };

    client
      .connect()
      .then((state) => {
        if (!entry.alive) return;
        this._online(entry, `Канал подключён: TikTok Live / @${username}`);
        const viewers =
          (typeof state?.roomInfo?.liveRoomStats?.userCount === "number"
            ? state.roomInfo.liveRoomStats.userCount
            : undefined) ?? initialViewers;
        if (typeof viewers === "number") this.setViewers(entry, viewers);
      })
      .catch((e) => {
        if (!entry.alive) return;
        const offline = e?.name === "UserOfflineError" || e?.constructor?.name === "UserOfflineError";
        const msg = String(e?.message || e || "ошибка подключения").slice(0, 80);
        this._retry(entry, offline ? 60000 : 20000, {
          note: offline ? `TikTok: @${username} сейчас не в эфире` : `TikTok: @${username} — ${msg}`,
        });
      });

    // без error-обработчика EventEmitter бросает процесс с любой сетевой ошибкой коннектора
    client.on("error", () => {});

    // онлайн приходит событием roomUser — без дополнительных запросов
    client.on("roomUser", (d) => {
      if (!entry.alive) return;
      const n = d?.viewerCount ?? d?.viewer_count;
      if (typeof n === "number") this.setViewers(entry, n);
    });

    client.on("chat", (d) => {
      if (!entry.alive) return;
      // Совместимость фигуры сообщения: v1.x отдаёт плоские nickname/uniqueId,
      // v2.x — user{nickname, uniqueId}. Эмодзи v1 — плоские, v2 — вложенные.
      let parts;
      const emotes = Array.isArray(d?.emotes) ? [...d.emotes] : [];
      if (emotes.length && typeof d.comment === "string") {
        parts = [];
        emotes.sort((a, b) => (a?.placeInComment ?? 0) - (b?.placeInComment ?? 0));
        let lastIdx = 0;
        for (const e of emotes) {
          const at = e?.placeInComment ?? 0;
          const url = e?.emote?.image?.imageUrl ?? e?.emoteImageUrl ?? e?.image?.imageUrl ?? null;
          if (at > lastIdx) parts.push({ type: "text", value: d.comment.slice(lastIdx, at) });
          if (url) {
            parts.push({ type: "emote", value: e?.name || d.comment[at] || "emote", url });
          }
          lastIdx = at + 1;
        }
        if (lastIdx < d.comment.length) parts.push({ type: "text", value: d.comment.slice(lastIdx) });
        if (!parts.some((p) => p.type === "emote")) parts = undefined;
      }
      this.emitChat("tiktok", {
        author: d?.user?.nickname || d?.user?.uniqueId || d?.nickname || d?.uniqueId || "зритель",
        text: d?.comment || "",
        parts,
      });
    });
    client.on("streamEnd", () => {
      if (!entry.alive) return;
      this._offline(entry, 60, `TikTok: трансляция @${username} завершена`);
    });
    client.on("disconnected", () => {
      if (!entry.alive || entry.closing) return;
      this._retry(entry, 20000);
    });
  }

  async _vk(entry) {
    const channelId = entry.channel.channelId.trim().replace(/^@/, "");
    let VKPLMessageClient = null;
    try {
      const mod = await import("vklive-message-client");
      VKPLMessageClient = mod.default || mod.VKPLMessageClient;
    } catch (e) {
      this._offline(entry, 120, `VK Play: библиотека чата не загрузилась (${String(e.message || e).slice(0, 40)})`);
      return;
    }
    if (!VKPLMessageClient) {
      this._offline(entry, 120, "VK Play: библиотека чата недоступна в этой сборке");
      return;
    }

    // FIX(3.1.5): загружаем набор смайлов канала — без него :name: не превращается в картинку.
    // Кешируем в памяти на весь жизненный цикл подключения.
    const vkEmotes = new Map(); // name → url
    const loadVkEmotes = async () => {
      const endpoints = [
        `https://api.live.vkvideo.ru/v1/blog/${encodeURIComponent(channelId)}/smile/user_set/`,
        `https://api.vkplay.live/v1/blog/${encodeURIComponent(channelId)}/smile/user_set/`,
        // Глобальный набор смайлов (стандартные VK-смайлики)
        `https://api.live.vkvideo.ru/v1/smile/user_set/`,
        `https://api.vkplay.live/v1/smile/user_set/`,
      ];
      for (const url of endpoints) {
        // eslint-disable-next-line no-await-in-loop
        const data = await getJson(url, { referer: `https://live.vkvideo.ru/${channelId}` });
        const sets = data?.data?.sets || data?.sets || [];
        for (const set of sets) {
          for (const s of set?.smiles || []) {
            const link = s?.smallUrl || s?.mediumUrl || s?.largeUrl;
            if (s?.name && link) vkEmotes.set(String(s.name).toLowerCase(), link);
          }
        }
      }
    };
    loadVkEmotes().catch(() => {});

    let client;
    try {
      client = new VKPLMessageClient({
        auth: "readonly",
        channels: [channelId],
        debugLog: false,
        log: false,
      });
    } catch (e) {
      this._offline(entry, 60, `VK Play: не удалось создать подключение (${String(e.message || e).slice(0, 50)})`);
      return;
    }
    entry.vkClient = client;

    // Разбор текста в parts со смайлами.
    // FIX: десериализатор библиотеки вставляет имена смайлов в текст БЕЗ двоеточий,
    // поэтому прежний регексп /:name:/ не находил ничего и смайлы не отображались.
    // Теперь: реестр name→url из блоков сообщения и канала, и токенизация текста
    // с проверкой каждого слова (и варианта :слово:) по реестру.
    const buildVkParts = (text, smiles) => {
      const registry = new Map(vkEmotes);
      // Смайлы, пришедшие в самом сообщении, приоритетнее (в блоках есть smallUrl/mediumUrl)
      for (const s of smiles || []) {
        const link = s?.smallUrl || s?.mediumUrl || s?.largeUrl;
        if (s?.name && link) {
          registry.set(String(s.name).toLowerCase(), link);
          registry.set(`:${String(s.name).toLowerCase()}:`, link);
        }
      }
      if (!registry.size) return undefined;
      const parts = [];
      let buf = "";
      const flush = () => {
        if (buf) { parts.push({ type: "text", value: buf }); buf = ""; }
      };
      const tokens = String(text || "").split(/(\s+)/);
      for (const tok of tokens) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) { buf += tok; continue; }
        const plain = tok.toLowerCase();
        const stripped = plain.replace(/^:+|:+$/g, "");
        const url = registry.get(plain) || registry.get(stripped) || registry.get(`:${stripped}:`);
        if (url) {
          flush();
          parts.push({ type: "emote", value: stripped, url });
        } else {
          buf += tok;
        }
      }
      flush();
      const hasEmote = parts.some((p) => p.type === "emote");
      return hasEmote ? parts : undefined;
    };

    client.on("message", (ctx) => {
      if (!entry.alive) return;
      // Библиотека отдаёт десериализованное сообщение: готовый text + smiles[].
      const plainText = ctx?.message?.text || ctx?.message?.message || ctx?.text || "";
      const smiles = ctx?.message?.smiles || [];
      {
        if (!plainText) return;
        this._online(entry);
        const parts = buildVkParts(plainText, smiles);
        this.emitChat("vk", {
          author: ctx?.user?.nick || ctx?.user?.displayName || ctx?.message?.author?.displayName || "vk_viewer",
          text: plainText,
          parts,
        });
        return;
      }
      
      let textBuf = "";
      const parts = [];

      for (const b of blocks) {
        if (b.type === "text" || b.type === "link") {
          const val = Array.isArray(b.content) ? b.content[0] : b.content;
          textBuf += val || "";
        } else if (b.type === "mention") {
          textBuf += `@${b.displayName || b.nick || ""} `;
        } else if (b.type === "smile") {
          if (textBuf) {
            parts.push({ type: "text", value: textBuf });
            textBuf = "";
          }
          const url = b.smallUrl || b.mediumUrl || b.largeUrl;
          parts.push(url ? { type: "emote", value: b.name || "smile", url } : { type: "text", value: ` ${b.name || "smile"} ` });
        }
      }
      if (textBuf) parts.push({ type: "text", value: textBuf });

      const text = parts.map(p => p.type === "text" ? p.value : ` ${p.value} `).join("").trim();
      if (!text) return;

      this._online(entry);
      this.emitChat("vk", {
        author: ctx?.user?.nick || ctx?.user?.displayName || "vk_viewer",
        text,
        parts: parts.length > 0 ? parts : undefined,
      });
    });
    client.on("stream-status", (ctx) => {
      if (!entry.alive) return;
      if (ctx?.type === "stream_end") this._offline(entry, 60, `VK Play: трансляция ${channelId} завершена`);
    });
    client.on("channel-info", (ctx) => {
      if (!entry.alive) return;
      if (ctx?.isOnline || ctx?.streamInfo || ctx?.stream) this._online(entry, `Канал подключён: VK Play Live / ${channelId}`);
      const n = findViewerCount(ctx);
      if (n !== undefined) this.setViewers(entry, n);
    });

    try {
      await client.connect();
      this._online(entry, `Канал подключён: VK Play Live / ${channelId}`);
      this._startViewers(entry);
    } catch (e) {
      if (!entry.alive) return;
      const msg = String(e?.message || e || "unknown error").slice(0, 80);
      this._retry(entry, 20000, { note: `VK Play: ${channelId} — ${msg}` });
    }
  }
}

module.exports = { ConnectorManager };
