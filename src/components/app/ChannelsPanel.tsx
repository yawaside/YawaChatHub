import { useMemo, useState } from "react";
import {
  Bot, Eye, KeyRound, Link2Off, Loader2, MessageSquare, PanelLeftClose, PanelLeftOpen,
  Plus, RadioTower, RotateCw, Trash2, TriangleAlert, X,
} from "lucide-react";
import type { Channel, PlatformId } from "../../lib/types";
import { PLATFORMS, PlatformIcon, platformMeta } from "../../lib/platforms";
import { isValidUsername, normalizeUsername } from "../../lib/demoChat";
import { BotAuthCompact } from "./BotAuth";
import { IconBtn, TextInput } from "./ui";

export type ChannelsStyle = "command" | "terminal" | "studio";

const STATUS_TEXT: Record<string, string> = {
  online: "в эфире",
  connected: "подключено",
  offline: "офлайн",
  connecting: "подключение",
  error: "ошибка",
};

const STATUS_COLOR: Record<string, string> = {
  online: "#4ade80",
  connected: "var(--dw-accent-2)",
  offline: "var(--dw-dim)",
  connecting: "#fbbf24",
  error: "#f87171",
};

/** активен = подключён или в эфире (для подсветки карточки) */
const isActive = (s: string) => s === "online" || s === "connected";

interface Props {
  channels: Channel[];
  collapsed: boolean;
  style?: ChannelsStyle;
  /** сумма донатов за сессию — показывается вместо зрителей у DonationAlerts */
  donationTotal?: number;
  onToggleCollapsed: () => void;
  onConnect: (platform: PlatformId, username: string, opts?: { token?: string; currency?: string }) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
  toast: (t: string) => void;
}

export default function ChannelsPanel({
  channels,
  collapsed,
  style = "command",
  donationTotal,
  onToggleCollapsed,
  onConnect,
  onDisconnect,
  onReconnect,
  toast,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const summary = useMemo(() => {
    const online = channels.filter((c) => c.status === "online");
    const active = channels.filter((c) => isActive(c.status));
    return {
      total: channels.length,
      online: online.length,
      connected: active.length,
      viewers: online.reduce((s, c) => s + c.viewers, 0),
    };
  }, [channels]);

  /* ================= свёрнутая колонка ================= */
  if (collapsed) {
    return (
      <div className="flex flex-1 flex-col items-center gap-1.5 pt-1">
        <button
          onClick={onToggleCollapsed}
          title="Развернуть панель каналов"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl transition-all hover:brightness-125"
          style={{
            background: style === "terminal" ? "transparent" : "var(--dw-accent)",
            border: style === "terminal" ? "1px solid var(--dw-accent)" : "none",
            color: style === "terminal" ? "var(--dw-accent)" : "#fff",
          }}
        >
          <PanelLeftOpen size={15} />
        </button>
        <div className="my-1 h-px w-6" style={{ background: "var(--dw-line)" }} />
        {PLATFORMS.map((pl) => {
          const chans = channels.filter((c) => c.platform === pl.id);
          const live = chans.filter((c) => c.status === "online").length;
          if (!chans.length) return null;
          return (
            <button
              key={pl.id}
              onClick={onToggleCollapsed}
              title={`${pl.name} — ${chans.length} кан.${live ? `, ${live} в эфире` : ""}`}
              className="relative flex h-9 w-9 cursor-pointer items-center justify-center transition-all hover:brightness-125"
              style={{
                borderRadius: style === "terminal" ? 4 : 12,
                background: live ? `${pl.color}1f` : "var(--dw-input)",
                boxShadow: live ? `inset 0 0 0 1px ${pl.color}55` : "none",
              }}
            >
              <PlatformIcon id={pl.id} size={15} />
              {live > 0 && (
                <span
                  className="pulse-dot absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400"
                  style={{ border: "2px solid var(--dw-panel)" }}
                />
              )}
            </button>
          );
        })}
        <button
          onClick={() => setAddOpen(true)}
          title="Добавить канал"
          className="mt-1 flex h-9 w-9 cursor-pointer items-center justify-center border border-dashed transition-all hover:border-[var(--dw-accent)] hover:text-[var(--dw-accent-2)]"
          style={{ borderRadius: style === "terminal" ? 4 : 12, borderColor: "var(--range-rest)", color: "var(--dw-dim)" }}
        >
          <Plus size={15} />
        </button>
        {addOpen && <AddChannelModal onClose={() => setAddOpen(false)} onConnect={onConnect} toast={toast} />}
      </div>
    );
  }

  const mono = style === "terminal";

  /* ================= развёрнутая панель ================= */
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---------- сводка ---------- */}
      <div
        className="mx-0.5 mb-2 overflow-hidden"
        style={{
          borderRadius: mono ? 6 : 14,
          background:
            style === "studio"
              ? "linear-gradient(135deg, color-mix(in srgb, var(--dw-accent) 12%, var(--dw-panel2)), var(--dw-panel2))"
              : style === "terminal"
                ? "var(--dw-panel2)"
                : "linear-gradient(135deg, color-mix(in srgb, var(--dw-accent) 20%, var(--dw-panel2)), var(--dw-panel2))",
          border: `1px solid ${mono ? "var(--dw-accent)" : "var(--dw-line)"}`,
        }}
      >
        <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
          <span
            className="flex h-6 w-6 items-center justify-center"
            style={{
              borderRadius: mono ? 4 : 8,
              background: summary.online ? "rgba(74,222,128,0.16)" : "var(--dw-input)",
              color: summary.online ? "#4ade80" : "var(--dw-dim)",
            }}
          >
            <RadioTower size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-bold tracking-[0.16em] uppercase"
              style={{ color: "var(--dw-dim)" }}
            >
              {mono ? "channels" : "Каналы"}
            </p>
            <p className="truncate text-[11.5px] font-semibold" style={{ color: "var(--dw-text)" }}>
              {summary.online > 0 ? (
                <>
                  <span style={{ color: "#4ade80" }}>{summary.online} в эфире</span>
                  <span style={{ color: "var(--dw-dim)" }}> · {summary.viewers.toLocaleString("ru-RU")} зрителей</span>
                </>
              ) : summary.connected > 0 ? (
                <span style={{ color: "var(--dw-accent-2)" }}>{summary.connected} подключено</span>
              ) : (
                <span style={{ color: "var(--dw-dim)" }}>нет подключённых каналов</span>
              )}
            </p>
          </div>
          <IconBtn icon={<PanelLeftClose size={13} />} size={22} title="Свернуть панель" onClick={onToggleCollapsed} />
        </div>
        <div className="pb-1" />
      </div>

      {/* ---------- кнопка добавления ---------- */}
      <button
        onClick={() => setAddOpen(true)}
        className="group mx-0.5 mb-2 flex cursor-pointer items-center justify-center gap-1.5 border border-dashed py-2 text-[11.5px] font-semibold transition-all hover:border-[var(--dw-accent)]"
        style={{ borderRadius: mono ? 6 : 12, borderColor: "var(--range-rest)", color: "var(--dw-dim)" }}
      >
        <Plus size={13} className="transition-transform group-hover:rotate-90" />
        {mono ? "[ добавить канал ]" : "Добавить канал"}
      </button>

      {/* ---------- список ---------- */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        {channels.length === 0 ? (
          <EmptyState mono={mono} onAdd={() => setAddOpen(true)} />
        ) : (
          // единый список без разделителей и счётчиков групп:
          // площадка видна по иконке на самой карточке
          PLATFORMS.flatMap((pl) => channels.filter((c) => c.platform === pl.id)).map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              style={style}
              donationTotal={donationTotal}
              onDisconnect={onDisconnect}
              onReconnect={onReconnect}
            />
          ))
        )}
      </div>

      {/* ---------- чат-бот ---------- */}
      <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
        <p
          className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase"
          style={{ color: "var(--dw-dim)" }}
        >
          <Bot size={11} /> {mono ? "bot" : "Чат-бот"}
        </p>
        <BotAuthCompact />
      </div>

      {addOpen && <AddChannelModal onClose={() => setAddOpen(false)} onConnect={onConnect} toast={toast} />}
    </div>
  );
}

/* ================= пустое состояние ================= */

function EmptyState({ mono, onAdd }: { mono: boolean; onAdd: () => void }) {
  return (
    <div
      className="mx-0.5 flex flex-col items-center gap-2.5 px-3 py-6 text-center"
      style={{ borderRadius: mono ? 6 : 14, background: "var(--dw-panel2)", border: "1px dashed var(--dw-line)" }}
    >
      <div className="flex gap-1">
        {PLATFORMS.slice(0, 5).map((p, i) => (
          <span
            key={p.id}
            className="flex h-7 w-7 items-center justify-center"
            style={{
              borderRadius: mono ? 3 : 8,
              background: `${p.color}1a`,
              transform: `translateY(${i % 2 ? 3 : -3}px)`,
            }}
          >
            <PlatformIcon id={p.id} size={13} />
          </span>
        ))}
      </div>
      <p className="text-[11.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
        Подключите каналы — весь чат соберётся в одну ленту
      </p>
      <button
        onClick={onAdd}
        className="cursor-pointer px-3 py-1.5 text-[11.5px] font-bold text-white transition-all hover:brightness-110"
        style={{ borderRadius: mono ? 4 : 9, background: "var(--dw-accent)" }}
      >
        Подключить первый
      </button>
    </div>
  );
}

/* ================= карточка канала ================= */

function ChannelCard({
  channel: c,
  style,
  donationTotal,
  onDisconnect,
  onReconnect,
}: {
  channel: Channel;
  style: ChannelsStyle;
  donationTotal?: number;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
}) {
  const meta = platformMeta(c.platform);
  const isDA = c.platform === "donationalerts";
  const live = c.status === "online";        // подтверждённый эфир
  const active = isActive(c.status);          // подключено или в эфире
  const mono = style === "terminal";

  return (
    <div
      className="group relative overflow-hidden transition-all"
      style={{
        borderRadius: mono ? 5 : 12,
        background: active
          ? `linear-gradient(100deg, ${meta.color}1c, var(--dw-panel2) 62%)`
          : "var(--dw-panel2)",
        border: `1px solid ${active ? `${meta.color}59` : "var(--dw-line)"}`,
        boxShadow: active && style === "studio" ? `0 2px 10px ${meta.color}1f` : "none",
      }}
    >
      {/* акцентная полоса площадки */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: active ? meta.color : "var(--range-rest)", opacity: active ? 1 : 0.5 }}
      />

      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-2.5">
        {/* иконка площадки в бейдже */}
        <span
          className="relative flex h-7 w-7 shrink-0 items-center justify-center"
          style={{
            borderRadius: mono ? 4 : 9,
            background: `${meta.color}1f`,
            boxShadow: active ? `0 0 0 1px ${meta.color}4d` : "none",
          }}
        >
          <PlatformIcon id={c.platform} size={14} />
          {/* зелёная пульсация — только для подтверждённого эфира */}
          {live && (
            <span
              className="pulse-dot absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-emerald-400"
              style={{ border: "2px solid var(--dw-panel2)" }}
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[12px] font-semibold ${mono ? "font-mono" : ""}`}
            style={{ color: "var(--dw-text)" }}
          >
            {isDA ? `Донаты · ${c.currency ?? "₽"}` : mono ? `@${c.username}` : c.username}
          </p>
          <p className="flex items-center gap-1 text-[10px]" style={{ color: STATUS_COLOR[c.status] }}>
            {c.status === "connecting" ? (
              <Loader2 size={9} className="animate-spin" />
            ) : c.status === "error" ? (
              <TriangleAlert size={9} />
            ) : (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: STATUS_COLOR[c.status],
                  boxShadow: live ? "0 0 6px rgba(74,222,128,0.8)" : "none",
                }}
              />
            )}
            {/* У донатов нет эфира и зрителей: всегда «подключено» + сумма */}
            <span className="font-medium">{isDA ? (active ? "подключено" : STATUS_TEXT[c.status]) : STATUS_TEXT[c.status]}</span>
            {isDA && active && (
              <>
                <span style={{ color: "var(--dw-dim)" }}>·</span>
                <span className="font-bold tabular-nums" style={{ color: "#FFB454" }}>
                  {(donationTotal ?? 0).toLocaleString("ru-RU")} {c.currency ?? "₽"}
                </span>
              </>
            )}
            {/* зрителей показываем всегда, когда эфир подтверждён (в т.ч. 0) */}
            {!isDA && live && (
              <>
                <span style={{ color: "var(--dw-dim)" }}>·</span>
                <span className="flex items-center gap-0.5 tabular-nums" style={{ color: "var(--dw-dim)" }}>
                  <Eye size={9} /> {c.viewers.toLocaleString("ru-RU")}
                </span>
              </>
            )}
            {active && c.messages > 0 && (
              <span className="flex items-center gap-0.5 tabular-nums" style={{ color: "var(--dw-dim)" }}>
                <MessageSquare size={9} /> {c.messages}
              </span>
            )}
          </p>
        </div>

        {/* действия — появляются при наведении */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="cursor-pointer rounded-md p-1 transition-colors hover:bg-[var(--dw-hover)]"
            style={{ color: "var(--dw-dim)" }}
            title="Переподключить"
            onClick={() => onReconnect(c.id)}
          >
            <RotateCw size={12} />
          </button>
          <button
            className="cursor-pointer rounded-md p-1 text-red-400 transition-colors hover:bg-[var(--dw-hover)]"
            title="Отключить канал"
            onClick={() => onDisconnect(c.id)}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= модалка добавления ================= */

export function AddChannelModal({
  onClose,
  onConnect,
  toast,
}: {
  onClose: () => void;
  onConnect: (platform: PlatformId, username: string, opts?: { token?: string; currency?: string }) => void;
  toast: (t: string) => void;
}) {
  const [platform, setPlatform] = useState<PlatformId>("twitch");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("₽");
  const [error, setError] = useState("");

  const isDA = platform === "donationalerts";
  const meta = platformMeta(platform);
  const raw = value.trim();
  const valid = isDA ? raw.length > 8 : isValidUsername(raw) && raw.length > 0;

  const submit = () => {
    if (isDA) {
      if (!valid) return;
      onConnect("donationalerts", "донаты", { token: raw, currency });
      onClose();
      return;
    }
    if (!raw) return;
    if (!isValidUsername(raw)) {
      setError("Вставьте username, а не ссылку");
      toast("Ссылки отклоняются — нужен username канала");
      return;
    }
    onConnect(platform, normalizeUsername(raw));
    onClose();
  };

  return (
    <div
      className="fade-anim fixed inset-0 z-[85] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onMouseDown={onClose}
    >
      <div
        className="pop-anim w-full max-w-[400px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") submit();
        }}
      >
        {/* шапка с акцентом выбранной площадки */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: `linear-gradient(120deg, ${meta.color}26, transparent)` }}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${meta.color}2e` }}>
              <PlatformIcon id={platform} size={16} />
            </span>
            <div>
              <h3 className="text-[13.5px] font-bold" style={{ color: "var(--dw-text)" }}>
                Добавить канал
              </h3>
              <p className="text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                {meta.name}
              </p>
            </div>
          </div>
          <IconBtn icon={<X size={14} />} onClick={onClose} />
        </div>

        <div className="px-4 pt-1 pb-4">
          {/* выбор площадки: только иконки, название — в шапке модалки */}
          <div className="grid grid-cols-6 gap-1.5 pb-3">
            {PLATFORMS.map((pl) => {
              const on = platform === pl.id;
              return (
                <button
                  key={pl.id}
                  title={pl.name}
                  onClick={() => {
                    setPlatform(pl.id);
                    setError("");
                  }}
                  className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border transition-all hover:brightness-110"
                  style={{
                    background: on ? `${pl.color}1f` : "var(--dw-input)",
                    borderColor: on ? pl.color : "transparent",
                    boxShadow: on ? `0 0 14px ${pl.color}33` : "none",
                    transform: on ? "scale(1.06)" : "none",
                  }}
                >
                  <PlatformIcon id={pl.id} size={19} />
                </button>
              );
            })}
          </div>

          {/* поля ввода */}
          {isDA ? (
            <div className="flex flex-col gap-2 pb-3">
              <div className="relative">
                <KeyRound size={12} className="absolute top-1/2 left-3 -translate-y-1/2" style={{ color: "var(--dw-dim)" }} />
                <TextInput
                  autoFocus
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="секретный токен из профиля"
                  style={{ paddingLeft: 32 }}
                />
              </div>
              <div className="flex gap-1.5">
                {["₽", "$", "€"].map((cur) => (
                  <button
                    key={cur}
                    onClick={() => setCurrency(cur)}
                    className="flex-1 cursor-pointer rounded-lg py-1.5 text-[13px] font-bold transition-all"
                    style={{
                      background: currency === cur ? meta.color : "var(--dw-input)",
                      color: currency === cur ? "#fff" : "var(--dw-dim)",
                    }}
                  >
                    {cur}
                  </button>
                ))}
              </div>
              <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Профиль DonationAlerts → «Основные настройки» → секретный токен.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 pb-3">
              <TextInput
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError("");
                }}
                placeholder={meta.hint}
                style={{ borderColor: error ? "#f87171" : undefined }}
              />
              {error ? (
                <p className="flex items-center gap-1 text-[10.5px] text-red-400">
                  <Link2Off size={10} /> {error}
                </p>
              ) : (
                <p className="text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                  {platform === "youtube" ? "Можно с «@» или без. " : ""}Только username — ссылки не принимаются.
                </p>
              )}

            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 cursor-pointer rounded-xl py-2 text-[12px] font-medium"
              style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
            >
              Отмена
            </button>
            <button
              onClick={submit}
              className="flex-2 cursor-pointer rounded-xl py-2 text-[12.5px] font-bold text-white transition-all hover:brightness-110"
              style={{ background: valid ? meta.color : "var(--range-rest)" }}
            >
              Подключить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
