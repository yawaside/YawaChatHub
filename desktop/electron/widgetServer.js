// Локальный сервер OBS-виджета: только 127.0.0.1, доступ по токену.
// FIX: если порт занят, не падаем main process, а автоматически ищем следующий.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

function makeServer({ token, onClient, widgetFile }) {
  const clients = new Set();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, clients: clients.size }));
      return;
    }
    if (url.pathname === "/widget" || url.pathname === "/") {
      fs.readFile(widgetFile, (err, buf) => {
        if (err) {
          res.writeHead(500);
          res.end("widget not found");
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(buf);
      });
      return;
    }

    // Статические ассеты виджета
    if (url.pathname.startsWith("/assets/")) {
      const rel = url.pathname.replace(/^\/assets\//, "").replace(/\.\.+/g, "");
      const filePath = path.join(__dirname, "..", "widget", "assets", rel);
      fs.readFile(filePath, (err, buf) => {
        if (err) { res.writeHead(404); res.end(); return; }
        const ext = path.extname(filePath).toLowerCase();
        const type =
          ext === ".png" ? "image/png" :
          ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
          ext === ".webp" ? "image/webp" :
          ext === ".svg" ? "image/svg+xml" : "application/octet-stream";
        res.writeHead(200, { "content-type": type, "cache-control": "public, max-age=3600" });
        res.end(buf);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  const state = { config: null };
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/ws" && url.searchParams.get("token") === token) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        clients.add(ws);
        if (onClient) onClient(clients.size);
        // сразу отдаём текущее оформление — виджет не ждёт следующего изменения
        if (state.config) {
          try { ws.send(JSON.stringify({ type: "config", ...state.config })); } catch { /* noop */ }
        }
        ws.on("close", () => {
          clients.delete(ws);
          if (onClient) onClient(clients.size);
        });
      });
    } else {
      socket.destroy();
    }
  });

  return { server, wss, clients, state };
}

function listenOn(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function startWidgetServer({ port, token, onClient, onPort, onWarn, maxPortTries = 20 }) {
  const widgetFile = path.join(__dirname, "..", "widget", "index.html");
  let state = null;
  let boundPort = port;

  for (let i = 0; i <= maxPortTries; i += 1) {
    const tryPort = port + i;
    const candidate = makeServer({ token, onClient, widgetFile });
    try {
      await listenOn(candidate.server, tryPort);
      state = candidate;
      boundPort = tryPort;
      break;
    } catch (err) {
      try {
        candidate.wss.close();
        candidate.server.close();
      } catch {
        /* noop */
      }
      if (err && err.code === "EADDRINUSE") continue;
      throw err;
    }
  }

  if (!state) {
    const warn = `Widget server: не удалось занять порт ${port}-${port + maxPortTries}`;
    if (onWarn) onWarn(warn);
    return {
      port: 0,
      url: "",
      ready: false,
      broadcast() {},
      sendConfig() {},
      close() {},
    };
  }

  if (boundPort !== port && onWarn) {
    onWarn(`Widget server: порт ${port} занят, выбран ${boundPort}`);
  }
  if (onPort) onPort(boundPort);

  return {
    ready: true,
    port: boundPort,
    url: `http://127.0.0.1:${boundPort}/widget?token=${token}`,

    broadcast(msg) {
      const data = JSON.stringify({ type: "chat", msg });
      for (const ws of state.clients) {
        if (ws.readyState === 1) ws.send(data);
      }
    },
    /** Мгновенно применяет настройки и стиль в уже открытом виджете OBS. */
    sendConfig(payload) {
      if (!payload) return;
      if (!payload.ttsPlay && !payload.ttsAudio) state.config = payload;
      const data = JSON.stringify({ type: "config", ...payload });
      for (const ws of state.clients) {
        if (ws.readyState === 1) ws.send(data);
      }
    },
    close() {
      for (const ws of state.clients) ws.close();
      state.server.close();
      state.wss.close();
    },
  };
}

module.exports = { startWidgetServer };
