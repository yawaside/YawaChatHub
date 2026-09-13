/**
 * Проверенный коннектор TikTok LIVE для YawaChatHub.
 *
 * Прокси определяется АВТОМАТИЧЕСКИ из переменных окружения
 * (HTTP_PROXY / HTTPS_PROXY / NO_PROXY) — ничего вводить не нужно.
 * Если VPN работает на уровне TUN-адаптера (WireGuard, OpenVPN, коммерческий VPN),
 * трафик идёт через VPN без каких-либо настроек.
 *
 * Протокол (stdin/stdout, одна JSON-строка на событие):
 *   → {"type":"connect","user":"nick"}
 *   → {"type":"disconnect"}
 *   ← {"type":"ready","user":..,"roomId":..}
 *   ← {"type":"status","status":"online|connected|offline|error","viewers":N}
 *   ← {"type":"chat","author":..,"text":..}
 *   ← {"type":"event","kind":"gift|sub|share|join|like","author":..,"text":..,"amount":N}
 *   ← {"type":"log","message":".."}
 */
const { TikTokLiveConnection, WebcastEvent } = require("tiktok-live-connector");

let conn = null;
let currentTarget = null;

function send(obj) {
  try { process.stdout.write(JSON.stringify(obj) + "\n"); }
  catch { /* пайп закрыт */ }
}

function log(message) {
  send({ type: "log", message: String(message).slice(0, 400) });
}

function disconnect() {
  if (!conn) return;
  const c = conn;
  conn = null;
  try { if (typeof c.disconnect === "function") c.disconnect().catch(() => undefined); }
  catch { }
}

/** Автопоиск прокси из окружения — пользователь ничего не вводит. */
function detectProxy() {
  return process.env.HTTPS_PROXY
      || process.env.https_proxy
      || process.env.HTTP_PROXY
      || process.env.http_proxy
      || null;
}

function connect(user) {
  disconnect();
  currentTarget = user;

  if (!user || !/^[A-Za-z0-9._]+$/.test(user)) {
    send({ type: "status", status: "error", viewers: 0 });
    return;
  }

  const proxy = detectProxy();

  let webClientOptions = { timeout: { request: 15000 } };
  let wsClientOptions = { handshakeTimeout: 15000 };

  if (proxy) {
    log("прокси из окружения: " + proxy);
    try {
      const { HttpsProxyAgent } = require("https-proxy-agent");
      const agent = new HttpsProxyAgent(proxy);
      webClientOptions.agent = { http: agent, https: agent };
      wsClientOptions.agent = agent;
    } catch (e) {
      log("прокси-агент не создан: " + e.message);
    }
  } else {
    // VPN на TUN-адаптере (WireGuard, OpenVPN, коммерческий) перехватывает весь трафик на уровне сети — Node.js ничего дополнительно настраивать не нужно.
    log("прокси из окружения не найден, подключаемся напрямую (VPN на TUN-адаптере работает прозрачно");
  }

  const c = new TikTokLiveConnection(user, {
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false,
    webClientOptions,
    wsClientOptions,
  });
  conn = c;

  /* ---------- чат ---------- */
  c.on(WebcastEvent.CHAT, (d) => {
    const author = d.user?.nickname || d.user?.uniqueId || "";
    const raw = String(d.content || d.comment || "");
    if (!raw) return;

    let text = raw;
    const emotes = Array.isArray(d.emotes) ? d.emotes : [];
    for (const em of emotes) {
      const url = (em.image?.urlList || [])[0];
      if (!url || !em.emoji) continue;
      text = text.split(em.emoji).join("[[e|" + url + "|" + em.emoji + "]]");
    }

    send({ type: "chat", author, text: text.slice(0, 500) });
  });

  /* ---------- подарки ---------- */
  c.on(WebcastEvent.GIFT, (d) => {
    const author = d.user?.nickname || d.user?.uniqueId || "";
    const g = d.giftDetails || {};
    const name = g.giftName || "подарок";
    const diamonds = Number(g.diamondCount || 0);
    const repeat = Number(d.repeatCount || 1);
    send({
      type: "event",
      kind: "gift",
      author,
      text: repeat > 1 ? `отправил подарок «${name}» ×${repeat}` : `отправил подарок «${name}»`,
      amount: diamonds > 0 ? diamonds : undefined,
    });
  });

  /* ---------- подписка / репост / вход ---------- */
  c.on(WebcastEvent.SOCIAL, (d) => {
    const author = d.user?.nickname || d.user?.uniqueId || "";
    const t = String(d.displayType || "");
    if (t.includes("follow")) send({ type: "event", kind: "sub", author, text: "подписался на канал" });
    else if (t.includes("share")) send({ type: "event", kind: "share", author, text: "поделился трансляцией" });
    else if (t.includes("join")) send({ type: "event", kind: "join", author, text: "присоединился к эфиру" });
  });

  c.on(WebcastEvent.MEMBER, (d) => {
    const author = d.user?.nickname || d.user?.uniqueId || "";
    send({ type: "event", kind: "join", author, text: "зашёл в эфир" });
  });

  c.on(WebcastEvent.LIKE, (d) => {
    const author = d.user?.nickname || d.user?.uniqueId || "";
    const total = Number(d.totalLikeCount || 0);
    send({ type: "event", kind: "like", author, text: `лайков на стриме: ${total}` });
  });

  c.on(WebcastEvent.ROOM_USER, (d) => {
    send({ type: "status", status: "online", viewers: Number(d.total || d.viewerCount || 0) });
  });

  c.on(WebcastEvent.STREAM_END, () => send({ type: "status", status: "offline", viewers: 0 }));
  c.on(WebcastEvent.DISCONNECT, () => send({ type: "status", status: "connected", viewers: 0 }));
  c.on(WebcastEvent.ERROR, (err) => log(err?.message || String(err)));

  /* ---------- подключение ---------- */
  c.connect()
    .then((state) => {
      const viewers = Number(state?.roomInfo?.userCount || 0);
      log(`подключено к комнате ${state?.roomId}`);
      send({ type: "ready", user, roomId: state?.roomId || "" });
      send({ type: "status", status: "online", viewers });
    })
    .catch((err) => {
      const msg = String(err?.message || err);
      log("ошибка: " + msg);

      const offline = /offline|isn.t online|not live|UserOffline/i.test(msg);
      const captcha = /captcha|blocked|DEVICE_BLOCKED|403/i.test(msg);
      const network = /timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|network|fetch failed|socket|EAI_AGAIN|getaddrinfo/i.test(msg);

      if (offline) {
        send({ type: "status", status: "offline", viewers: 0 });
        return;
      }
      if (captcha) {
        log("TikTok блокирует IP. Если VPN включён, попробуйте другой сервер.");
        send({ type: "status", status: "error", viewers: 0 });
        return;
      }
      if (network) {
        log("нет доступа к TikTok. Проверьте, что VPN включён.");
        send({ type: "status", status: "error", viewers: 0 });
        setTimeout(() => {
          if (!conn && currentTarget === user) {
            log("повтор...");
            connect(user);
          }
        }, 30000);
        return;
      }
      send({ type: "status", status: "error", viewers: 0 });
      setTimeout(() => {
        if (!conn && currentTarget === user) connect(user);
      }, 15000);
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

process.stdin.on("end", () => { disconnect(); process.exit(0); });

process.on("uncaughtException", (err) => log("uncaught: " + (err?.message || err)));
process.on("unhandledRejection", (err) => log("unhandled: " + String(err)));

log("мост TikTok запущен");
