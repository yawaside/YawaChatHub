import { useState } from "react";
import { ExternalLink, KeyRound, Loader2, LogIn, LogOut, ShieldCheck, X } from "lucide-react";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import { botApi, isDesktop, openExternal } from "../../lib/bridge";
import { usePersisted } from "../../lib/persist";
import { TextInput } from "./ui";

/** сохранённые аккаунты бота: platform → ник */
export function useBotAuth(): [
  Record<string, string>,
  (v: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) => void,
] {
  const [value, set] = usePersisted<Record<string, string>>("botAuth", {});
  return [value, set];
}

interface AuthTarget {
  id: "twitch" | "vkplay";
  name: string;
  /** где пользователь берёт токен */
  tokenUrl: string;
  tokenHint: string;
  steps: string[];
}

const TARGETS: AuthTarget[] = [
  {
    id: "twitch",
    name: "Twitch",
    tokenUrl: "https://twitchtokengenerator.com/quick/NGyBW4ryeS",
    tokenHint: "oauth:xxxxxxxxxxxxxxxxxxxxxxxxxx",
    steps: [
      "Нажмите «Получить токен» — откроется браузер",
      "Войдите в аккаунт бота и разрешите доступ к чату",
      "Скопируйте ACCESS TOKEN и вставьте его сюда",
    ],
  },
  {
    id: "vkplay",
    name: "VK Видео Live",
    tokenUrl: "https://live.vkvideo.ru",
    tokenHint: "eyJhbGciOiJIUzI1NiJ9...",
    steps: [
      "Нажмите «Получить токен» и войдите в аккаунт бота",
      "Откройте DevTools клавишей F12 → вкладка Application",
      "Cookies → live.vkvideo.ru → скопируйте значение auth (поле accessToken)",
    ],
  },
];

/* ================= карточки для раздела «Чат-бот» ================= */

export function BotAuthCards({ toast }: { toast: (t: string) => void }) {
  const [authorized, setAuthorized] = useBotAuth();
  const [dialog, setDialog] = useState<AuthTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** автоматический вход: одна кнопка — дальше всё делает приложение.
      Если попытка сорвалась — ПОЛНОСТЬЮ сбрасываем её: следующее нажатие
      «Войти» начинает чистый цикл, ручной ввод сам не выскакивает. */
  const login = async (t: AuthTarget) => {
    if (!isDesktop()) {
      toast("Авторизация работает только в приложении");
      return;
    }
    setBusy(t.id);
    toast(
      t.id === "twitch"
        ? "Открыли twitch.tv/activate — код скопирован в буфер, вставьте его на странице"
        : "Открыли VK ID — после подтверждения вход автоматически вернётся в приложение"
    );
    try {
      const res = await botApi.login(t.id);
      setAuthorized((prev) => ({ ...prev, [t.id]: res.account }));
      toast(`${t.name}: бот подключён как ${res.account}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось авторизоваться";
      // Security Error у VK на повторном входе чинится revoke; если продолжается —
      // значит приложение VK создано не типа Standalone.
      const hint =
        t.id === "vkplay" && /security error|invalid_request/i.test(msg)
          ? " Проверьте, что приложение VK имеет тип Standalone (vk.com/editapp)."
          : "";
      toast(`${msg}.${hint} Нажмите «Войти» ещё раз, чтобы повторить.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TARGETS.map((t) => {
          const acc = authorized[t.id];
          const color = platformMeta(t.id).color;
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{
                background: "var(--dw-panel2)",
                borderColor: acc ? color : "var(--dw-line)",
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1f` }}>
                <PlatformIcon id={t.id} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--dw-text)" }}>
                  {t.name}
                </p>
                {acc ? (
                  <p className="truncate text-[11px] text-emerald-400">✓ подключён как {acc}</p>
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
                    бот не авторизован
                  </p>
                )}
              </div>
              {acc ? (
                <button
                  onClick={() => {
                    botApi.logout(t.id);
                    setAuthorized((prev) => {
                      const n = { ...prev };
                      delete n[t.id];
                      return n;
                    });
                  }}
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
                  style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
                >
                  <LogOut size={11} /> Выйти
                </button>
              ) : (
                <>
                  {/* запасной путь — только по явному нажатию, сам не выскакивает */}
                  <button
                    onClick={() => setDialog(t)}
                    title="Ввести токен вручную"
                    className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-1.5"
                    style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
                  >
                    <KeyRound size={12} />
                  </button>
                  <button
                    onClick={() => void login(t)}
                    disabled={busy === t.id}
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
                    style={{ background: color }}
                  >
                    {busy === t.id ? (
                      <><Loader2 size={12} className="animate-spin" /> Ожидаем…</>
                    ) : (
                      <><LogIn size={12} /> Войти</>
                    )}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {dialog && (
        <AuthDialog
          target={dialog}
          onClose={() => setDialog(null)}
          onDone={(account) => {
            setAuthorized((prev) => ({ ...prev, [dialog.id]: account }));
            setDialog(null);
            toast(`${dialog.name}: бот подключён как ${account}`);
          }}
        />
      )}
    </>
  );
}

/* ================= диалог авторизации ================= */

function AuthDialog({
  target,
  onClose,
  onDone,
}: {
  target: AuthTarget;
  onClose: () => void;
  onDone: (account: string) => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const color = platformMeta(target.id).color;

  const submit = async () => {
    const value = token.trim();
    if (!value) return;
    if (!isDesktop()) {
      setError("Авторизация работает только в приложении");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await botApi.verify(target.id, value);
      onDone(res.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось проверить токен");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-anim fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onMouseDown={onClose}>
      <div
        className="pop-anim w-full max-w-[440px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") void submit();
        }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ background: `linear-gradient(120deg, ${color}26, transparent)` }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${color}2e` }}>
              <PlatformIcon id={target.id} size={16} />
            </span>
            <div>
              <h3 className="text-[13.5px] font-bold" style={{ color: "var(--dw-text)" }}>
                Подключение вручную
              </h3>
              <p className="text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                {target.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="cursor-pointer" style={{ color: "var(--dw-dim)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="pb-2 text-[11px] leading-snug" style={{ color: "#fbbf24" }}>
            Запасной путь — подключите бота токеном вручную:
          </p>
          <ol className="flex flex-col gap-1 pb-3">
            {target.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ background: "var(--dw-input)", color: "var(--dw-accent-2)" }}
                >
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>

          <button
            onClick={() => openExternal(target.tokenUrl)}
            className="mb-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold text-white"
            style={{ background: color }}
          >
            <ExternalLink size={13} /> Получить токен
          </button>

          <div className="relative pb-1">
            <KeyRound size={12} className="absolute top-[9px] left-3" style={{ color: "var(--dw-dim)" }} />
            <TextInput
              autoFocus
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setError("");
              }}
              placeholder={target.tokenHint}
              style={{ paddingLeft: 32 }}
            />
          </div>

          {error ? (
            <p className="pb-2 text-[10.5px] text-red-400">{error}</p>
          ) : (
            <p className="pb-2 text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
              Токен хранится только на вашем компьютере и проверяется напрямую у площадки.
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 cursor-pointer rounded-xl py-2 text-[12px]" style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}>
              Отмена
            </button>
            <button
              onClick={submit}
              disabled={busy || !token.trim()}
              className="flex flex-2 cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: color }}
            >
              {busy ? <><Loader2 size={13} className="animate-spin" /> Проверяем…</> : <><ShieldCheck size={13} /> Подключить</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= компактный вид в панели каналов ================= */

export function BotAuthCompact() {
  const [authorized] = useBotAuth();
  const connected = TARGETS.filter((t) => authorized[t.id]);

  return (
    <div className="flex flex-col gap-1 px-0.5">
      {TARGETS.map((t) => {
        const acc = authorized[t.id];
        return (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
            style={{ background: "var(--dw-panel2)", borderColor: "var(--dw-line)" }}
          >
            <PlatformIcon id={t.id} size={13} />
            <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: acc ? "var(--dw-text)" : "var(--dw-dim)" }}>
              {acc ?? "не авторизован"}
            </span>
            {acc && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          </div>
        );
      })}
      <p className="px-1 pt-0.5 text-[9.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
        {connected.length > 0
          ? "Управление ботом — в настройках, раздел «Чат-бот»"
          : "Подключить бота: настройки → «Чат-бот»"}
      </p>
    </div>
  );
}
