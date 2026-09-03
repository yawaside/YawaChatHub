import { useCallback, useEffect, useRef, useState } from "react";

/* ================= platforms ================= */

export type PlatformId = "twitch" | "youtube" | "vk" | "kick" | "tiktok";

export interface PlatformMeta {
  id: PlatformId;
  label: string;
  short: string;
  spoken: string; // родительный падеж для TTS
  color: string;
  hint: string; // что вводить в поле «ID канала»
}

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  twitch: { id: "twitch", label: "Twitch", short: "TW", spoken: "Твича", color: "#a970ff", hint: "username канала (без ссылки)" },
  youtube: { id: "youtube", label: "YouTube Live", short: "YT", spoken: "Ютуба", color: "#ff4e45", hint: "@handle или username канала — API-ключ не нужен" },
  vk: { id: "vk", label: "VK Play Live", short: "VK", spoken: "ВК", color: "#4c8dff", hint: "username канала VK Play (без ссылки)" },
  kick: { id: "kick", label: "Kick", short: "KI", spoken: "Кика", color: "#53fc18", hint: "username канала (без ссылки)" },
  tiktok: { id: "tiktok", label: "TikTok Live", short: "TT", spoken: "ТикТока", color: "#ff3b5c", hint: "username или @username" },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);
export const PLATFORM_IDS: PlatformId[] = ["twitch", "youtube", "vk", "kick", "tiktok"];

export function randomPlatform(): PlatformId {
  return PLATFORM_IDS[Math.floor(Math.random() * PLATFORM_IDS.length)];
}

/* ================= chat model ================= */

export interface EmotePart {
  type: "text" | "emote";
  value: string;
  url?: string;
}

export interface ChatMsg {
  id: string;
  platform: PlatformId;
  author: string;
  color: string;
  badges: Array<"MOD" | "VIP" | "SUB" | "GIFT">;
  text: string;
  ts: number;
  sys?: boolean;
  parts?: EmotePart[];
  emotes?: Array<{ id: string; start: number; end: number }>;
}

const AUTHORS = [
  "neon_wolf", "KiraEX", "pixel_lisa", "d0nut", "GLHF_TV", "МаксимPlay",
  "crt_head", "retrowave_ru", "mila_lav", "frog_squad", "vanya_fps", "КиберДед",
  "shadowfox77", "ana_plays", "luna228", "podpivasnik", "sobaka_tv", "denchikOP",
  "quiet_owl", "hexvolt", "МияМи", "tema_city", "sad_keanu", "bezdina_online",
  "froggy", "KeksTV", "bolt_channel", "n1ght_ow1", "wisp_gg", "ОпытныйНуб",
];

const NAME_COLORS = [
  "#ff6b81", "#ffa94d", "#ffd43b", "#69db7c", "#3bc9db", "#4dabf7",
  "#9775fa", "#f783ac", "#63e6be", "#e599f7", "#74c0fc", "#b2f2bb",
];

const MESSAGES: string[] = [
  "привет из чата, как настроение?",
  "gg wp, красиво забрал последний раунд",
  "какой трек сейчас играет?",
  "!drop",
  "!points",
  "смотрю с работы, тихо и без звука",
  "ЛЕЕЕЕТС ГОООУ",
  "ф в чат для звука",
  "звук то появился? у меня тихо",
  "https://clips.twitch.tv/PerfectMoment — вот тут жёстко было",
  "первый раз тут, что происходит?",
  "когда кооп с чатом?",
  "спасибо за вчерашний розыгрыш!",
  "алерт не сработал, проверь настройки",
  "скинь настройки графики в тг t.me/yawachathub",
  "сколько уже часов катаешь?",
  "гг, на сегодня хватит, всем добра",
  "КАПС ВЫКЛЮЧИ ПОЖАЛУЙСТА",
  "чат живее всех живых",
  "опять лагает трансляция на ютубе",
  "на твиче картинка заметно лучше",
  "смотрю одновременно с вк и с кика, везде залетаю",
  "модератор молодец, чистит быстро",
  "эмодзи шторм в чат!!!",
  "пошёл за чаем, не скучайте",
  "задержка секунд пять, норм",
  "ЕЩЁ ОДНУ КАТКУ",
  "ладно, это была последняя",
  "ну теперь точно последняя",
  "микро сегодня чище, что поменял?",
  "апгрейд пк когда?",
  "видеокарта ещё жива после вчерашнего?",
  "выходные = марафон стримов",
  "кто ещё смотрит с телефона?",
  "лайк поставил, алгоритмы работайте",
  "сколько зрителей суммарно на всех площадках?",
  "соседи опять сверлят, сорри за фон",
  "/me танцует",
  "!play",
  "приветики из тиктока, залетела на огонёк",
  "кик грузит быстрее всех, факт",
  "кстати насчёт вчерашнего турнира: сетка была нечестной, судьи явно проглядели момент",
  "респект за упорство, смотрю уже третий год",
  "что за оверлей сверху? красиво выглядит",
  "это лучший момент стрима, клипуйте",
  "аааааааааааааааа",
  "ыыыыыыыыыы",
];

let seq = 0;

export function makeMessage(platform: PlatformId): ChatMsg {
  seq += 1;
  const author = AUTHORS[Math.floor(Math.random() * AUTHORS.length)];
  const badges: ChatMsg["badges"] = [];
  const r = Math.random();
  if (r < 0.05) badges.push("MOD");
  else if (r < 0.11) badges.push("VIP");
  else if (r < 0.28) badges.push("SUB");
  return {
    id: `m${seq}-${Date.now()}`,
    platform,
    author,
    color: NAME_COLORS[Math.floor(Math.random() * NAME_COLORS.length)],
    badges,
    text: MESSAGES[Math.floor(Math.random() * MESSAGES.length)],
    ts: Date.now(),
  };
}

export function makeSys(text: string, platform?: PlatformId): ChatMsg {
  seq += 1;
  return {
    id: `s${seq}-${Date.now()}`,
    platform: platform ?? "twitch",
    author: "YawaChatHub",
    color: "#8b91a8",
    badges: [],
    text,
    ts: Date.now(),
    sys: true,
  };
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ================= TTS ================= */

export interface TTSTemplate {
  author: boolean;
  platform: boolean;
  text: boolean;
}

export interface TTSFilters {
  /* базовые переключатели */
  links: boolean;
  commands: boolean;
  emoji: boolean;
  dedupe: boolean;
  maxLen: number;
  perMin: number;
  /* символы */
  maxCapsRatio: number; // 0..100
  squashRepeats: boolean;
  stripSymbols: boolean;
  minLen: number;
  /* списки */
  banWords: string[];
  maskWords: string[];
  banAuthors: string[];
  allowAuthors: string[];
  /** пользователь осознанно менял переключатель смайлов */
  emojiTouched?: boolean;
}

export const DEFAULT_FILTERS: TTSFilters = {
  links: true,
  commands: true,
  emoji: true, // смайлы НЕ озвучиваются по умолчанию
  dedupe: true,
  maxLen: 220,
  perMin: 24,
  maxCapsRatio: 65,
  squashRepeats: true,
  stripSymbols: true,
  minLen: 2,
  banWords: [],
  maskWords: [],
  banAuthors: [],
  allowAuthors: [],
};

/* ---------- пресеты банвордов ---------- */

export interface BanPreset {
  id: string;
  label: string;
  desc: string;
  platform?: PlatformId | "all";
  words: string[];
  mask?: string[];
  authors?: string[];
}

export const BAN_PRESETS: BanPreset[] = [
  {
    id: "base-ru",
    label: "Базовый (RU)",
    desc: "Мат, оскорбления и спам-конструкции на русском",
    platform: "all",
    words: [
      "сука", "бля", "хуй", "пизд", "ебан", "мраз", "чмо", "долбо", "тварь",
      "идиот", "дебил", "мудак", "гандон", "шлюх", "пидор", "ублюдок", "залуп",
      "сучка", "выблядок", "херня",
    ],
    mask: ["лох", "дурак", "тупой", "клоун", "барыга"],
  },
  {
    id: "base-en",
    label: "Базовый (EN)",
    desc: "Английский мат и токсичные слова",
    platform: "all",
    words: [
      "fuck", "shit", "bitch", "asshole", "cunt", "retard", "nigg", "faggot",
      "whore", "slut", "dickhead", "motherfucker", "bastard", "dumbass",
    ],
    mask: ["idiot", "stupid", "noob", "clown", "loser", "trash"],
  },
  {
    id: "twitch",
    label: "Twitch — боты и спам",
    desc: "Самореклама, накрутка зрителей и типовой спам Twitch-чата",
    platform: "twitch",
    words: [
      "cheap viewers", "buy viewers", "buy followers", "bigfollows", "streamboo",
      "best viewers", "viewbot", "viewer bot", "follow bot", "free followers",
      "followers and viewers", "get viewers", "хочешь зрителей", "купить зрителей",
      "накрутка зрителей", "зрителей на стрим", "подписчиков на twitch",
      "накрутить зрителей", "продвижение канала", "раскрутка стрима",
      "views4twitch", "twitchviewerbot", "useviewers",
    ],
    mask: ["реклама", "пиар"],
    authors: [
      "streamlabs", "nightbot", "streamelements", "moobot", "fossabot",
      "commanderroot", "wizebot", "sery_bot", "soundalerts", "buttsbot",
      "pretzelrocks", "dixper", "aliennetwork", "lurxx", "01ella",
      "d0nk7", "virgoproz", "kattops", "discord_for_streamers",
    ],
  },
  {
    id: "twitch-scam",
    label: "Twitch — разводы и скам",
    desc: "Фейковые дропы, скины, розыгрыши и фишинговые ссылки",
    platform: "twitch",
    words: [
      "free skins", "бесплатные скины", "забери скин", "drop.run", "cs2 drop",
      "csgo drop", "ezskins", "knife giveaway", "розыгрыш ножа", "бесплатный нож",
      "steam gift", "бесплатный steam", "bit.ly", "cutt.ly", "tinyurl", "t.co/",
      "goo.gl", "clck.ru", "зарегистрируйся и получи", "бонус за регистрацию",
      "выиграл в розыгрыше", "claim your prize", "забери приз", "проверь личные сообщения",
      "gift card", "steam-ключ бесплатно", "раздача ключей от",
    ],
    mask: ["скам", "развод"],
  },
  {
    id: "twitch-toxic",
    label: "Twitch — токсичность",
    desc: "Политика, срачи, оскорбления стримера и зрителей",
    platform: "twitch",
    words: [
      "сдохни", "килл yourself", "kys", "умри", "неудачник", "сын шлюхи",
      "ебало закрой", "заткнись", "убей себя", "стример хуесос", "лох позорный",
      "гыыы лох", "слит", "слитый", "пес", "слюни", "хохол", "москаль",
      "чурка", "хач", "нищий", "бомж",
    ],
    mask: ["тупица", "балбес"],
  },
  {
    id: "youtube",
    label: "YouTube Live",
    desc: "Крипто-спам, «раздачи» и накрутка YouTube",
    platform: "youtube",
    words: [
      "telegram", "whatsapp", "invest", "crypto", "airdrop", "giveaway bot",
      "заработок", "инвестиции", "казино", "заработай", "пассивный доход",
      "удвоение депозита", "сигналы по крипте", "x2 ваш депозит", "биржа начислила",
    ],
    authors: ["nightbot"],
  },
  {
    id: "kick",
    label: "Kick",
    desc: "Гэмблинг-спам и рефералки Kick",
    platform: "kick",
    words: [
      "stake.com", "csgoroll", "promo code", "bonus code", "gamble", "ставки",
      "промокод", "бонус", "free spins", "бесплатные спины", "депозит x2",
      "слоты дали", "залетай в казик", "казик", "slots", "rollbit",
    ],
    authors: ["botrix", "kickbot"],
  },
  {
    id: "tiktok",
    label: "TikTok Live",
    desc: "Накрутка, «подпишись взаимно» и попрошайничество",
    platform: "tiktok",
    words: [
      "подпишись взаимно", "взаимка", "follow4follow", "f4f", "sub4sub",
      "накрутка", "залетай ко мне", "взаимные подписки", "лайк за лайк",
      "гифты закину", "подарки взамен",
    ],
  },
  {
    id: "vk",
    label: "VK Video Live",
    desc: "Реклама групп, ссылки на паблики и «схемы»",
    platform: "vk",
    words: [
      "vk.cc", "подпишись на группу", "схема заработка", "приват", "залетай в лс",
      "темка рабочая", "без вложений", "менеджер напишет",
    ],
  },
  {
    id: "adult",
    label: "18+ и флирт",
    desc: "Откровенный контент, ссылки «для взрослых», приставания",
    platform: "all",
    words: [
      "onlyfans", "онлифанс", "only fans", "porn", "порно", "nudes", "нюдсы",
      "hot photos", "страпон", "секс чат", "интим", "фото без белья", "strip",
      "хочешь пообщаться в лс", "скинула фото", "залетай на вебку", "webcam model",
    ],
    mask: ["красотка", "детка"],
  },
  {
    id: "family",
    label: "Family-friendly",
    desc: "Максимально строгий набор: мат, 18+, алкоголь, ставки",
    platform: "all",
    words: [
      "сука", "бля", "хуй", "пизд", "ебан", "fuck", "shit", "bitch",
      "порно", "porn", "18+", "ставк", "казино", "букмекер", "наркот", "бухл",
      "пиво", "водка", "травка", "вейп", "сигарет",
    ],
    mask: ["лох", "тупой", "дурак", "stupid"],
  },
];

/* ---------- применение / отмена пресетов ----------
 * FIX(фильтры): состояние «пресет применён» ВЫВОДИТСЯ из списков —
 * пресет считается применённым, только если все его слова/замены/авторы
 * реально присутствуют в списках. */

function containsAll(list: string[], items: string[]): boolean {
  if (!items.length) return true;
  const low = list.map((x) => x.toLowerCase());
  return items.every((w) => low.includes(w.toLowerCase()));
}

export function isPresetApplied(p: BanPreset, f: TTSFilters): boolean {
  return (
    containsAll(f.banWords, p.words) &&
    containsAll(f.maskWords, p.mask ?? []) &&
    containsAll(f.banAuthors, p.authors ?? [])
  );
}

function mergeUnique(list: string[], items: string[]): string[] {
  const low = list.map((x) => x.toLowerCase());
  const add = items.filter((w) => w && !low.includes(w.toLowerCase()));
  return add.length ? [...list, ...add] : list;
}

function removeAll(list: string[], items: string[]): string[] {
  if (!items.length) return list;
  const del = new Set(items.map((w) => w.toLowerCase()));
  return list.filter((w) => !del.has(w.toLowerCase()));
}

/** применить пресет: добавить его элементы в списки */
export function applyPreset(f: TTSFilters, p: BanPreset): TTSFilters {
  return {
    ...f,
    banWords: mergeUnique(f.banWords, p.words),
    maskWords: mergeUnique(f.maskWords, p.mask ?? []),
    banAuthors: mergeUnique(f.banAuthors, p.authors ?? []),
  };
}

/** отменить пресет: убрать ровно его элементы из списков */
export function unapplyPreset(f: TTSFilters, p: BanPreset): TTSFilters {
  return {
    ...f,
    banWords: removeAll(f.banWords, p.words),
    maskWords: removeAll(f.maskWords, p.mask ?? []),
    banAuthors: removeAll(f.banAuthors, p.authors ?? []),
  };
}

/* ---------- обработка текста ---------- */

const LINK_RE = /(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:ru|com|net|org|tv|io|me|cc)\/\S*/gi;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
const JUNK_RE = /[^\p{L}\p{N}\s.,!?;:'"()\-—]/gu;

function stripPlatformEmotes(msg: ChatMsg): string {
  if (msg.parts?.length) {
    return msg.parts.filter((p) => p.type === "text").map((p) => p.value).join(" ");
  }
  if (msg.emotes?.length) {
    const sorted = [...msg.emotes].sort((a, b) => b.start - a.start);
    let next = msg.text;
    for (const e of sorted) {
      next = `${next.slice(0, e.start)} ${next.slice(e.end + 1)}`;
    }
    return next;
  }
  return msg.text;
}

function capsRatio(s: string): number {
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters.length < 6) return 0;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return (upper / letters.length) * 100;
}

function hasWord(haystack: string, list: string[]): boolean {
  if (!list.length) return false;
  const low = haystack.toLowerCase();
  return list.some((w) => w && low.includes(w.toLowerCase()));
}

export function buildSpeechText(
  msg: ChatMsg,
  t: TTSTemplate,
  f: TTSFilters,
  dedupe: Map<string, { text: string; at: number }>
): string | null {
  const author = msg.author.toLowerCase();
  if (f.allowAuthors.length && !f.allowAuthors.some((a) => a.toLowerCase() === author)) return null;
  if (f.banAuthors.some((a) => a.toLowerCase() === author)) return null;

  if (f.commands && /^[!/]/.test(msg.text.trim())) return null;
  if (msg.text.length > f.maxLen) return null;

  let text = f.emoji ? stripPlatformEmotes(msg) : msg.text;

  if (hasWord(text, f.banWords)) return null;

  if (f.links) text = text.replace(LINK_RE, "ссылка");
  if (f.emoji) {
    text = text
      .replace(EMOJI_RE, "")
      .replace(/\[emote:\d+:[^\]]+\]/gi, "")
      .replace(/:[a-z0-9_\-]+:/gi, "")
      .replace(/\b(?:Kappa|PogChamp|LUL|KEKW|OMEGALUL|Pepega|monkaS)\b/gi, "");
  }
  if (f.stripSymbols) text = text.replace(JUNK_RE, " ");

  for (const w of f.maskWords) {
    if (!w) continue;
    text = text.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "пип");
  }

  if (f.squashRepeats) text = text.replace(/(.)\1{2,}/gu, "$1$1");
  if (f.maxCapsRatio < 100 && capsRatio(text) > f.maxCapsRatio) text = text.toLowerCase();

  text = text.replace(/\s+/g, " ").trim();
  if (text.length > f.maxLen) return null;
  if (!text || text.length < f.minLen) return null;

  if (f.dedupe) {
    const prev = dedupe.get(msg.author);
    const now = Date.now();
    if (prev && prev.text === text && now - prev.at < 45000) return null;
    dedupe.set(msg.author, { text, at: now });
  }

  const parts: string[] = [];
  if (t.author || t.platform) {
    let who = t.author ? msg.author : "Зритель";
    if (t.platform) who += ` с ${PLATFORMS[msg.platform].spoken}`;
    parts.push(`${who} говорит`);
  }
  parts.push(text);
  return parts.join(": ");
}

/* ================= speech engine ================= */

interface SpeakItem {
  id: string;
  label: string;
  text: string;
}

export function useSpeechEngine() {
  // В desktop-режиме озвучиваем системными голосами Windows (SAPI) через мост,
  // на сайте — через Web Speech API браузера.
  const spTts =
    typeof window !== "undefined"
      ? ((window as unknown as { sp?: { tts?: {
          speak: (p: { text: string; rate: number; volume: number; voice?: string }) => string;
          skip: () => void;
          stopAll: () => void;
          voices: () => Promise<string[]>;
          onEnd: (cb: (id: string) => void) => void;
        } } }).sp?.tts ?? null)
      : null;
  const supported = !!spTts || (typeof window !== "undefined" && "speechSynthesis" in window);

  const [enabled, setEnabledState] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [template, setTemplate] = useState<TTSTemplate>({ author: true, platform: true, text: true });
  const [filters, setFilters] = useState<TTSFilters>(DEFAULT_FILTERS);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(0.9);
  const [voiceURI, setVoiceURI] = useState("");
  const [obsTts, setObsTts] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [queueSize, setQueueSize] = useState(0);
  const [now, setNow] = useState<SpeakItem | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [spokenMinute, setSpokenMinute] = useState(0);

  const q = useRef<SpeakItem[]>([]);
  const speaking = useRef(false);
  const pendingBridge = useRef<string | null>(null);
  const times = useRef<number[]>([]);
  const dedupe = useRef(new Map<string, { text: string; at: number }>());

  const cfg = useRef({ enabled, paused, template, filters, rate, volume, voiceURI, obsTts });
  cfg.current = { enabled, paused, template, filters, rate, volume, voiceURI, obsTts };
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  voicesRef.current = voices;

  /* голоса */
  useEffect(() => {
    if (spTts) {
      spTts.voices().then((names) => {
        if (!names.length) return;
        const vs = names.map(
          (n) =>
            ({ voiceURI: n, name: n, lang: "ru-RU", default: false, localService: true }) as SpeechSynthesisVoice
        );
        setVoices(vs);
        setVoiceURI((cur) => cur || names.find((n) => /ru|рус|russian|irina/i.test(n)) || names[0]);
      });
      return;
    }
    if (!supported) return;
    const load = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length) {
        setVoices(vs);
        setVoiceURI((cur) => {
          if (cur) return cur;
          const ru = vs.find((v) => v.lang.toLowerCase().startsWith("ru"));
          return (ru ?? vs[0]).voiceURI;
        });
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  const process = useCallback(() => {
    if (!supported || speaking.current) return;
    if (!cfg.current.enabled || cfg.current.paused) return;
    const item = q.current.shift();
    if (!item) {
      setQueueSize(0);
      return;
    }
    setQueueSize(q.current.length);
    speaking.current = true;
    setNow(item);

    // OBS-аудио: фразу произносит Browser Source, поэтому OBS может управлять
    // громкостью через «Управлять аудио через OBS».
    if (cfg.current.obsTts && typeof window !== "undefined" && (window as any).sp) {
      (window as any).sp.widgetConfig?.({
        ttsPlay: {
          id: item.id,
          text: item.text,
          rate: cfg.current.rate,
          volume: cfg.current.volume,
          voice: cfg.current.voiceURI || undefined,
        },
      });
      const ms = Math.max(1200, Math.min(12000, item.text.length * 75));
      window.setTimeout(() => {
        speaking.current = false;
        setNow(null);
        process();
      }, ms);
      return;
    }

    if (spTts) {
      pendingBridge.current = spTts.speak({
        text: item.text,
        rate: cfg.current.rate,
        volume: cfg.current.volume,
        voice: cfg.current.voiceURI || undefined,
      });
      return;
    }
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = "ru-RU";
    u.rate = cfg.current.rate;
    u.volume = cfg.current.volume;
    const v = voicesRef.current.find((x) => x.voiceURI === cfg.current.voiceURI);
    if (v) u.voice = v;
    const done = () => {
      speaking.current = false;
      setNow(null);
      window.setTimeout(process, 160);
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  useEffect(() => {
    if (!spTts) return;
    spTts.onEnd((id) => {
      if (pendingBridge.current !== id) return;
      pendingBridge.current = null;
      speaking.current = false;
      setNow(null);
      window.setTimeout(process, 160);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process]);

  const enqueue = useCallback(
    (msg: ChatMsg) => {
      if (msg.sys) return; // не озвучиваем системные сообщения (подключения, отключения и т.д.)
      if (!supported || !cfg.current.enabled) return;
      const f = cfg.current.filters;
      const text = buildSpeechText(msg, cfg.current.template, f, dedupe.current);
      if (!text) {
        setSkipped((s) => s + 1);
        return;
      }
      const nowT = Date.now();
      times.current = times.current.filter((t) => nowT - t < 60000);
      if (times.current.length >= f.perMin) {
        setSkipped((s) => s + 1);
        setSpokenMinute(times.current.length);
        return;
      }
      times.current.push(nowT);
      setSpokenMinute(times.current.length);
      q.current.push({ id: msg.id, label: `${msg.author}: ${msg.text}`, text });
      if (q.current.length > 12) {
        q.current.shift();
        setSkipped((s) => s + 1);
      }
      setQueueSize(q.current.length);
      process();
    },
    [process, supported]
  );

  const setEnabled = useCallback(
    (v: boolean) => {
      // ref меняем синхронно: новое сообщение может прийти раньше следующего рендера.
      cfg.current.enabled = v;
      setEnabledState(v);
      if (v && supported) {
        if (!spTts) window.speechSynthesis.resume();
        window.setTimeout(process, 50);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [process, supported]
  );

  const setPaused = useCallback(
    (v: boolean) => {
      cfg.current.paused = v;
      setPausedState(v);
      if (!supported) return;
      if (spTts) {
        if (v) spTts.stopAll();
        else window.setTimeout(process, 50);
        return;
      }
      if (v) window.speechSynthesis.pause();
      else {
        window.speechSynthesis.resume();
        window.setTimeout(process, 50);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [process, supported]
  );

  const skip = useCallback(() => {
    if (!supported) return;
    if (spTts) {
      spTts.skip();
      return;
    }
    window.speechSynthesis.cancel();
    window.setTimeout(() => {
      if (speaking.current) {
        speaking.current = false;
        setNow(null);
        process();
      }
    }, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process, supported]);

  const clearQueue = useCallback(() => {
    q.current = [];
    setQueueSize(0);
  }, []);

  const test = useCallback(
    (phrase?: string) => {
      if (!supported || !cfg.current.enabled) return;
      q.current.unshift({
        id: `test-${Date.now()}`,
        label: "Тестовая фраза",
        text: phrase || "Проверка связи. Ява чат хаб на связи.",
      });
      if (spTts) {
        spTts.skip();
        pendingBridge.current = null;
      } else {
        window.speechSynthesis.cancel();
      }
      speaking.current = false;
      setNow(null);
      window.setTimeout(process, 120);
    },
    [process, supported]
  );

  /**
   * Прослушать конкретный голос без сохранения настроек и без включения озвучки.
   * Работает даже когда общая озвучка выключена — используется в списке голосов.
   */
  const preview = useCallback(
    async (voice: string, phrase?: string) => {
      if (!supported) return { ok: false, error: "Синтез речи недоступен" };
      const text = phrase || "Проверка связи. Ява чат хаб на связи.";

      // SAPI / desktop
      if (spTts) {
        spTts.speak({
          text,
          rate: cfg.current.rate,
          volume: cfg.current.volume,
          voice: voice || undefined,
        });
        return { ok: true };
      }

      // Web Speech API (сайт)
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ru-RU";
        u.rate = cfg.current.rate;
        u.volume = cfg.current.volume;
        const v = voicesRef.current.find((x) => x.voiceURI === voice);
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
        return { ok: true };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message || "Ошибка синтеза" };
      }
    },
    [supported]
  );

  useEffect(() => {
    return () => {
      if (spTts) spTts.stopAll();
      else if (supported) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  return {
    supported,
    enabled, setEnabled,
    paused, setPaused,
    template, setTemplate,
    filters, setFilters,
    rate, setRate,
    volume, setVolume,
    voiceURI, setVoiceURI,
    obsTts, setObsTts,
    voices,
    queueSize,
    now,
    skipped, setSkipped,
    spokenMinute,
    enqueue, skip, clearQueue, test, preview,
  };
}

export type SpeechEngine = ReturnType<typeof useSpeechEngine>;
