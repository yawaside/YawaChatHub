import { useState } from "react";
import { Bot, HeartHandshake, Plus, Timer, Trash2 } from "lucide-react";
import type { BotCommand, PlatformId } from "../../lib/types";
import { PLATFORMS, PlatformIcon } from "../../lib/platforms";
import { usePersisted } from "../../lib/persist";
import { BotAuthCards } from "./BotAuth";
import { Box, TextInput, Toggle } from "./ui";

export const DEFAULT_COMMANDS: BotCommand[] = [
  { id: "cmd1", trigger: "!команды", response: "Доступные команды: !вк, !розыгрыш, !song", cooldown: 30, enabled: true, platform: "all" },
  { id: "cmd2", trigger: "!вк", response: "Наша группа: vk.com/yawa", cooldown: 60, enabled: true, platform: "all" },
  { id: "cmd3", trigger: "!song", response: "Сейчас играет: lo-fi stream mix #12", cooldown: 15, enabled: false, platform: "twitch" },
];

interface Props {
  toast: (t: string) => void;
  commands?: BotCommand[];
  onUpdateCommands?: (cmds: BotCommand[] | ((p: BotCommand[]) => BotCommand[])) => void;
}

export default function ChatBotPanel({ toast, commands: propCommands, onUpdateCommands }: Props) {
  const [localCommands, setLocalCommands] = usePersisted<BotCommand[]>("botCommands", DEFAULT_COMMANDS);
  const commands = propCommands ?? localCommands;
  const setCommands = onUpdateCommands ?? setLocalCommands;

  // Параметры VK ID хранятся локально и читаются хостом при входе
  const [vkChannel, setVkChannel] = usePersisted<string>("vkChannel", "");
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [cooldown, setCooldown] = useState(30);
  const [platform, setPlatform] = useState<PlatformId | "all">("all");

  const add = () => {
    const t = trigger.trim();
    const r = response.trim();
    if (!t || !r) return;
    if (!t.startsWith("!")) {
      toast("Команда должна начинаться с «!»");
      return;
    }
    if (commands.some((c) => c.trigger.toLowerCase() === t.toLowerCase())) {
      toast("Такая команда уже есть");
      return;
    }
    setCommands((p) => [...p, { id: `cmd${Date.now()}`, trigger: t, response: r, cooldown, enabled: true, platform }]);
    setTrigger("");
    setResponse("");
    toast("Команда добавлена");
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {/* авторизация бота: Twitch и VK Play Live */}
      <Box
        title="Авторизация чат-бота"
        icon={<HeartHandshake size={14} style={{ color: "var(--dw-dim)" }} />}
        defaultOpen={false}
      >
        <BotAuthCards toast={toast} />
        <div className="pt-2.5">
          <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
            Канал VK Видео Live (если не определяется автоматически)
          </label>
          <TextInput
            value={vkChannel}
            onChange={(e) => setVkChannel(e.target.value.trim().replace(/^.*\//, ""))}
            placeholder="имя канала из адреса live.vkvideo.ru/…"
          />
          <p className="pt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            Аккаунт VK ID и канал Live связаны не всегда — если канал не определился, укажите его здесь.
          </p>
        </div>


        <p className="pt-2.5 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          «Войти» открывает браузер по умолчанию — после входа канал и аккаунт бота определяются автоматически.
          Бот читает чат, отвечает на команды и выполняет модерацию из ленты.
        </p>
      </Box>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {/* форма создания */}
      <Box title="Новая команда" icon={<Bot size={14} style={{ color: "var(--dw-dim)" }} />}>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            <TextInput value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="!команда" className="w-32" />
            <div className="flex flex-1 items-center gap-1 rounded-lg px-2" style={{ background: "var(--dw-input)" }}>
              <Timer size={12} style={{ color: "var(--dw-dim)" }} />
              <input
                type="number"
                min={0}
                max={3600}
                value={cooldown}
                onChange={(e) => setCooldown(Math.max(0, Number(e.target.value)))}
                className="w-full bg-transparent py-1.5 text-[12px] outline-none"
                style={{ color: "var(--dw-text)" }}
              />
              <span className="text-[10px]" style={{ color: "var(--dw-dim)" }}>
                сек
              </span>
            </div>
          </div>
          <TextInput value={response} onChange={(e) => setResponse(e.target.value)} placeholder="текст ответа бота…" />
          <div className="flex flex-wrap gap-1 pb-1">
            <ScopeBtn id="all" name="Все" current={platform} set={setPlatform} />
            {PLATFORMS.filter((p) => p.id !== "donationalerts").map((p) => (
              <ScopeBtn key={p.id} id={p.id} name={p.short} current={platform} set={setPlatform} />
            ))}
          </div>
          <button
            onClick={add}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-[12.5px] font-semibold text-white transition-all hover:brightness-110"
            style={{ background: "var(--dw-accent)" }}
          >
            <Plus size={14} /> Добавить команду
          </button>
        </div>
      </Box>

      {/* список */}
      <Box title={`Команды · ${commands.length}`} icon={<Bot size={14} style={{ color: "var(--dw-dim)" }} />}>
        <div className="flex max-h-[380px] flex-col gap-1.5 overflow-y-auto">
          {commands.length === 0 && (
            <p className="py-2 text-center text-[12px]" style={{ color: "var(--dw-dim)" }}>
              Команд пока нет — форма «команда → результат» слева
            </p>
          )}
          {commands.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border px-3 py-2"
              style={{ background: "var(--dw-panel2)", borderColor: "var(--dw-line)", opacity: c.enabled ? 1 : 0.5 }}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold" style={{ background: "color-mix(in srgb, var(--dw-accent) 18%, transparent)", color: "var(--dw-accent-2)" }}>
                  {c.trigger}
                </span>
                <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--dw-dim)" }}>
                  <Timer size={9} /> {c.cooldown}с
                </span>
                {c.platform !== "all" && <PlatformIcon id={c.platform} size={11} />}
                <div className="ml-auto flex items-center gap-1.5">
                  <Toggle checked={c.enabled} onChange={(v) => setCommands((p) => p.map((x) => (x.id === c.id ? { ...x, enabled: v } : x)))} />
                  <button className="cursor-pointer text-red-400" onClick={() => setCommands((p) => p.filter((x) => x.id !== c.id))}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="truncate pt-1 text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
                → {c.response}
              </p>
            </div>
          ))}
        </div>
      </Box>
      </div>
    </div>
  );
}

function ScopeBtn({
  id,
  name,
  current,
  set,
}: {
  id: PlatformId | "all";
  name: string;
  current: PlatformId | "all";
  set: (v: PlatformId | "all") => void;
}) {
  const on = current === id;
  return (
    <button
      onClick={() => set(id)}
      className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-all"
      style={{
        background: on ? "color-mix(in srgb, var(--dw-accent) 18%, transparent)" : "var(--dw-input)",
        color: on ? "var(--dw-accent-2)" : "var(--dw-dim)",
        outline: on ? "1px solid var(--dw-accent)" : "none",
      }}
    >
      {name}
    </button>
  );
}
