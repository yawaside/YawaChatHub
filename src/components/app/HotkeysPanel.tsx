import { useEffect, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import { DEFAULT_HOTKEYS } from "../../lib/types";
import { Box, IconBtn } from "./ui";

const ACTIONS: { id: string; name: string; hint: string }[] = [
  { id: "toggleSpeech", name: "Озвучка вкл/выкл", hint: "глобально, из любого приложения" },
  { id: "pauseQueue", name: "Пауза очереди", hint: "останавливает текущее сообщение" },
  { id: "skipQueue", name: "Пропустить сообщение", hint: "следующее в очереди" },
  { id: "toggleOverlay", name: "Показать/скрыть оверлей", hint: "окно поверх игры" },
  { id: "toggleClickThrough", name: "Прозрачность оверлея", hint: "зафиксировать/разблокировать и переключить сквозной клик" },
  { id: "clearFeed", name: "Очистить ленту", hint: "без подтверждения" },
];

interface Props {
  hotkeys: Record<string, string>;
  onApply: (map: Record<string, string>) => void;
  toast: (t: string) => void;
}

/** физический код → читаемая подпись: "Ctrl+Shift+KeyG" → "Ctrl + Shift + G" */
export function prettyCombo(combo: string): string {
  if (!combo) return "—";
  return combo
    .split("+")
    .map((part) => {
      if (/^Key.$/.test(part)) return part[3];
      if (/^Digit.$/.test(part)) return part[5];
      if (/^Numpad(\d)$/.test(part)) return `Num ${part[6]}`;
      const named: Record<string, string> = {
        Space: "Пробел", Enter: "Enter", Tab: "Tab", Escape: "Esc",
        ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
        Backquote: "`", Minus: "−", Equal: "=", BracketLeft: "[", BracketRight: "]",
        Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
      };
      return named[part] ?? part;
    })
    .join(" + ");
}

export default function HotkeysPanel({ hotkeys, onApply, toast }: Props) {
  const [capture, setCapture] = useState<string | null>(null);

  useEffect(() => {
    if (!capture) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setCapture(null);
        return;
      }
      if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code))
        return;

      // ВАЖНО: пишем физический код клавиши (KeyG, Digit5), а не символ —
      // тогда хоткей работает одинаково в любой раскладке клавиатуры
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      parts.push(e.code);
      const combo = parts.join("+");
      onApply({ ...hotkeys, [capture]: combo });
      setCapture(null);
      toast(`${prettyCombo(combo)} назначено`);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capture, hotkeys, onApply, toast]);

  return (
    <Box
      collapsible={false}
      title="Глобальные горячие клавиши"
      icon={<Keyboard size={14} style={{ color: "var(--dw-dim)" }} />}
      actions={<IconBtn icon={<RotateCcw size={13} />} title="Сбросить к умолчаниям" onClick={() => onApply({ ...DEFAULT_HOTKEYS })} />}
    >
      <p className="pb-3 text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>
        В WebView2-сборке клавиши регистрируются хостом через Win32 RegisterHotKey и работают из любого приложения,
        в том числе поверх игры. Кликните по полю и нажмите сочетание — Esc отменяет.
      </p>
      <div className="grid max-w-3xl grid-cols-1 gap-1.5 md:grid-cols-2">
        {ACTIONS.map((a) => {
          const capturing = capture === a.id;
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
              style={{ background: "var(--dw-panel2)", borderColor: capturing ? "var(--dw-accent)" : "var(--dw-line)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium" style={{ color: "var(--dw-text)" }}>
                  {a.name}
                </p>
                <p className="truncate text-[10px]" style={{ color: "var(--dw-dim)" }}>
                  {a.hint}
                </p>
              </div>
              <button
                onClick={() => setCapture(capturing ? null : a.id)}
                className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-all"
                style={{
                  background: capturing ? "var(--dw-accent)" : "var(--dw-input)",
                  color: capturing ? "#fff" : "var(--dw-accent-2)",
                }}
              >
                {capturing ? "… нажмите …" : prettyCombo(hotkeys[a.id])}
              </button>
            </div>
          );
        })}
      </div>
    </Box>
  );
}
