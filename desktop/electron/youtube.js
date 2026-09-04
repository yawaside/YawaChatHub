// YouTube Live Chat БЕЗ Data API и без ключа разработчика Google Cloud.
//
// Публичный INNERTUBE_KEY ниже — это не секрет и не ваш ключ: он зашит
// в каждую страницу youtube.com (клиент WEB) и используется самим сайтом.
const { getText, postJson } = require("./net");

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const CLIENT = { clientName: "WEB", clientVersion: "2.20241216.01.00", hl: "ru", gl: "RU" };

function findJson(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  let i = html.indexOf("{", at);
  if (i === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < html.length; j += 1) {
    const ch = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1] : "";
}

function walk(obj, fn, acc = []) {
  if (!obj || typeof obj !== "object") return acc;
  fn(obj, acc);
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walk(v, fn, acc);
  }
  return acc;
}

async function innertube(path, payload) {
  return postJson(
    `https://www.youtube.com/youtubei/v1/${path}?key=${INNERTUBE_KEY}&prettyPrint=false`,
    { context: { client: CLIENT }, ...payload },
    {
      origin: "https://www.youtube.com",
      referer: "https://www.youtube.com/",
      "x-youtube-client-name": "1",
      "x-youtube-client-version": CLIENT.clientVersion,
    }
  );
}

function extractLiveIdFromHtml(html) {
  if (!html || html.length < 2000) return "";
  let id = pick(html, /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  if (!id) id = pick(html, /"videoDetails":\{"videoId":"([\w-]{11})"/);
  if (!id) id = pick(html, /"videoId":"([\w-]{11})"[^}]*"isLiveNow":true/);
  if (!id) id = pick(html, /"videoId":"([\w-]{11})"/);
  if (!id) return "";
  const live =
    /"isLiveNow":true|"isLive":true|"liveBroadcastDetails":\{"isLiveNow":true|"style":"LIVE"|BADGE_STYLE_TYPE_LIVE_NOW/.test(
      html
    );
  return live ? id : "";
}

async function findLiveVideoId(username) {
  const name = String(username || "").replace(/^@/, "");

  const pages = [
    `https://www.youtube.com/@${name}/live`,
    `https://www.youtube.com/c/${name}/live`,
    `https://www.youtube.com/user/${name}/live`,
    `https://www.youtube.com/${name}/live`,
    `https://www.youtube.com/@${name}/streams`,
  ];
  for (const url of pages) {
    // eslint-disable-next-line no-await-in-loop
    const html = await getText(url, { referer: "https://www.youtube.com/" });
    const id = extractLiveIdFromHtml(html);
    if (id) return id;
    if (html) {
      const m = html.match(/"videoId":"([\w-]{11})"(?:(?!"videoId").)*?(?:"isLiveNow":true|"style":"LIVE"|LIVE_NOW)/s);
      if (m) return m[1];
    }
  }

  // Innertube-поиск «сейчас в эфире» — без HTML
  const search = await innertube("search", { query: name, params: "EgJAAQ==" });
  if (search) {
    const ids = walk(search, (node, acc) => {
      if (node.videoId && typeof node.videoId === "string" && node.videoId.length === 11) {
        const blob = JSON.stringify(node);
        if (/LIVE|isLiveNow|BADGE_STYLE_TYPE_LIVE/.test(blob)) acc.push(node.videoId);
      }
    });
    if (ids[0]) return ids[0];
  }

  return "";
}

function continuationFrom(obj) {
  const found = walk(obj, (node, acc) => {
    const c =
      node?.invalidationContinuationData?.continuation ||
      node?.timedContinuationData?.continuation ||
      node?.reloadContinuationData?.continuation ||
      node?.liveChatReplayContinuationData?.continuation ||
      "";
    if (c && c.length > 20) acc.push({
      continuation: c,
      timeoutMs: node?.invalidationContinuationData?.timeoutMs || node?.timedContinuationData?.timeoutMs || 4000,
    });
  });
  return found[0] || null;
}

async function openChat(videoId) {
  const html = await getText(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`, {
    referer: `https://www.youtube.com/watch?v=${videoId}`,
  });
  let key = html ? pick(html, /"INNERTUBE_API_KEY":"([^"]+)"/) : "";
  let clientVersion = html ? pick(html, /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) : "";
  let continuation = "";

  if (html) {
    const data = findJson(html, "ytInitialData");
    const c = continuationFrom(data) || continuationFrom({ raw: pick(html, /"continuation":"([^"]{20,})"/) });
    if (c) continuation = c.continuation;
    if (!continuation) continuation = pick(html, /"continuation":"([^"]{20,})"/);
  }

  if (!continuation) {
    const next = await innertube("next", { videoId });
    const c = continuationFrom(next);
    if (c) continuation = c.continuation;
  }

  if (!continuation) return null;
  return {
    key: key || INNERTUBE_KEY,
    clientVersion: clientVersion || CLIENT.clientVersion,
    continuation,
  };
}

function runsToText(message) {
  const runs = message?.runs || [];
  return runs
    .map((r) => {
      if (typeof r.text === "string") return r.text;
      const label = r?.emoji?.shortcuts?.[0] || r?.emoji?.emojiId || "";
      return label ? ` ${label} ` : "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEmotes(message) {
  const runs = message?.runs || [];
  const parts = [];
  let textBuf = "";
  for (const r of runs) {
    if (typeof r.text === "string") {
      textBuf += r.text;
    } else if (r.emoji) {
      if (textBuf) {
        parts.push({ type: "text", value: textBuf });
        textBuf = "";
      }
      const label = r.emoji.shortcuts?.[0] || r.emoji.emojiId || "emote";
      const url = r.emoji.image?.thumbnails?.[0]?.url || "";
      if (url) {
        parts.push({ type: "emote", value: label, url });
      } else {
        textBuf += ` ${label} `;
      }
    }
  }
  if (textBuf) parts.push({ type: "text", value: textBuf });
  return parts.length ? parts : undefined;
}

function parseActions(actions) {
  const out = [];
  for (const a of actions || []) {
    const item =
      a?.addChatItemAction?.item ||
      a?.replayChatItemAction?.actions?.[0]?.addChatItemAction?.item ||
      null;
    if (!item) continue;
    const text = item.liveChatTextMessageRenderer;
    const paid = item.liveChatPaidMessageRenderer;
    const r = text || paid;
    if (!r) continue;
    const author = r.authorName?.simpleText || "зритель";
    const body = runsToText(r.message) || (paid ? runsToText(paid.headerSubtext) : "");
    if (!body) continue;
    const parts = parseEmotes(r.message) || (paid ? parseEmotes(paid.headerSubtext) : undefined);
    const badges = [];
    for (const b of r.authorBadges || []) {
      const tip = b?.liveChatAuthorBadgeRenderer?.tooltip || "";
      if (/moderator|модератор/i.test(tip)) badges.push("MOD");
      else if (/member|спонсор|участник/i.test(tip)) badges.push("SUB");
      else if (/verified|owner|влад/i.test(tip)) badges.push("VIP");
    }
    if (paid) badges.push("GIFT");
    out.push({ author, text: body, badges, parts });
  }
  return out;
}

async function poll({ key, clientVersion, continuation }) {
  const data = await postJson(
    `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${key || INNERTUBE_KEY}&prettyPrint=false`,
    {
      context: { client: { ...CLIENT, clientVersion: clientVersion || CLIENT.clientVersion } },
      continuation,
    },
    {
      origin: "https://www.youtube.com",
      referer: "https://www.youtube.com/",
      "x-youtube-client-name": "1",
      "x-youtube-client-version": clientVersion || CLIENT.clientVersion,
    }
  );
  if (!data) return null;
  const lc = data?.continuationContents?.liveChatContinuation;
  if (!lc) return null;
  const next = continuationFrom(lc);
  return {
    messages: parseActions(lc.actions),
    continuation: (next && next.continuation) || continuation,
    timeoutMs: (next && next.timeoutMs) || 4000,
  };
}

/**
 * Текущий онлайн трансляции («смотрят сейчас») — без API-ключа, через
 * внутренний endpoint updated_metadata. Возвращает число, null (эфир завершён)
 * или undefined (не удалось узнать — прежнее значение не трогаем).
 */
async function viewers(videoId) {
  const data = await innertube("updated_metadata", { videoId });
  if (!data) return undefined;
  let result;
  let live = true;
  walk(data, (node) => {
    const r = node && node.videoViewCountRenderer;
    if (!r) return;
    if (r.isLive === false) live = false;
    const raw =
      r.originalViewCount ||
      (r.viewCount && r.viewCount.simpleText) ||
      (r.viewCount && Array.isArray(r.viewCount.runs) ? r.viewCount.runs.map((x) => x.text).join("") : "");
    const digits = String(raw || "").replace(/[^\d]/g, "");
    if (digits) result = Number(digits);
  });
  if (Number.isFinite(result)) return result;
  return live ? undefined : null;
}

module.exports = { findLiveVideoId, openChat, poll, viewers };
