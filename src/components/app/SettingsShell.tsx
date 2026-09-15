import { useEffect, useMemo, useState } from "react";
import {
  AudioLines, Bot, Cpu, Filter, Gamepad2, Heart, Keyboard, LayoutList, MonitorPlay, Search, X,
} from "lucide-react";
import { usePersisted } from "../../lib/persist";
import type { BotCommand, ChatViewConfig, OverlayConfig, TtsConfig, WidgetConfig } from "../../lib/types";
import VoicePanel, { type QueueItem } from "./VoicePanel";
import FiltersPanel from "./FiltersPanel";
import ChatViewPanel from "./ChatViewPanel";
import WidgetPanel from "./WidgetPanel";
import OverlayPanel from "./OverlayPanel";
import HotkeysPanel from "./HotkeysPanel";
import ChatBotPanel from "./ChatBotPanel";
import SupportPanel from "./SupportPanel";
import { FeedPreview, OverlayPreview, WidgetPreview } from "./Presets";
import { Collapsible, IconBtn, ToggleRow } from "./ui";

export type SettingsTabId =
  | "voice" | "filters" | "chatview" | "widget" | "overlay" | "hotkeys" | "system" | "chatbot" | "support"
  /* старые идентификаторы — открывают ближайший подходящий раздел */
  | "sound" | "feed" | "output" | "interface";

/**
 * Семь разделов вместо одиннадцати.
 * «Звук» влит в «Озвучку», «Лента» (поведение) — в «Ленту» (оформление),
 * «Вывод» — в «Виджет OBS», «Интерфейс» убран: тема меняется из шапки окна.
 */
const TABS: { id: SettingsTabId; name: string; icon: React.ReactNode; section: "look" | "app" }[] = [
  { id: "chatview", name: "Лента чата", icon: <LayoutList size={14} />, section: "look" },
  { id: "widget", name: "Виджет OBS", icon: <MonitorPlay size={14} />, section: "look" },
  { id: "overlay", name: "Оверлей поверх игры", icon: <Gamepad2 size={14} />, section: "look" },
  { id: "voice", name: "Озвучка", icon: <AudioLines size={14} />, section: "app" },
  { id: "filters", name: "Фильтры чата", icon: <Filter size={14} />, section: "app" },
  { id: "chatbot", name: "Чат-бот", icon: <Bot size={14} />, section: "app" },
  { id: "hotkeys", name: "Горячие клавиши", icon: <Keyboard size={14} />, section: "app" },
  { id: "system", name: "Приложение", icon: <Cpu size={14} />, section: "app" },
  { id: "support", name: "Поддержать", icon: <Heart size={14} />, section: "app" },
];

/** переезд старых вкладок на новые */
const TAB_ALIAS: Partial<Record<SettingsTabId, SettingsTabId>> = {
  sound: "voice",
  feed: "chatview",
  output: "widget",
  interface: "chatview",
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
  /* озвучка / фильтры */
  tts: TtsConfig;
  patchTts: (p: Partial<TtsConfig>) => void;
  queue: QueueItem[];
  paused: boolean;
  onPauseToggle: () => void;
  onSkipQueue: () => void;
  onClearQueue: () => void;
  onTestVoice: (text: string) => void;
  /* остальные панели */
  chatView: ChatViewConfig;
  patchChatView: (c: ChatViewConfig) => void;
  widgetCfg: WidgetConfig;
  patchWidget: (c: WidgetConfig) => void;
  overlayCfg: OverlayConfig;
  patchOverlay: (c: OverlayConfig) => void;
  hotkeys: Record<string, string>;
  onApplyHotkeys: (m: Record<string, string>) => void;
  /* команды бота */
  botCommands?: BotCommand[];
  onUpdateCommands?: (cmds: BotCommand[] | ((p: BotCommand[]) => BotCommand[])) => void;
  /* интерфейс / лента / система */
  variantId: string;
  onVariant: (id: string) => void;
  maxFeed: number;
  onMaxFeed: (v: number) => void;
  closeToTray: boolean;
  setCloseToTray: (v: boolean) => void;
  minimizeToTray: boolean;
  setMinimizeToTray: (v: boolean) => void;
  startHidden: boolean;
  setStartHidden: (v: boolean) => void;
  hideDeleted: boolean;
  setHideDeleted: (v: boolean) => void;
  mentionHL: boolean;
  setMentionHL: (v: boolean) => void;
  donatePing: boolean;
  setDonatePing: (v: boolean) => void;
  savedAt: number;
  toast: (t: string) => void;
  markSaved: (label?: string) => void;
}

export default function SettingsShell(p: Props) {
  const [tab, setTab] = useState<SettingsTabId>(p.initialTab ?? "voice");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!p.open) return;
    const wanted = p.initialTab ?? "chatview";
    setTab(TAB_ALIAS[wanted] ?? wanted);
  }, [p.open, p.initialTab]);

  /* локальные системно-звуковые настройки (все сохраняются) */
  const [soundDevice, setSoundDevice] = usePersisted("soundDevice", "default");
  const [autostart, setAutostart] = usePersisted("autostart", false);


  const q = query.trim().toLowerCase();
  const match = useMemo(() => (label: string) => !q || label.toLowerCase().includes(q), [q]);

  if (!p.open) return null;

  const tabName = TABS.find((t) => t.id === tab)?.name ?? "";

  const navBtn = (t: (typeof TABS)[number]) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      title={t.name}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors"
      style={{
        background: tab === t.id ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)" : "transparent",
        color: tab === t.id ? "var(--dw-accent-2)" : "var(--dw-dim)",
      }}
    >
      {t.icon}
      <span className="truncate">{t.name}</span>
    </button>
  );

  /** предпросмотр справа — единственное место, где он показывается */
  const preview =
    tab === "chatview" ? (
      <FeedPreview view={p.chatView} />
    ) : tab === "overlay" ? (
      <OverlayPreview cfg={p.overlayCfg} />
    ) : tab === "widget" ? (
      <WidgetPreview cfg={p.widgetCfg} />
    ) : null;

  return (
    <div className="fade-anim fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6" style={{ background: "rgba(0,0,0,0.6)" }} onMouseDown={p.onClose}>
      <div
        className="pop-anim flex w-full max-w-[1180px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)", height: "min(640px, 90vh)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* левая колонка */}
        <div className="flex w-[172px] shrink-0 flex-col border-r" style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}>
          <div className="p-3 pb-2">
            <div className="relative">
              <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2" style={{ color: "var(--dw-dim)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск…"
                className="w-full rounded-lg border border-transparent py-1.5 pr-2 pl-7 text-[12px] outline-none focus:border-[var(--dw-accent)]"
                style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
              />
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
            <p className="px-2.5 pt-1 pb-1 text-[9.5px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--dw-dim)" }}>
              Оформление
            </p>
            {TABS.filter((t) => t.section === "look" && match(t.name)).map(navBtn)}
            <p className="px-2.5 pt-2.5 pb-1 text-[9.5px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--dw-dim)" }}>
              Приложение
            </p>
            {TABS.filter((t) => t.section === "app" && match(t.name)).map(navBtn)}
          </nav>
          <div className="flex items-center gap-2 border-t p-3 text-[10.5px]" style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}>
            {p.savedAt > 0 && (
              <span className="pop-anim flex items-center gap-1 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Сохранено
              </span>
            )}
            <span className="ml-auto">v1.1.9</span>
          </div>
        </div>

        {/* содержимое */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--dw-line)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--dw-text)" }}>
              {tabName}
            </h2>
            <IconBtn icon={<X size={15} />} onClick={p.onClose} title="Закрыть настройки" />
          </header>

          <div className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "voice" && (
              <div className="flex flex-col gap-2">
                <VoicePanel
                  tts={p.tts}
                  patch={p.patchTts}
                  queue={p.queue}
                  paused={p.paused}
                  onPauseToggle={p.onPauseToggle}
                  onSkip={p.onSkipQueue}
                  onClearQueue={p.onClearQueue}
                  onTest={p.onTestVoice}
                />
                {/* раздел «Звук» больше не отдельная вкладка */}
                <Collapsible title="Звук и устройство вывода" hint={p.donatePing ? "сигнал донатов вкл" : "сигнал выкл"}>
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>Устройство вывода</label>
                      <select
                        value={soundDevice}
                        onChange={(e) => { setSoundDevice(e.target.value); p.markSaved(); }}
                        className="w-full cursor-pointer rounded-lg border border-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
                        style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                      >
                        <option value="default" style={{ color: "#000" }}>По умолчанию (системное)</option>
                        <option value="headset" style={{ color: "#000" }}>Наушники / стрим-микс</option>
                        <option value="vb-cable" style={{ color: "#000" }}>Виртуальный кабель (VB-Audio)</option>
                      </select>
                    </div>
                    <ToggleRow
                      label="Сигнал перед озвучкой доната"
                      checked={p.donatePing}
                      onChange={(v) => { p.setDonatePing(v); p.markSaved(); }}
                    />
                  </div>
                </Collapsible>
              </div>
            )}
            {tab === "filters" && <FiltersPanel tts={p.tts} patch={p.patchTts} />}
            {tab === "chatview" && (
              <ChatViewPanel
                view={p.chatView}
                patch={p.patchChatView}
                maxFeed={p.maxFeed}
                onMaxFeed={p.onMaxFeed}
                hideDeleted={p.hideDeleted}
                setHideDeleted={p.setHideDeleted}
                mentionHL={p.mentionHL}
                setMentionHL={p.setMentionHL}
              />
            )}
            {tab === "widget" && <WidgetPanel cfg={p.widgetCfg} patch={p.patchWidget} toast={p.toast} />}
            {tab === "overlay" && (
              <OverlayPanel cfg={p.overlayCfg} patch={p.patchOverlay} toast={p.toast} hotkey={p.hotkeys.toggleOverlay} />
            )}
            {tab === "support" && <SupportPanel />}
            {tab === "chatbot" && (
              <ChatBotPanel
                toast={p.toast}
                commands={p.botCommands}
                onUpdateCommands={p.onUpdateCommands}
              />
            )}
            {tab === "hotkeys" && <HotkeysPanel hotkeys={p.hotkeys} onApply={p.onApplyHotkeys} toast={p.toast} />}

            {tab === "system" && (
              <div className="flex max-w-[480px] flex-col gap-1">
                <ToggleRow label="Сворачивать окно в трей" checked={p.minimizeToTray} onChange={(v) => { p.setMinimizeToTray(v); p.markSaved(); }} />
                <ToggleRow label="«Крестик» сворачивает в трей" hint="реальное закрытие — через меню трея" checked={p.closeToTray} onChange={(v) => { p.setCloseToTray(v); p.markSaved(); }} />
                <ToggleRow label="Запускать свёрнутым в трей" checked={p.startHidden} onChange={(v) => { p.setStartHidden(v); p.markSaved(); }} />
                <ToggleRow label="Автозапуск с Windows" checked={autostart} onChange={(v) => { setAutostart(v); p.markSaved(); }} />
              </div>
            )}

          </div>

          {/* колонка предпросмотра — справа, для вкладок оформления */}
          {preview && (
            <aside
              className="hidden w-[320px] shrink-0 overflow-y-auto border-l p-3 lg:block"
              style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}
            >
              {preview}
            </aside>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
