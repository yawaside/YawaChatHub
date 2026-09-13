import { useState } from "react";
import { FlaskConical, Plus, ShieldCheck, Trash2, UserCheck, UserX, Wand2 } from "lucide-react";
import type { PlatformId, TtsConfig } from "../../lib/types";
import { PLATFORMS, PlatformIcon } from "../../lib/platforms";
import { usePersisted } from "../../lib/persist";
import { Box, Chip, Slider, TextInput, ToggleRow } from "./ui";

type Scope = PlatformId | "common";

const PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "profanity", label: "Мат и оскорбления", hint: "встроенный словарь" },
  { id: "spam", label: "Спам и реклама", hint: "повторяющиеся предложения купить/подписаться" },
  { id: "links", label: "Ссылки", hint: "http, домены, IP-адреса" },
  { id: "flood", label: "Флуд", hint: "одинаковые сообщения и символы подряд" },
  { id: "raids", label: "Рейд-волны", hint: "массовые одинаковые фразы" },
];

interface Props {
  tts: TtsConfig;
  patch: (p: Partial<TtsConfig>) => void;
}

export default function FiltersPanel({ tts, patch }: Props) {
  const [scope, setScope] = useState<Scope>("common");
  const [enabledPresets, setEnabledPresets] = usePersisted<Record<string, string[]>>(
    "filterPresets",
    { common: ["profanity", "links"], twitch: ["spam"], youtube: [], kick: [], tiktok: [], vkplay: [] }
  );
  const [ownWords, setOwnWords] = usePersisted<{ word: string; mode: "skip" | "beep" }[]>("ownWords", []);
  const [ignoreAuthors, setIgnoreAuthors] = usePersisted<string[]>("ignoreAuthors", []);
  const [whiteAuthors, setWhiteAuthors] = usePersisted<string[]>("whiteAuthors", []);
  const [wordInput, setWordInput] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [testText, setTestText] = useState("привет! заходи на spam-site.ru за кристаллами");
  const [testResult, setTestResult] = useState<null | { ok: boolean; reason: string }>(null);

  const scopeList = enabledPresets[scope] ?? [];
  const togglePreset = (id: string) => {
    setEnabledPresets((p) => ({
      ...p,
      [scope]: scopeList.includes(id) ? scopeList.filter((x) => x !== id) : [...scopeList, id],
    }));
  };

  const runTest = () => {
    const t = testText.toLowerCase();
    const active = [...(enabledPresets.common ?? []), ...(scope === "common" ? [] : (enabledPresets[scope] ?? []))];
    let reason = "";
    if (ownWords.some((w) => w.mode === "skip" && t.includes(w.word.toLowerCase()))) reason = "слово из списка «не озвучивать»";
    else if (scopeList.includes("links") && /(https?:\/\/|\.ru\b|\.com\b)/i.test(testText)) reason = "ссылка (пресет «Ссылки»)";
    else if (active.includes("links") && /(https?:\/\/|\b\w+\.(ru|com|gg)\b)/i.test(testText)) reason = "ссылка (пресет «Ссылки»)";
    else if (active.includes("spam") && /spam|кристалл/i.test(testText)) reason = "похоже на спам";
    else if (ignoreAuthors.length && matchAuthor(ignoreAuthors)) reason = "автор в игнор-листе";
    else if (testText.length > tts.maxLen) reason = `длиннее ${tts.maxLen} символов`;
    if (whiteAuthors.length && matchAuthor(whiteAuthors)) {
      setTestResult({ ok: true, reason: "автор в белом списке — озвучено вне очереди" });
      return;
    }
    setTestResult(
      reason
        ? { ok: false, reason }
        : { ok: true, reason: `пройдёт фильтры: «${sanitize(testText).slice(0, 80)}»` }
    );
  };

  function matchAuthor(list: string[]) {
    const m = testText.match(/@([a-z0-9_]+)/i);
    return m ? list.includes(m[1].toLowerCase()) : false;
  }

  function sanitize(t: string) {
    let out = t;
    if (tts.skipLinks) out = out.replace(/https?:\/\/\S+|\b[\w-]+\.(ru|com|gg)\b/gi, tts.linkPhrase);
    if (tts.squashRepeats) out = out.replace(/(.)\1{2,}/g, "$1$1");
    if (tts.stripEmoji) out = out.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
    return out;
  }

  const scopes: { id: Scope; name: string }[] = [
    { id: "common", name: "Общая защита" },
    ...PLATFORMS.filter((p) => p.id !== "donationalerts").map((p) => ({ id: p.id as Scope, name: p.name })),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {/* вкладки площадок */}
      <div className="flex flex-wrap gap-1.5">
        {scopes.map((s) => (
          <Chip key={s.id} active={scope === s.id} onClick={() => setScope(s.id)}>
            {s.id !== "common" && <PlatformIcon id={s.id as PlatformId} size={11} />}
            {s.name}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* пресеты */}
        <Box
          title={scope === "common" ? "Пресеты · общая защита" : `Пресеты · ${scopes.find((s) => s.id === scope)?.name}`}
          icon={<ShieldCheck size={14} style={{ color: "var(--dw-dim)" }} />}
        >
          <div className="flex flex-col">
            {PRESETS.map((p) => (
              <ToggleRow
                key={p.id}
                label={p.label}
                hint={p.hint}
                checked={scopeList.includes(p.id)}
                onChange={() => togglePreset(p.id)}
              />
            ))}
            <p className="pt-2 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
              Наборы включаются независимо: отключение одного пресета не удаляет слова другого и личные списки.
            </p>
          </div>
        </Box>

        {/* свои слова */}
        <Box title="Свои слова" icon={<Wand2 size={14} style={{ color: "var(--dw-dim)" }} />}>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const w = wordInput.trim();
              if (!w) return;
              setOwnWords((p) => [...p, { word: w, mode: "skip" }]);
              setWordInput("");
            }}
          >
            <TextInput value={wordInput} onChange={(e) => setWordInput(e.target.value)} placeholder="слово или фраза…" />
            <button type="submit" className="cursor-pointer rounded-lg px-3 text-white" style={{ background: "var(--dw-accent)" }}>
              <Plus size={14} />
            </button>
          </form>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto pt-2">
            {ownWords.length === 0 && (
              <p className="py-1 text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Пусто. «Не озвучивать» пропускает сообщение целиком, «пип» заменяет слово.
              </p>
            )}
            {ownWords.map((w, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1" style={{ background: "var(--dw-input)" }}>
                <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--dw-text)" }}>
                  {w.word}
                </span>
                <select
                  value={w.mode}
                  onChange={(e) =>
                    setOwnWords((p) => p.map((x, j) => (j === i ? { ...x, mode: e.target.value as "skip" | "beep" } : x)))
                  }
                  className="cursor-pointer rounded-md border-none bg-transparent text-[10.5px]"
                  style={{ color: "var(--dw-dim)" }}
                >
                  <option value="skip">не озвучивать</option>
                  <option value="beep">заменить на «пип»</option>
                </select>
                <button className="cursor-pointer text-red-400" onClick={() => setOwnWords((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </Box>

        {/* авторы */}
        <Box title="Авторы" icon={<UserX size={14} style={{ color: "var(--dw-dim)" }} />}>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const a = authorInput.trim().replace(/^@/, "").toLowerCase();
              if (!a) return;
              setIgnoreAuthors((p) => [...new Set([...p, a])]);
              setAuthorInput("");
            }}
          >
            <TextInput value={authorInput} onChange={(e) => setAuthorInput(e.target.value)} placeholder="@ник автора…" />
            <button type="submit" className="cursor-pointer rounded-lg px-3 text-white" style={{ background: "var(--dw-accent)" }}>
              <Plus size={14} />
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {ignoreAuthors.map((a) => (
              <span
                key={a}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
              >
                @{a}
                <button className="cursor-pointer" onClick={() => setIgnoreAuthors((p) => p.filter((x) => x !== a))}>×</button>
              </span>
            ))}
            {whiteAuthors.map((a) => (
              <span
                key={a}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}
              >
                @{a}
                <button className="cursor-pointer" onClick={() => setWhiteAuthors((p) => p.filter((x) => x !== a))}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5 pt-2">
            <button
              onClick={() => {
                const a = authorInput.trim().replace(/^@/, "").toLowerCase();
                if (a) {
                  setWhiteAuthors((p) => [...new Set([...p, a])]);
                  setAuthorInput("");
                }
              }}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
              style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}
            >
              <UserCheck size={12} /> в белый список
            </button>
          </div>
        </Box>

        {/* обработка */}
        <Box title="Обработка сообщения" icon={<FlaskConical size={14} style={{ color: "var(--dw-dim)" }} />}>
          <ToggleRow label="Ссылки заменять на «ссылка»" checked={tts.skipLinks} onChange={(v) => patch({ skipLinks: v })} />
          <ToggleRow label="Пропускать команды (!...)" checked={tts.skipCommands} onChange={(v) => patch({ skipCommands: v })} />
          <ToggleRow label="Убирать эмодзи" checked={tts.stripEmoji} onChange={(v) => patch({ stripEmoji: v })} />
          <ToggleRow label="Сжимать повторы символов" hint="«ааааааа» → «аа»" checked={tts.squashRepeats} onChange={(v) => patch({ squashRepeats: v })} />
          <div className="pt-1.5">
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Порог ЗАГЛАВНЫХ букв
            </label>
            <Slider value={tts.capsLimit} min={20} max={100} step={5} onChange={(v) => patch({ capsLimit: v })} format={(v) => `${v}%`} />
          </div>
        </Box>

        {/* проверка */}
        <Box title="Проверка фильтров" icon={<FlaskConical size={14} style={{ color: "var(--dw-accent-2)" }} />} className="xl:col-span-2">
          <div className="flex gap-1.5">
            <TextInput value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="сообщение для прогона по правилам…" />
            <button
              onClick={runTest}
              className="shrink-0 cursor-pointer rounded-lg px-4 text-[12px] font-semibold text-white"
              style={{ background: "var(--dw-accent)" }}
            >
              Проверить
            </button>
          </div>
          {testResult && (
            <p
              className="pop-anim mt-2 rounded-lg px-3 py-2 text-[12px]"
              style={{
                background: testResult.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                color: testResult.ok ? "#4ade80" : "#f87171",
              }}
            >
              {testResult.ok ? "✓ " : "✕ пропущено: "}
              {testResult.reason}
            </p>
          )}
          <p className="pt-2 text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
            Прогон идёт по правилам выбранной площадки («{scopes.find((s) => s.id === scope)?.name}») без озвучивания.
          </p>
        </Box>
      </div>
    </div>
  );
}
