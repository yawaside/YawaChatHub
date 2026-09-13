import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePersisted } from "../../lib/persist";
import {
  ArrowDown, ArrowDownToLine, Ban, Crown, Eraser, Gavel, Gift, HandCoins, Heart,
  MessageSquareX, Search, Shield, ShieldAlert, Star, Timer, UserX, Zap,
} from "lucide-react";
import type { ChatMsg, ChatViewConfig, Channel, ModerationRequest, PlatformId } from "../../lib/types";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import { isStickerOnly, parseMessage } from "../../lib/emotes";
import { fontStack } from "../../lib/fonts";
import { composeTextShadow, effectClass, effectVars } from "../../lib/effects";
import { IconBtn } from "./ui";

/* ============ общая модерация канала (не привязана к пользователю) ============ */

function ChatModerationBar({
  channels,
  onAction,
}: {
  channels: Channel[];
  onAction: (action: string, channel: string, platform: PlatformId, seconds?: number) => void;
}) {
  // модерация поддержана для Twitch-каналов, которые сейчас подключены
  const targets = channels.filter((c) => c.platform === "twitch");
  const [channel, setChannel] = useState(targets[0]?.username ?? "");
  const [slow, setSlow] = useState(10);

  const active = targets.find((c) => c.username === channel) ?? targets[0];

  const run = (action: string, seconds?: number) => {
    if (!active) return;
    onAction(action, active.username, active.platform, seconds);
  };

  if (targets.length === 0) {
    return (
      <div className="border-b px-3 py-2 text-[11px]" style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}>
        Добавьте канал Twitch — режимы чата управляются через его модерацию.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: "var(--dw-line)" }}>
      <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>Канал:</span>
      <select
        value={active?.username ?? ""}
        onChange={(e) => setChannel(e.target.value)}
        className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] outline-none"
        style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
      >
        {targets.map((c) => (
          <option key={c.id} value={c.username}>{c.username}</option>
        ))}
      </select>

      <span className="mx-1 h-4 w-px" style={{ background: "var(--dw-line)" }} />

      <div className="flex items-center gap-1">
        <Timer size={12} style={{ color: "var(--dw-dim)" }} />
        <input
          type="number"
          min={1}
          max={1800}
          value={slow}
          onChange={(e) => setSlow(Math.max(1, Math.min(1800, Number(e.target.value) || 1)))}
          className="w-16 rounded-lg px-2 py-1 text-[11.5px] outline-none"
          style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
        />
        <ModeBtn label="Медленный" onClick={() => run("mode-slow", slow)} />
        <ModeBtn label="Выключить" onClick={() => run("mode-slow-off")} />
      </div>

      <span className="mx-1 h-4 w-px" style={{ background: "var(--dw-line)" }} />

      <ModeBtn icon={<Zap size={11} />} label="Только смайлы" onClick={() => run("mode-emote")} />
      <ModeBtn label="Выкл" onClick={() => run("mode-emote-off")} />
      <ModeBtn icon={<Heart size={11} />} label="Фолловеры" onClick={() => run("mode-followers")} />
      <ModeBtn label="Выкл" onClick={() => run("mode-followers-off")} />
      <ModeBtn icon={<Crown size={11} />} label="Только сабы" onClick={() => run("mode-subs")} />
      <ModeBtn label="Выкл" onClick={() => run("mode-subs-off")} />

      <span className="mx-1 h-4 w-px" style={{ background: "var(--dw-line)" }} />
      <ModeBtn icon={<Eraser size={11} />} label="Очистить чат канала" danger onClick={() => run("mode-clear")} />
    </div>
  );
}

function ModeBtn({
  icon,
  label,
  danger,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:brightness-125"
      style={{ background: "var(--dw-input)", color: danger ? "#f87171" : "var(--dw-text)" }}
    >
      {icon}
      {label}
    </button>
  );
}

const BADGE_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  mod: { icon: <Shield size={10} />, color: "#34d399" },
  sub: { icon: <Star size={10} />, color: "#a78bfa" },
  vip: { icon: <Heart size={10} />, color: "#f472b6" },
  turbo: { icon: <Zap size={10} />, color: "#fbbf24" },
};

const KIND_STYLE: Record<string, { icon: React.ReactNode; tint: string }> = {
  donate: { icon: <HandCoins size={11} />, tint: "#f59e0b" },
  sub: { icon: <Crown size={11} />, tint: "#a78bfa" },
  gift: { icon: <Gift size={11} />, tint: "#f472b6" },
  raid: { icon: <Zap size={11} />, tint: "#38bdf8" },
};

interface Props {
  feed: ChatMsg[];
  channels: Channel[];
  view: ChatViewConfig;
  maxFeed: number;
  hideDeleted?: boolean;
  mentionHL?: boolean;
  onModerate: (req: ModerationRequest) => void;
  onClear: () => void;
  /** общие режимы чата площадки (не привязаны к пользователю) */
  onChatMode?: (action: string, channel: string, platform: PlatformId, seconds?: number) => void;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/* Одна строка ленты в мемоизированном компоненте: без этого каждое новое
   сообщение перерисовывало ВЕСЬ список (сотни узлов) и грузило процессор. */
const FeedRow = React.memo(function FeedRow({
  m,
  view,
  anim,
  mentionHL,
  onModerate,
}: {
  m: ChatMsg;
  view: ChatViewConfig;
  anim: boolean;
  mentionHL: boolean;
  onModerate: (req: ModerationRequest) => void;
}) {
    if (m.kind === "system" || m.kind === "status") {
      return (
        <div
          key={m.id}
          className={`dw-msg flex items-center gap-2 justify-center text-center ${anim ? effectClass(view.effect) : ""}`}
          style={{ ...effectVars(view.effectSpeed), color: "var(--dw-dim)", fontSize: "0.85em" }}
        >
          <span className="h-px w-8" style={{ background: "var(--dw-line)" }} />
          {m.text}
          <span className="h-px w-8" style={{ background: "var(--dw-line)" }} />
        </div>
      );
    }
    const ks = KIND_STYLE[m.kind];
    const isEvent = !!ks || m.kind === "command";
    const mentioned = mentionHL && !m.deleted && m.kind === "chat" && /@/.test(m.text);
    const sticker = !m.deleted && m.kind === "chat" && isStickerOnly(m.text, m.platform);
    return (
      <div
        key={m.id}
        className={`dw-msg group selectable leading-snug ${anim ? effectClass(view.effect) : ""}`}
        style={{
          ...effectVars(view.effectSpeed),
          textShadow: composeTextShadow(view.outlineWidth, view.textShadow ?? false),
          background: m.deleted
            ? "transparent"
            : mentioned
              ? "color-mix(in srgb, var(--dw-accent) 10%, transparent)"
              : view.backdrop
                ? isEvent
                  ? `color-mix(in srgb, ${ks?.tint ?? "#f59e0b"} ${m.kind === "command" ? 6 : 9}%, transparent)`
                  : "var(--dw-panel)"
                : "transparent",
          borderRadius: view.radius,
          borderLeft:
            isEvent && !m.deleted
              ? `3px solid ${ks?.tint ?? "var(--dw-accent)"}`
              : mentioned
                ? "3px solid var(--dw-accent)"
                : view.stripe
                  ? `3px solid ${platformMeta(m.platform).color}`
                  : "3px solid transparent",
          borderBottom: view.separators ? "1px solid var(--dw-line)" : "none",
          opacity: m.deleted ? 0.45 : 1,
        }}
      >
        <div className="leading-snug break-words" style={{ textDecoration: m.deleted ? "line-through" : "none" }}>
          {view.showTime && (
            <span className="inline-block mr-1 text-[0.78em] tabular-nums align-baseline" style={{ color: "var(--dw-dim)" }}>
              {fmtTime(m.ts)}
            </span>
          )}
          {ks && <span className="inline-flex mr-1 translate-y-[1.5px] align-baseline" style={{ color: ks.tint }}>{ks.icon}</span>}
          {view.showPlatform && (
            <span className="inline-flex mr-1 translate-y-[1.5px] align-baseline">
              <PlatformIcon id={m.platform} size={12} />
            </span>
          )}
          {view.showBadges &&
            !m.deleted &&
            m.badges?.map((b, j) => {
              const bi = BADGE_ICONS[b];
              if (!bi) return null;
              return (
                <span
                  key={j}
                  className="inline-flex mr-1 h-[14px] w-[14px] translate-y-[2px] items-center justify-center rounded align-baseline"
                  style={{ background: `${bi.color}26`, color: bi.color }}
                >
                  {bi.icon}
                </span>
              );
            })}
          <button
            className="inline cursor-pointer font-semibold hover:underline mr-1"
            style={{ color: view.accentNick ? m.color : "var(--dw-text)" }}
            onClick={(e) => {
              const r = (e.target as HTMLElement).getBoundingClientRect();
              onModerate({ msg: m, x: r.left, y: r.bottom + 4 });
            }}
            title="Меню модерации"
          >
            {(view.nickCase === "upper" ? m.author.toUpperCase() : m.author) + ":"}
          </button>
          {m.amount !== undefined && (
            <span className="inline-block mr-1 rounded px-1 py-px text-[0.85em] font-bold align-baseline" style={{ background: "#f59e0b22", color: "#fbbf24" }}>
              {m.amount.toLocaleString("ru-RU")} {m.currency}
            </span>
          )}
          <span className="inline" style={{ color: "var(--dw-text)" }}>
            {m.deleted ? "сообщение удалено" : <MsgText text={m.text} platform={m.platform} sticker={sticker} />}
          </span>
        </div>
      </div>
    );
});

export default function ChatFeed({ feed, channels, view, maxFeed, hideDeleted = false, mentionHL = true, onModerate, onClear, onChatMode }: Props) {
  const [modOpen, setModOpen] = useState(false);
  // системные события (подключения, статусы) можно спрятать кнопкой в шапке
  const [hideSystem, setHideSystem] = usePersisted<boolean>("feedHideSystem", false);
  const [query, setQuery] = useState("");
  const [platforms, setPlatforms] = useState<Set<PlatformId>>(new Set());
  const [pinned, setPinned] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    let out = feed;
    if (hideSystem) out = out.filter((m) => m.kind !== "system" && m.kind !== "status");
    if (hideDeleted) out = out.filter((m) => !m.deleted);
    if (platforms.size) out = out.filter((m) => m.kind === "system" || platforms.has(m.platform));
    const q = query.trim().toLowerCase();
    if (q)
      out = out.filter(
        (m) =>
          String(m.text ?? "").toLowerCase().includes(q) ||
          String(m.author ?? "").toLowerCase().includes(q)
      );
    return out.slice(-maxFeed);
  }, [feed, query, platforms, maxFeed, hideDeleted, hideSystem]);

  /* автопрокрутка: зависим от id последнего сообщения — при лимите ленты
     длина массива не меняется и скролл должен срабатывать всё равно */
  const lastId = visible.length ? visible[visible.length - 1].id : 0;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinned && atBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      setUnread(0);
    } else if (lastId) {
      // прокрутили вверх — считаем пропущенные сообщения
      setUnread((n) => Math.min(999, n + 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
    setUnread(0);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    // Состояние меняем ТОЛЬКО при реальном переключении: раньше setState
    // вызывался на каждое событие прокрутки (в т.ч. при автоскролле)
    // и перерисовывал всю ленту — это давало заметную нагрузку на CPU.
    setAtBottom((prev) => (prev === bottom ? prev : bottom));
    if (bottom) setUnread((n) => (n === 0 ? n : 0));
  };

  const onlineSet = useMemo(
    () => new Set(channels.filter((c) => c.status === "online").map((c) => c.platform)),
    [channels]
  );

  const togglePlatform = (id: PlatformId) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* панель инструментов ленты */}
      <div
        className="flex items-center gap-1.5 rounded-xl border px-2 py-1.5"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
      >
        <div className="relative min-w-32 flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
            style={{ color: "var(--dw-dim)" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по ленте…"
            className="w-full rounded-lg border border-transparent py-1.5 pr-2 pl-7.5 text-[12px] outline-none focus:border-[var(--dw-accent)]"
            style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
          />
        </div>
        <div className="mx-1 hidden items-center gap-1 md:flex">
          {(["twitch", "youtube", "vkplay", "kick", "tiktok"] as PlatformId[]).map((id) => {
            const on = platforms.size === 0 || platforms.has(id);
            const live = onlineSet.has(id);
            return (
              <button
                key={id}
                onClick={() => togglePlatform(id)}
                title={platformMeta(id).name}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-all"
                style={{
                  background: on ? "var(--dw-input)" : "transparent",
                  opacity: on ? 1 : 0.35,
                  outline: on && platforms.size ? `1px solid ${platformMeta(id).color}55` : "none",
                }}
              >
                <span className="relative">
                  <PlatformIcon id={id} size={14} />
                  {live && (
                    <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn
            icon={<MessageSquareX size={14} />}
            title={hideSystem ? "Системные события скрыты — нажмите, чтобы показать" : "Скрыть системные события (подключения, статусы)"}
            active={hideSystem}
            onClick={() => setHideSystem(!hideSystem)}
          />
          <IconBtn
            icon={<ShieldAlert size={14} />}
            title="Модерация чата: режимы канала"
            active={modOpen}
            onClick={() => setModOpen((v) => !v)}
          />
          <IconBtn
            icon={<ArrowDownToLine size={14} />}
            title={pinned ? "Автопрокрутка включена" : "Автопрокрутка выключена"}
            active={pinned}
            onClick={() => setPinned(!pinned)}
          />
          <IconBtn icon={<Eraser size={14} />} title="Очистить ленту" onClick={onClear} />
        </div>
      </div>

      {modOpen && (
        <ChatModerationBar
          channels={channels}
          onAction={(action, channel, platform, seconds) => onChatMode?.(action, channel, platform, seconds)}
        />
      )}

      {/* лента */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-1 style-${view.styleId ?? "valorant"} ${
          view.density === "cozy"
            ? "feed-cozy"
            : view.density === "compact"
              ? "feed-compact"
              : view.density === "tight"
                ? "feed-tight"
                : "feed-standard"
        }`}
        style={{
          fontSize: view.fontSize,
          fontFamily: fontStack(view.fontFamily),
          gap: view.spacing ?? 6,
          // при нулевом интервале убираем и вертикальные поля контейнера,
          // иначе «вплотную» всё равно оставляло видимый зазор
          paddingBlock: (view.spacing ?? 6) === 0 ? 0 : 4,
        }}
      >
        {visible.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 opacity-50">
            <MessageSquareX size={28} style={{ color: "var(--dw-dim)" }} />
            <p className="text-[12px]" style={{ color: "var(--dw-dim)" }}>
              Лента пуста — подключите канал слева
            </p>
          </div>
        )}
        {visible.map((m, i) => (
          <FeedRow
            key={m.id}
            m={m}
            view={view}
            anim={view.animations && i >= visible.length - 12}
            mentionHL={mentionHL}
            onModerate={onModerate}
          />
        ))}
      </div>

      {/* возврат к последним сообщениям — виден всегда, когда лента прокручена */}
      {!atBottom && (
        <div className="pointer-events-none relative h-0">
          <button
            onClick={scrollToBottom}
            className="pop-anim pointer-events-auto absolute bottom-2 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold shadow-xl transition-all hover:brightness-110"
            style={{ background: "var(--dw-accent)", color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}
          >
            <ArrowDown size={13} />
            {unread > 0 ? `${unread} новых` : "К последним сообщениям"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- текст сообщения с эмоутами/стикерами площадки ---------- */
function MsgText({ text, platform, sticker }: { text: string; platform: PlatformId; sticker?: boolean }) {
  // если картинка эмоута не загрузилась — показываем его код текстом.
  // ВАЖНО: только через состояние React. Прямая мутация DOM (replaceWith)
  // ломала дерево и роняла всё окно в белый экран.
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const parts = parseMessage(String(text ?? ""), platform);

  return (
    <>
      {parts.map((p, i) =>
        p.kind === "emote" ? (
          broken[p.url] ? (
            <span key={i}>:{p.code}:</span>
          ) : (
            <img
              key={i}
              src={p.url}
              alt={`:${p.code}:`}
              title={`:${p.code}:`}
              loading="lazy"
              draggable={false}
              className="mx-px inline-block align-[-0.28em] select-none"
              style={{ height: sticker ? "2.3em" : "1.45em", width: "auto" }}
              onError={() => setBroken((prev) => (prev[p.url] ? prev : { ...prev, [p.url]: true }))}
            />
          )
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

/* ---------- всплывающее меню модерации ---------- */
export function ModerationMenu({
  req,
  onAction,
  onClose,
}: {
  req: ModerationRequest;
  onAction: (action: string, msg: ChatMsg, arg?: number) => void;
  onClose: () => void;
}) {
  const { msg } = req;
  const canModerate = msg.platform === "twitch" || msg.platform === "vkplay";

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const w = 218;
  const x = Math.min(req.x, window.innerWidth - w - 10);
  const y = Math.min(req.y, window.innerHeight - 320);

  const Item = ({
    icon,
    label,
    danger,
    onClick,
  }: {
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onClick?: () => void;
  }) => (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--dw-hover)]"
      style={{ color: danger ? "#f87171" : "var(--dw-text)" }}
    >
      <span style={{ color: danger ? "#f87171" : "var(--dw-dim)" }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      className="pop-anim fixed z-[90] rounded-xl border p-1.5 shadow-2xl"
      style={{ background: "var(--dw-panel2)", borderColor: "var(--dw-line)", width: w, left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: msg.color }} />
        <span className="truncate text-[12px] font-semibold" style={{ color: "var(--dw-text)" }}>
          {msg.author}
        </span>
        <span className="ml-auto opacity-70"><PlatformIcon id={msg.platform} size={11} /></span>
      </div>
      {canModerate ? (
        <>
          <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--dw-dim)" }}>
            Таймаут
          </div>
          <div className="flex gap-1 px-1 pb-1">
            {[
              ["60с", 60],
              ["10м", 600],
              ["1ч", 3600],
            ].map(([l, s]) => (
              <button
                key={String(l)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onAction("timeout", msg, s as number)}
                className="flex-1 cursor-pointer rounded-lg py-1 text-[11px] font-medium transition-colors hover:bg-[var(--dw-hover)]"
                style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
              >
                <Timer size={10} className="mr-0.5 inline" /> {l}
              </button>
            ))}
          </div>
          <Item icon={<Ban size={13} />} label="Забанить" danger onClick={() => onAction("ban", msg)} />
          <Item icon={<UserX size={13} />} label="Разбанить" onClick={() => onAction("unban", msg)} />
          <Item icon={<Gavel size={13} />} label="Удалить сообщение" danger onClick={() => onAction("delete", msg)} />
        </>
      ) : (
        <p className="px-2.5 py-2 text-[11.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          Меню модерации доступно только для сообщений Twitch и VK Видео Live
        </p>
      )}
    </div>
  );
}
