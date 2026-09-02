import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, BellOff, ChevronDown, ChevronUp, ChevronsDown, Plus,
  PanelLeftClose, PanelLeftOpen, Radio, Search, Trash2, X,
} from "lucide-react";
import { getSp } from "../../lib/bridge";
import type { SpeechEngine } from "../../lib/core";
import type { ChatMsg, PlatformId } from "../../lib/core";
import { fmtTime, PLATFORMS, PLATFORM_LIST } from "../../lib/core";
import { getMessageMotion } from "../../lib/message-motion";
import { parseEmotes, useEmotes } from "../../lib/emotes";
import type { Channel } from "../../lib/bridge";
import type { ChatViewConfig } from "../../lib/widget";
import { PlatformChip, PlatformIcon } from "../bits";
import { Btn } from "./ui";
import SpeechPanel from "./SpeechPanel";

const BADGE_STYLE: Record<string, { bg: string; fg: string }> = {
  MOD: { bg: "rgba(74,222,128,0.16)", fg: "#4ade80" },
  VIP: { bg: "rgba(244,114,182,0.16)", fg: "#f472b6" },
  SUB: { bg: "rgba(139,92,246,0.18)", fg: "#a78bfa" },
  GIFT: { bg: "rgba(250,204,21,0.16)", fg: "#facc15" },
};

const STATUS: Record<Channel["status"], { label: string; color: string; glow: string }> = {
  online: { label: "подключено", color: "#4ade80", glow: "rgba(74,222,128,0.55)" },
  offline: { label: "офлайн", color: "#8b91a8", glow: "transparent" },
  error: { label: "ошибка", color: "#f87171", glow: "rgba(248,113,113,0.45)" },
  connecting: { label: "подключение…", color: "#facc15", glow: "rgba(250,204,21,0.45)" },
};

function AddChannelForm({
  onAdd, toast, onClose,
}: {
  onAdd: (p: PlatformId, id: string) => void;
  toast: (t: string) => void;
  onClose?: () => void;
}) {
  const [platform, setPlatform] = useState<PlatformId>("twitch");
  const [value, setValue] = useState("");

  const submit = () => {
    const raw = value.trim();
    if (!raw) return;
    if (/^https?:\/\//i.test(raw) || raw.includes("/") || raw.includes("?") || raw.includes("&")) {
      toast("Нужен только username канала, без ссылок");
      return;
    }
    const username = raw.replace(/^@/, "");
    if (!/^[a-zA-Z0-9_.-]{2,40}$/.test(username)) {
      toast("Некорректный username. Разрешены: a-z, 0-9, _, ., -");
      return;
    }
    if (platform === "youtube" && (/^UC[A-Za-z0-9_-]{10,}$/.test(raw) || /^[A-Za-z0-9_-]{11}$/.test(raw))) {
      toast("Для YouTube нужен username/@handle канала, не ID и не ссылка");
      return;
    }
    const channel = platform === "tiktok" ? `@${username}` : username;
    onAdd(platform, channel);
    setValue("");
    onClose?.();
    toast(`Канал добавлен: ${PLATFORMS[platform].label} / ${channel}`);
  };

  return (
    <div
      className="space-y-3 rounded-2xl border p-3.5"
      style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}
    >
      <div className="grid grid-cols-2 gap-2">
        {PLATFORM_LIST.map((p) => {
          const active = platform === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className="flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all"
              style={{
                borderColor: active ? p.color : "var(--dw-line)",
                background: active ? `${p.color}15` : "rgba(255,255,255,0.02)",
              }}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ background: p.color, color: "#fff" }}>
                <PlatformIcon id={p.id} size={13} />
              </span>
              <span className="truncate text-[11.5px] font-semibold" style={{ color: active ? "#fff" : "var(--dw-dim)" }}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={PLATFORMS[platform].hint}
          title={PLATFORMS[platform].hint}
          autoFocus
          className="h-10 w-full rounded-xl border bg-transparent px-3 text-[13px] outline-none placeholder:text-[var(--dw-dim)] focus:border-viol"
          style={{ borderColor: "var(--dw-line)", background: "rgba(0,0,0,0.2)" }}
        />
      </div>
      <Btn variant="primary" className="h-9 w-full !rounded-xl" onClick={submit} disabled={!value.trim()}>
        <Plus size={14} /> Подключить
      </Btn>
    </div>
  );
}

function ChannelCard({
  c, onRemove, compact = false,
}: {
  c: Channel;
  onRemove: (id: string) => void;
  compact?: boolean;
}) {
  const st = STATUS[c.status];
  if (compact) {
    return (
      <div className="group relative mx-auto" title={`${PLATFORMS[c.platform].label} · ${c.channelId} · ${st.label}`}>
        <span
          className="grid h-10 w-10 place-items-center rounded-xl border transition-colors group-hover:border-viol"
          style={{
            borderColor: "var(--dw-line)",
            background: `${PLATFORMS[c.platform].color}18`,
            color: PLATFORMS[c.platform].color,
          }}
        >
          <PlatformIcon id={c.platform} size={15} />
        </span>
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
          style={{ background: st.color, borderColor: "var(--dw-panel)", boxShadow: `0 0 8px ${st.glow}` }}
        />
        <button
          type="button"
          onClick={() => onRemove(c.id)}
          className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
          title="Отключить канал"
        >
          <X size={9} />
        </button>
      </div>
    );
  }
  return (
    <div
      className="group relative flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors"
      style={{
        borderColor: "var(--dw-line)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
      }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
        style={{ background: `${PLATFORMS[c.platform].color}1f`, color: PLATFORMS[c.platform].color }}
      >
        <PlatformIcon id={c.platform} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold tracking-tight">{c.channelId}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: st.color, boxShadow: `0 0 8px ${st.glow}` }}
          />
          <span className="text-[11px]" style={{ color: st.color }}>{st.label}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(c.id)}
        title="Отключить канал"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-lg opacity-0 transition-opacity hover:bg-[var(--dw-hover)] group-hover:opacity-100"
        style={{ color: "var(--dw-dim)" }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function ChatPanel({
  feed, channels, speech, viewCfg, channelsCollapsed, onChannelsCollapsed,
  onSpeechEnabledChange, onClear, onAddChannel, onRemoveChannel, toast,
}: {
  feed: ChatMsg[];
  channels: Channel[];
  speech: SpeechEngine;
  viewCfg: ChatViewConfig;
  channelsCollapsed: boolean;
  onChannelsCollapsed: (collapsed: boolean) => void;
  onSpeechEnabledChange: (enabled: boolean) => void;
  onClear: () => void;
  onAddChannel: (p: PlatformId, id: string) => void;
  onRemoveChannel: (id: string) => void;
  toast: (t: string) => void;
}) {
  const sp = getSp();
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<PlatformId>>(new Set());
  const [follow, setFollow] = useState(true);
  const [showSys, setShowSys] = useState(true); // показывать системные сообщения (подключения и т.д.)
  const [addOpen, setAddOpen] = useState(false);
  const [mobileChannels, setMobileChannels] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const togglePlatform = (p: PlatformId) => {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  };

  const showAll = () => setHidden(new Set());

  const q = query.trim().toLowerCase();
  const shown = feed.filter(
    (m) =>
      (showSys || !m.sys) &&
      !hidden.has(m.platform) &&
      (!q || m.text.toLowerCase().includes(q) || m.author.toLowerCase().includes(q))
  );

  useEffect(() => {
    const el = listRef.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [shown.length, follow]);

  /* Ручная прокрутка вверх останавливает ленту (как на Twitch). */
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setFollow(atBottom);
  };

  const resumeScroll = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setFollow(true);
  };

  /* смайлы площадок: глобальные + пользовательские наборы каналов */
  useEmotes(channels);

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of PLATFORM_LIST) acc[p.id] = feed.filter((m) => !m.sys && m.platform === p.id).length;
    return acc;
  }, [feed]);

  const allActive = hidden.size === 0;
  const totalMessages = feed.filter((m) => !m.sys).length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* ================= каналы (desktop) ================= */}
      <aside
        className="hidden shrink-0 flex-col border-r transition-[width] duration-300 md:flex"
        style={{
          width: channelsCollapsed ? 64 : 276,
          borderColor: "var(--dw-line)",
          background: "var(--dw-panel)",
        }}
      >
        <div className={`flex items-center gap-2 pb-1 pt-4 ${channelsCollapsed ? "flex-col px-2" : "justify-between px-4"}`}>
          {!channelsCollapsed && <div className="flex items-center gap-2">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.22em]"
              style={{ color: "var(--dw-dim)" }}
            >
              Каналы
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
              style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
            >
              {channels.length}
            </span>
          </div>}
          <button
            type="button"
            onClick={() => onChannelsCollapsed(!channelsCollapsed)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition-colors hover:border-viol"
            style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
            title={channelsCollapsed ? "Показать список каналов" : "Скрыть список каналов"}
          >
            {channelsCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
          <button
            onClick={() => {
              if (channelsCollapsed) onChannelsCollapsed(false);
              setAddOpen((v) => !v);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border text-[11.5px] font-semibold transition-all hover:border-viol ${channelsCollapsed ? "h-8 w-8 p-0" : "px-2.5 py-1.5"}`}
            style={{
              borderColor: addOpen ? "#8b5cf6" : "var(--dw-line)",
              background: addOpen ? "#8b5cf61a" : "var(--dw-input)",
              color: addOpen ? "#a78bfa" : "var(--dw-text)",
            }}
          >
            {addOpen ? <X size={12} /> : <Plus size={12} />}
            {!channelsCollapsed && "Канал"}
          </button>
        </div>

        <div className={`scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto py-3 ${channelsCollapsed ? "px-2" : "px-3"}`}>
          <AnimatePresence initial={false}>
            {addOpen && !channelsCollapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <AddChannelForm
                  onAdd={onAddChannel}
                  toast={toast}
                  onClose={() => setAddOpen(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {channels.length === 0 && !addOpen && !channelsCollapsed && (
            <div
              className="rounded-2xl border border-dashed px-3 py-5 text-center text-[11.5px] leading-relaxed"
              style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
            >
              Нет подключённых каналов.
              <br />
              Нажмите «+ Канал» и укажите username.
            </div>
          )}

          {channels.map((c) => (
            <ChannelCard key={c.id} c={c} compact={channelsCollapsed} onRemove={onRemoveChannel} />
          ))}
        </div>

        {/* диагностика сети — доступна только в desktop-сборке */}
        {sp?.diagnoseNet && (
          <div className={`border-t py-2.5 ${channelsCollapsed ? "px-2" : "px-3"}`} style={{ borderColor: "var(--dw-line)" }}>
            <button
              onClick={() => {
                sp.diagnoseNet?.();
                toast("Проверка сети — смотрите ленту");
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-medium transition-colors hover:border-viol"
              style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
              title="Проверить доступ к Twitch, Kick, YouTube и VK"
            >
              <Radio size={12} /> {!channelsCollapsed && "Проверить сеть"}
            </button>
          </div>
        )}

        {/* панель озвучки — теперь в блоке каналов */}
        <SpeechPanel
          speech={speech}
          onSpeechEnabledChange={onSpeechEnabledChange}
          toast={toast}
          compact={channelsCollapsed}
        />
      </aside>

      {/* ================= лента ================= */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--dw-bg)" }}>
        {/* каналы (mobile) */}
        <div
          className="border-b px-3 py-2.5 md:hidden"
          style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
        >
          <button
            onClick={() => setMobileChannels((v) => !v)}
            className="flex w-full items-center justify-between text-[12.5px] font-semibold"
          >
            <span>
              Каналы · {channels.filter((c) => c.status === "online").length} подключено
            </span>
            {mobileChannels ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <AnimatePresence initial={false}>
            {mobileChannels && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 space-y-2">
                  <AddChannelForm onAdd={onAddChannel} toast={toast} />
                  {channels.map((c) => (
                    <ChannelCard key={c.id} c={c} onRemove={onRemoveChannel} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* панель инструментов */}
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3.5 py-3"
          style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
        >
          {/* Все */}
          <button
            onClick={showAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-all"
            style={{
              background: allActive ? "#8b5cf6" : "var(--dw-input)",
              color: allActive ? "#fff" : "var(--dw-dim)",
              boxShadow: allActive ? "0 0 18px rgba(139,92,246,0.35)" : "none",
            }}
            title="Показать все площадки"
          >
            Все
            {!allActive && totalMessages > 0 && (
              <span className="font-mono text-[10px] opacity-70">{totalMessages}</span>
            )}
          </button>

          {/* Площадки-фильтры */}
          {PLATFORM_LIST.map((p) => {
            const off = hidden.has(p.id);
            const count = counts[p.id] ?? 0;
            return (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                title={`${p.label}: ${off ? "скрыто" : "показано"}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-all"
                style={{
                  borderColor: off ? "var(--dw-line)" : `${p.color}55`,
                  background: off ? "transparent" : `${p.color}18`,
                  color: off ? "var(--dw-dim)" : p.color,
                  opacity: off ? 0.55 : 1,
                }}
              >
                <PlatformIcon id={p.id} size={11} />
                <span className="font-mono text-[11px]">{count}</span>
              </button>
            );
          })}

          {/* Поиск */}
          <div
            className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-full border px-3.5"
            style={{ borderColor: "var(--dw-line)", background: "rgba(0,0,0,0.22)" }}
          >
            <Search size={13} className="shrink-0" style={{ color: "var(--dw-dim)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по тексту или автору…"
              className="h-full w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--dw-dim)]"
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ color: "var(--dw-dim)" }} title="Сбросить">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title={follow ? "Автопрокрутка включена" : "Автопрокрутка выключена"}
              onClick={() => setFollow((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-full border transition-colors"
              style={{
                borderColor: follow ? "#8b5cf655" : "var(--dw-line)",
                background: follow ? "#8b5cf61a" : "var(--dw-input)",
                color: follow ? "#a78bfa" : "var(--dw-dim)",
              }}
            >
              <ChevronsDown size={14} />
            </button>

            {/* Кнопка колокольчика — скрыть/показать системные сообщения (подключения и т.д.) */}
            <button
              type="button"
              title={showSys ? "Скрыть события подключения" : "Показывать события подключения"}
              onClick={() => setShowSys((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-full border transition-colors"
              style={{
                borderColor: showSys ? "#8b5cf655" : "var(--dw-line)",
                background: showSys ? "#8b5cf61a" : "var(--dw-input)",
                color: showSys ? "#a78bfa" : "var(--dw-dim)",
              }}
            >
              {showSys ? <Bell size={14} /> : <BellOff size={14} />}
            </button>

            <button
              type="button"
              title="Очистить ленту"
              onClick={onClear}
              className="grid h-8 w-8 place-items-center rounded-full border transition-colors hover:border-red-400/40"
              style={{ borderColor: "var(--dw-line)", background: "var(--dw-input)", color: "var(--dw-dim)" }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* сообщения */}
        <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} className="scroll-thin h-full overflow-y-auto px-4 py-3 sm:px-5">
          {shown.length === 0 && (
            <p className="py-16 text-center text-[12.5px] leading-relaxed" style={{ color: "var(--dw-dim)" }}>
              Лента пуста — сообщения появятся здесь,
              <br />
              как только каналы начнут присылать чат.
            </p>
          )}
          <AnimatePresence>
          <div className="space-y-[3px]">
            {shown.map((m) =>
              m.sys ? (
                <div key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="h-px flex-1" style={{ background: "var(--dw-line)" }} />
                  <span className="font-mono text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                    {m.text}
                  </span>
                  <span className="h-px flex-1" style={{ background: "var(--dw-line)" }} />
                </div>
              ) : (
                <motion.div
                  key={`${m.id}-${viewCfg.messageEffect}-${viewCfg.effectDuration}`}
                  {...getMessageMotion(
                    viewCfg.messageEffect ?? "slide-up",
                    viewCfg.effectDuration ?? 0.34
                  )}
                  className="group flex items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--dw-hover)]"
                  style={{
                    borderRadius: Math.max(viewCfg.radius, 14),
                    marginBottom: viewCfg.rowGap,
                    background:
                      viewCfg.style === "glass"
                        ? "rgba(255,255,255,0.035)"
                        : viewCfg.style === "flat"
                        ? "rgba(255,255,255,0.02)"
                        : viewCfg.style === "classic"
                        ? "rgba(255,255,255,0.025)"
                        : "transparent",
                    border:
                      viewCfg.style === "classic" || viewCfg.style === "glass"
                        ? "1px solid var(--dw-line)"
                        : "1px solid transparent",
                  }}
                >
                  {viewCfg.showPlatform && (
                    <span className="mt-0.5">
                      <PlatformChip id={m.platform} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-0">
                      <span
                        className="mr-2 cursor-default font-bold"
                        style={{ color: m.color, fontSize: viewCfg.fontSize }}
                      >
                        {m.author}
                      </span>
                      {viewCfg.showTime && (
                        <span className="mr-2 font-mono text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
                          {fmtTime(m.ts)}
                        </span>
                      )}
                      {viewCfg.showBadges &&
                        m.badges.map((b) => (
                          <span
                            key={b}
                            className="mr-1 rounded px-1.5 py-px align-middle font-mono text-[8.5px] font-bold uppercase"
                            style={{ background: BADGE_STYLE[b]?.bg, color: BADGE_STYLE[b]?.fg }}
                          >
                            {b}
                          </span>
                        ))}
                    </div>
                    <p
                      className="mt-0.5 break-words leading-snug"
                      style={{ fontSize: viewCfg.fontSize, color: "var(--dw-text)" }}
                    >
                      {(m.parts && m.parts.length ? m.parts : parseEmotes(m.text)).map((part, i) =>
                        part.type === "emote" ? (
                          <img
                            key={`${m.id}-e${i}`}
                            src={part.url}
                            alt={part.value}
                            title={part.value}
                            loading="lazy"
                            className="inline-block align-[-0.3em]"
                            style={{ height: viewCfg.fontSize * 1.5 }}
                          />
                        ) : (
                          <span key={`${m.id}-t${i}`}>{part.value}</span>
                        )
                      )}
                    </p>
                  </div>
                </motion.div>
              )
            )}
          </div>
          </AnimatePresence>
        </div>

        {/* плашка остановки прокрутки */}
        <AnimatePresence>
          {!follow && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={resumeScroll}
              className="absolute inset-x-4 bottom-3 z-10 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11.5px] font-medium backdrop-blur-sm transition-colors hover:border-viol"
              style={{
                borderColor: "var(--dw-line)",
                background: "rgba(10,11,19,0.82)",
                color: "var(--dw-text)",
              }}
            >
              <ChevronsDown size={13} style={{ color: "#a78bfa" }} />
              Чат остановлен из-за прокрутки
            </motion.button>
          )}
        </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
