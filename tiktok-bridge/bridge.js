/**
 * Коннектор TikTok LIVE для YawaChatHub.
 *
 * Порт рабочей реализации из YawaChat_Hub (desktop/electron/connectors.js,
 * метод `_tiktok`). Там этот путь проверен на живых эфирах, поэтому логика
 * повторена один в один:
 *
 *   1. Комната ищется ЗАРАНЕЕ через api-live/user/room. Авторитетным считается
 *      data.user.roomId; liveRoom.roomId может остаться от прошлого эфира,
 *      поэтому берётся только если API не сказал status=4 (offline).
 *   2. Если roomId найден — fetchRoomInfoOnConnect выключается, подключаемся
 *      сразу (экономит один запрос и обходит частые 404 на room info).
 *   3. Мягкий TLS-агент и для got (webClientOptions), и для ws
 *      (wsClientOptions). На машинах с антивирусом/TLS-инспекцией без него
 *      комната находится (онлайн виден), но push-сокет молчит и чата нет.
 *   4. Чат принимается ДВУМЯ путями: `decodedData` и `chat`. В v2 библиотека
 *      всегда сначала отдаёт decodedData(method, decoded) и лишь затем
 *      сопоставляет method со стандартным событием. На части сборок
 *      сопоставление WebcastChatMessage не срабатывает, хотя protobuf уже
 *      декодирован. WeakSet исключает дубль.
 *   5. Composite-ошибка «Failed to retrieve Room ID» = «не в эфире», а не
 *      технический сбой: переподключаемся раз в 60 с, а не раз в 20 с.
 *
 * Протокол с хостом (stdin/stdout, одна JSON-строка на событие):
 *   → {"type":"connect","user":"nick"}
 *   → {"type":"disconnect"}
 *   ← {"type":"ready","user":..,"roomId":..}
 *   ← {"type":"status","status":"online|connected|offline|error","viewers":N}
 *   ← {"type":"chat","author":..,"text":..}
 *   ← {"type":"event","kind":"gift|sub|share|join|like","author":..,"text":..,"amount":N}
 *   ← {"type":"log","message":".."}
 */
const https = require("https");
const { URL } = require("url");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let conn = null;
let currentTarget = null;
let retryTimer = null;
let cachedConnClass = null;
let connLoadError = "";

function send(obj) {
  try { process.stdout.write(JSON.stringify(obj) + "\n"); }
  catch { /* пайп закрыт */ }
}

function log(message) {
  send({ type: "log", message: String(message).slice(0, 400) });
}

function clearRetry() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

function disconnect() {
  clearRetry();
  if (!conn) return;
  const c = conn;
  conn = null;
  try {
    const r = typeof c.disconnect === "function" ? c.disconnect() : null;
    if (r && typeof r.catch === "function") r.catch(() => undefined);
  } catch { /* noop */ }
}

/**
 * Мягкий TLS-агент (аналог tlsOptionsFor из desktop/electron/net.js).
 * Антивирусы и корпоративные прокси подменяют сертификат webcast.tiktok.com;
 * со строгой проверкой ws-рукопожатие молча не проходит.
 */
function tlsOptions() {
  return {
    rejectUnauthorized: false,
    agent: new https.Agent({ rejectUnauthorized: false, keepAlive: true }),
    headers: { "User-Agent": UA },
  };
}

/** Автопоиск прокси из окружения — пользователь ничего не вводит. */
function detectProxy() {
  return process.env.HTTPS_PROXY || process.env.https_proxy
      || process.env.HTTP_PROXY  || process.env.http_proxy
      || null;
}

/**
 * Загрузка класса подключения. Имя класса менялось между версиями
 * (WebcastPushConnection → TikTokLiveConnection), поддерживаем оба —
 * ровно как resolveClass в референсной реализации.
 */
async function getConnectorClass() {
  if (cachedConnClass) return cachedConnClass;
  const resolveClass = (mod) =>
    mod?.TikTokLiveConnection || mod?.default?.TikTokLiveConnection ||
    mod?.WebcastPushConnection || mod?.default?.WebcastPushConnection || null;

  const errors = [];
  try {
    const C = resolveClass(require("tiktok-live-connector"));
    if (C) { cachedConnClass = C; return C; }
  } catch (e) { errors.push("require: " + (e?.code || e?.message || e)); }

  try {
    const C = resolveClass(await import("tiktok-live-connector"));
    if (C) { cachedConnClass = C; return C; }
  } catch (e) { errors.push("import: " + (e?.code || e?.message || e)); }

  connLoadError = errors.join(" | ");
  log("библиотека не загрузилась: " + connLoadError);
  return null;
}

/** Нормализация: @name, name, name/live, https://www.tiktok.com/@name/live. */
function normalizeUser(raw) {
  let username = String(raw || "").trim();
  const fromUrl = username.match(/tiktok\.com\/@([^/?#]+)/i);
  username = (fromUrl ? fromUrl[1] : username).replace(/^@/, "").split(/[/?&#]/)[0].trim();
  return username;
}

/** GET JSON через мягкий TLS — тот же путь, что у остальных площадок. */
function getJson(url, headers = {}) {
  return new Promise((resolve) => {
    let req;
    const done = (v) => { try { req?.destroy(); } catch { /* noop */ } resolve(v); };
    try {
      const u = new URL(url);
      req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "GET",
          rejectUnauthorized: false,
          timeout: 15000,
          headers: { "User-Agent": UA, accept: "application/json", ...headers },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => { body += c; if (body.length > 4e6) done(null); });
          res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
        }
      );
      req.on("error", () => done(null));
      req.on("timeout", () => done(null));
      req.end();
    } catch { resolve(null); }
  });
}

/**
 * Поиск активной комнаты и стартового онлайна.
 * Повторяет referenced-логику: data.user.roomId авторитетнее liveRoom.roomId,
 * status=4 означает, что эфира нет.
 */
async function discoverRoom(username) {
  const room = await getJson(
    `https://www.tiktok.com/api-live/user/room?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(username)}`,
    { referer: `https://www.tiktok.com/@${username}` }
  );

  const liveRoom = room?.data?.liveRoom;
  const userObj = room?.data?.user;
  const status = userObj?.status ?? liveRoom?.status;
  const rid = userObj?.roomId || liveRoom?.roomId || room?.data?.roomId;
  const users = liveRoom?.liveRoomStats?.userCount ?? liveRoom?.userCount;

  return {
    roomId: status !== 4 && rid && String(rid) !== "0" ? String(rid) : null,
    viewers: typeof users === "number" ? users : null,
  };
}

/** Собирает текст с инлайн-смайлами в формате рендерера: [[e|URL|имя]]. */
function buildText(d, comment) {
  const emotes = Array.isArray(d.emotes) ? [...d.emotes] : [];
  if (!emotes.length || typeof comment !== "string") return comment;

  const urlOf = (e) =>
    e?.emote?.image?.imageUrl ?? e?.emoteImageUrl ?? e?.image?.imageUrl ??
    (e?.image?.urlList || [])[0] ?? null;

  // Основной путь (как в референсе): смайл вставляется по позиции в тексте.
  const positional = emotes.filter((e) => typeof e?.placeInComment === "number");
  if (positional.length) {
    positional.sort((x, y) => x.placeInComment - y.placeInComment);
    let out = "";
    let lastIdx = 0;
    for (const emote of positional) {
      const at = emote.placeInComment;
      const url = urlOf(emote);
      if (at > lastIdx) out += comment.slice(lastIdx, at);
      if (url) {
        const name = emote?.name || emote?.emoteName || emote?.emoji || comment[at] || "emote";
        out += `[[e|${url}|${name}]]`;
      }
      lastIdx = at + 1;
    }
    if (lastIdx < comment.length) out += comment.slice(lastIdx);
    return out;
  }

  // Запасной путь: позиции нет, смайл задан полем emoji — меняем по тексту.
  let text = comment;
  for (const em of emotes) {
    const url = urlOf(em);
    if (!url || !em?.emoji) continue;
    text = text.split(em.emoji).join(`[[e|${url}|${em.emoji}]]`);
  }
  return text;
}

function authorOf(d) {
  const user = d?.user || d?.userInfo || d?.message?.user || {};
  return user.nickname || user.uniqueId || user.unique_id ||
    d?.nickname || d?.uniqueId || d?.unique_id || "зритель";
}

function scheduleRetry(user, delay, note) {
  clearRetry();
  if (note) log(note);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (currentTarget === user) connect(user);
  }, delay);
}

async function connect(rawUser) {
  disconnect();
  const username = normalizeUser(rawUser);
  currentTarget = username;

  if (!username) {
    log("TikTok: не указан username канала");
    send({ type: "status", status: "error", viewers: 0 });
    return;
  }

  const Conn = await getConnectorClass();
  if (!Conn) {
    send({ type: "status", status: "error", viewers: 0 });
    scheduleRetry(username, 60000, "TikTok: библиотека не загрузилась" +
      (connLoadError ? " — " + connLoadError.slice(0, 90) : ""));
    return;
  }

  // 1) ищем комнату заранее — это и проверка «в эфире ли канал»
  let discoveredRoomId = null;
  let initialViewers = null;
  try {
    const found = await discoverRoom(username);
    discoveredRoomId = found.roomId;
    initialViewers = found.viewers;
  } catch { /* noop */ }

  if (currentTarget !== username) return;

  const proxy = detectProxy();
  const wsClientOptions = { ...tlsOptions(), handshakeTimeout: 20000 };
  const webClientOptions = {
    // got: при TLS-перехвате не роняем запрос подписанного сокета
    https: { rejectUnauthorized: false },
    timeout: { request: 20000 },
    retry: { limit: 2 },
  };

  if (proxy) {
    log("прокси из окружения: " + proxy);
    try {
      const { HttpsProxyAgent } = require("https-proxy-agent");
      const agent = new HttpsProxyAgent(proxy, { rejectUnauthorized: false });
      webClientOptions.agent = { http: agent, https: agent };
      wsClientOptions.agent = agent;
    } catch (e) {
      log("прокси-агент не создан: " + (e?.message || e));
    }
  }

  let client;
  try {
    client = new Conn(username, {
      processInitialData: true,
      // если roomId уже найден, не тратим время на повторный запрос инфо
      fetchRoomInfoOnConnect: !discoveredRoomId,
      enableExtendedGiftInfo: false,
      webClientOptions,
      wsClientOptions,
    });
  } catch {
    send({ type: "status", status: "error", viewers: 0 });
    scheduleRetry(username, 60000, `TikTok: не удалось создать подключение к @${username}`);
    return;
  }
  conn = client;
  let streamEnded = false;

  /* ---------- диагностика push-сокета ----------
     Если «онлайн виден, но чат молчит» — по этому логу сразу понятно,
     дошли ли мы до websocket-рукопожатия. */
  client.on("websocketConnected", () => {
    log(`TikTok: чат-сокет подключён / @${username}`);
  });

  // без error-обработчика EventEmitter роняет процесс на любой сетевой ошибке
  client.on("error", (payload) => {
    const info = payload?.info || payload?.exception?.message || payload?.message || "";
    if (info) log("TikTok сокет: " + String(info).slice(0, 70));
  });

  // онлайн приходит событием roomUser — без дополнительных запросов
  client.on("roomUser", (d) => {
    const n = d?.viewerCount ?? d?.viewer_count ?? d?.total;
    if (typeof n === "number") send({ type: "status", status: "online", viewers: n });
  });

  /* ---------- чат: принимаем ОБА пути (decodedData + chat) ---------- */
  const seenChatObjects = new WeakSet();
  const emitTikTokChat = (payload) => {
    const d = payload?.data && payload?.type ? payload.data : payload;
    if (!d || typeof d !== "object") return;
    if (seenChatObjects.has(d)) return;
    seenChatObjects.add(d);

    const comment =
      d.comment ?? d.text ?? d.content ?? d.message?.comment ?? d.chatMessage?.comment ?? "";
    if (!String(comment).trim()) return;

    send({
      type: "chat",
      author: authorOf(d),
      text: String(buildText(d, String(comment))).slice(0, 1000),
    });
  };

  client.on("decodedData", (method, decoded) => {
    if (method === "WebcastChatMessage" || decoded?.type === "WebcastChatMessage") {
      emitTikTokChat(decoded);
    }
  });
  client.on("chat", emitTikTokChat);

  /* ---------- события эфира ---------- */
  client.on("gift", (d) => {
    const g = d?.giftDetails || d?.extendedGiftInfo || {};
    const name = g.giftName || d?.giftName || "подарок";
    const diamonds = Number(g.diamondCount ?? d?.diamondCount ?? 0);
    const repeat = Number(d?.repeatCount ?? 1);
    send({
      type: "event",
      kind: "gift",
      author: authorOf(d),
      text: repeat > 1 ? `отправил подарок «${name}» ×${repeat}` : `отправил подарок «${name}»`,
      amount: diamonds > 0 ? diamonds : undefined,
    });
  });

  client.on("social", (d) => {
    const t = String(d?.displayType || "");
    const author = authorOf(d);
    if (t.includes("follow")) send({ type: "event", kind: "sub", author, text: "подписался на канал" });
    else if (t.includes("share")) send({ type: "event", kind: "share", author, text: "поделился трансляцией" });
    else if (t.includes("join")) send({ type: "event", kind: "join", author, text: "присоединился к эфиру" });
  });

  client.on("member", (d) => {
    send({ type: "event", kind: "join", author: authorOf(d), text: "зашёл в эфир" });
  });

  client.on("like", (d) => {
    const total = Number(d?.totalLikeCount || 0);
    send({ type: "event", kind: "like", author: authorOf(d), text: `лайков на стриме: ${total}` });
  });

  client.on("streamEnd", () => {
    if (currentTarget !== username) return;
    streamEnded = true;
    send({ type: "status", status: "offline", viewers: 0 });
    scheduleRetry(username, 60000, `TikTok: трансляция @${username} завершена`);
  });

  client.on("disconnected", () => {
    if (currentTarget !== username || streamEnded) return;
    conn = null;
    send({ type: "status", status: "connected", viewers: 0 });
    scheduleRetry(username, 20000, `TikTok: сокет @${username} отключён, переподключаемся`);
  });

  /* ---------- подключение ---------- */
  client
    .connect(discoveredRoomId || undefined)
    .then((state) => {
      if (currentTarget !== username) return;
      log(`TikTok: подключено / @${username} (комната ${state?.roomId || discoveredRoomId || "?"})`);
      send({ type: "ready", user: username, roomId: String(state?.roomId || discoveredRoomId || "") });
      const viewers =
        (typeof state?.roomInfo?.liveRoomStats?.userCount === "number"
          ? state.roomInfo.liveRoomStats.userCount
          : undefined) ?? (typeof state?.roomInfo?.userCount === "number"
            ? state.roomInfo.userCount
            : undefined) ?? initialViewers ?? 0;
      send({ type: "status", status: "online", viewers: Number(viewers) || 0 });
    })
    .catch((e) => {
      if (currentTarget !== username) return;
      const offline = e?.name === "UserOfflineError" || e?.constructor?.name === "UserOfflineError";
      // composite = комнату не нашли ни одним источником → канал просто не в эфире,
      // а не технический сбой: не дёргаем переподключение каждые 20 секунд
      const composite = /Failed to retrieve Room ID|retrieve Room ID from all sources/i.test(
        String(e?.message || "")
      );
      const msg = String(e?.message || e || "ошибка подключения").slice(0, 80);
      const isOffline = offline || composite;

      conn = null;
      send({ type: "status", status: isOffline ? "offline" : "error", viewers: 0 });
      scheduleRetry(
        username,
        isOffline ? 60000 : 20000,
        isOffline ? `TikTok: @${username} сейчас не в эфире` : `TikTok: @${username} — ${msg}`
      );
    });
}

/* ---------- команды от хоста ---------- */

let buffer = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;

    let cmd;
    try { cmd = JSON.parse(line); } catch { continue; }

    if (cmd.type === "connect") {
      log("подключение: " + cmd.user);
      connect(String(cmd.user || "").trim());
    } else if (cmd.type === "disconnect") {
      currentTarget = null;
      disconnect();
      send({ type: "status", status: "connected", viewers: 0 });
    }
  }
});

process.stdin.on("end", () => { currentTarget = null; disconnect(); process.exit(0); });

process.on("uncaughtException", (err) => log("uncaught: " + (err?.message || err)));
process.on("unhandledRejection", (err) => log("unhandled: " + String(err)));

log("мост TikTok запущен");

module.exports = { normalizeUser, buildText, authorOf, discoverRoom };
