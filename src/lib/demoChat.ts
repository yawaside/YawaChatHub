import type { Channel, ChatMsg, MsgKind, PlatformId } from "./types";
import { nickColor, platformMeta } from "./platforms";

/**
 * Демо-симуляция чата. В WebView2-сборке вместо неё работают коннекторы
 * хоста (Twitch IRC, YouTube polling, Kick pusher, VK/TikTok вебсокеты),
 * которые шлют события той же формы через bridge.onEvent("chat.message").
 */

const AUTHORS = [
  "nekto_san", "kot1k_tv", "shadow_walker", "mIra_bel", "Xx_sniper_xX", "lazy_panda",
  "stream_hater228", "babka_na_ka4", "ultra_nagibator", "silent_k1lla", "popka_durak",
  "chill_guy", "wesna_life", "dump_raccoon", "pixel_hunter", "no_scope_anna",
  "grom_zeka", "tihiy_don", "karl_ok", "zloy_bananchik", "fast_food_fan", "gg_wp_ez",
];

const PHRASES = [
  "привет всем!", "как дела, стример?", "лучший стрим за сегодня", "ага, конечно))",
  "это было близко", "ГГ ВП", "клипую", "а катка после этой будет?", "Ф в чат",
  "почему ты так играешь лол", "красиво сделал", "изи катка", "наконец-то я попал на трансляцию",
  "погнали дальше", "ебуууууууууууууу", "давай донат чекнем", "а голос как озвучка?",
  "ждал этот стрим всю неделю", "кто с Твича?", "кто пришёл с ютуба ставь +", "бот отвечает быстрее тебя лол",
  "наконец нормальный пинг", "что за музыка играет?", "скинь ссылку на плейлист",
  "https://example.com/track глянь трек", "!команды", "!vk", "!donate", "W L W L",
  "первый раз тут, что за движ?", "АААААААААА", "красава, без шуток", "подписался с колокольчиком",
];

const SUB_PHRASES = ["оформил подписку!", "продлил подписку · 3 месяц", "продлил подписку · 7 месяцев", "оформил прайм!"];
const RAID_PHRASES = ["влетает с рейдом", "привёл рейд"];
const GIFT_PHRASES = ["подарил подписку ×1", "подарил подписки ×5", "подарил подписки ×10"];
const DONATE_TEXTS = [
  "спасибо за контент, держи на кофе",
  "привет из Питера! продолжай в том же духе",
  "на новый микрофон)",
  "давно смотрю, решил задонатить. Салам всему чату",
  "сыграй в онли ап после этой катки пж",
];
const CURRENCIES = ["₽", "₽", "$", "€"];

const BADGES = [["mod"], ["sub"], ["vip"], ["sub", "vip"], [], [], [], [], ["turbo"]];

/* хвосты со стикерами по площадкам (коды из src/lib/emotes.ts) */
const EMOTE_TRAILS: Record<PlatformId, string[]> = {
  twitch: [" :kappa:", " :lul:", " :kappa: :kappa:", " :4head:", " :pjsalt:", " :keepo:"],
  youtube: [" :fire:", " :100: :fire:", " :joy:", " :eyes: :eyes:", " :rocket:"],
  vkplay: [" :zap:", " :trophy:", " :game: :trophy:", " :heart:", " :salute:"],
  kick: [" :greenheart:", " :fire: :fire:", " :clown:", " :target:", " :zap: :zap:"],
  tiktok: [" :rose:", " :pleading: :joy:", " :sparkles:", " :dancer:", " :fire:"],
  donationalerts: [" :moneybag:", " :gift:", " :moneywings:", " :heart:"],
};

/* сообщения-стикеры: только эмоуты, рисуются крупно */
const STICKER_ONLY: Record<PlatformId, string[]> = {
  twitch: [":kappa:", ":lul: :lul:", ":kappa: :kappa: :kappa:", ":4head: :pjsalt:"],
  youtube: [":fire: :fire: :fire:", ":joy: :joy:", ":100:"],
  vkplay: [":zap: :zap:", ":trophy: :tada:", ":game:"],
  kick: [":greenheart: :greenheart:", ":fire:", ":clown: :clown:"],
  tiktok: [":rose: :rose:", ":sparkles: :fire:", ":pleading:"],
  donationalerts: [":moneybag:", ":gift: :gift:", ":heart:"],
};

let idSeq = 1;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function makeMessage(ch: Channel, kind?: MsgKind): ChatMsg {
  const author = pick(AUTHORS);
  const base: ChatMsg = {
    id: idSeq++,
    ts: Date.now(),
    platform: ch.platform,
    channel: ch.username,
    author,
    color: nickColor(author, platformMeta(ch.platform).color),
    text: pick(PHRASES),
    kind: kind ?? "chat",
    badges: pick(BADGES),
  };
  const k = base.kind;
  if (k === "donate") {
    base.text = pick(DONATE_TEXTS) + pick(EMOTE_TRAILS.donationalerts);
    base.amount = pick([50, 100, 150, 200, 300, 500, 1000]);
    base.currency = pick(CURRENCIES);
  } else if (k === "sub") {
    base.text = pick(SUB_PHRASES);
  } else if (k === "raid") {
    base.text = `${pick(RAID_PHRASES)} · ${50 + Math.floor(Math.random() * 900)} зрителей`;
  } else if (k === "gift") {
    base.text = pick(GIFT_PHRASES);
  } else if (k === "command") {
    base.text = pick(["!команды", "!вк", "!розыгрыш", "!song"]);
  } else {
    // обычный чат: иногда — стикер или хвост с эмоутами
    const roll = Math.random();
    if (roll < 0.07) base.text = pick(STICKER_ONLY[ch.platform] ?? STICKER_ONLY.twitch);
    else if (roll < 0.34) base.text += pick(EMOTE_TRAILS[ch.platform] ?? EMOTE_TRAILS.twitch);
  }
  return base;
}

export function makeSystem(text: string): ChatMsg {
  return {
    id: idSeq++,
    ts: Date.now(),
    platform: "twitch",
    channel: "",
    author: "",
    color: "",
    text,
    kind: "system",
  };
}

/** стартовый набор каналов для демонстрации */
export function seedChannels(): Channel[] {
  return [
    { id: "c1", platform: "twitch", username: "yawa", status: "online", viewers: 2213, messages: 0 },
    { id: "c2", platform: "youtube", username: "NeyraLive", status: "online", viewers: 1042, messages: 0 },
    { id: "c3", platform: "vkplay", username: "kra1n_38", status: "connecting", viewers: 0, messages: 0 },
    { id: "c4", platform: "kick", username: "m0nst3rz", status: "offline", viewers: 0, messages: 0 },
    { id: "c5", platform: "tiktok", username: "eda.s.volkov", status: "offline", viewers: 0, messages: 0 },
  ];
}

/**
 * Тик симуляции: с вероятностью возвращает новое сообщение и (иногда)
 * дрейф зрителей по онлайн-каналам.
 */
export function tickDemo(channels: Channel[]): { msg?: ChatMsg; drift: Map<string, number> } {
  const drift = new Map<string, number>();
  channels.forEach((c) => {
    if (c.status === "online" && Math.random() < 0.5) {
      const d = Math.floor(Math.random() * 41) - 18;
      drift.set(c.id, Math.max(3, c.viewers + d));
    }
  });

  const live = channels.filter((c) => c.status === "online");
  if (!live.length) return { drift };

  const roll = Math.random();
  const ch = pick(live);
  let msg: ChatMsg | undefined;

  if (ch.platform === "donationalerts" || roll < 0.9) {
    msg = makeMessage(ch);
  } else if (roll < 0.93) {
    msg = makeMessage(ch, "sub");
  } else if (roll < 0.95) {
    msg = makeMessage(ch, "gift");
  } else if (roll < 0.97) {
    const da = channels.find((c) => c.platform === "donationalerts");
    msg = makeMessage(da ?? ch, "donate");
  } else if (roll < 0.985) {
    msg = makeMessage(ch, "raid");
  } else {
    msg = makeMessage(ch, "command");
  }

  return { msg, drift };
}

export function randomScheduleDelay(): number {
  return 420 + Math.random() * 1600;
}

export function isValidUsername(raw: string): boolean {
  // ссылки отклоняются, только username
  if (/[\/\\:\s]|https?|\.(ru|com|tv|net|gg)\b/i.test(raw)) return false;
  // дефис допустим: у YouTube и VK Видео Live он часто есть в адресе канала
  return /^@?[a-zA-Z0-9_.-]{2,64}$/.test(raw.trim());
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "");
}
