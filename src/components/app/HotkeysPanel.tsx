import { useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import { DEFAULT_HOTKEYS, HOTKEY_META } from "../../lib/widget";
// RotateCcw уже импортирован выше — используется и для общего сброса, и для полей
import { Btn, Panel } from "./ui";

function comboFromEvent(e: React.KeyboardEvent<HTMLInputElement>): string | null {
  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta", "Escape", "Backspace", "Tab"].includes(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const upper = key.length === 1 ? key.toUpperCase() : key;
  parts.push(upper);
  return parts.join("+");
}

export default function HotkeysPanel({
  hotkeys, onChange, desktop, toast,
}: {
  hotkeys: Record<string, string>;
  onChange: (map: Record<string, string>) => void;
  desktop: boolean;
  toast: (t: string) => void;
}) {
  const [recording, setRecording] = useState<string | null>(null);

  const groups = HOTKEY_META.reduce<Record<string, typeof HOTKEY_META>>((acc, h) => {
    (acc[h.group] ||= []).push(h);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Panel
        title="Горячие клавиши"
        desc={
          desktop
            ? "Работают глобально, даже когда окно свёрнуто. Новое сочетание применяется сразу."
            : "Настройки сохраняются и применяются в desktop-сборке приложения."
        }
        right={
          <Btn
            variant="ghost"
            onClick={() => {
              onChange({ ...DEFAULT_HOTKEYS });
              toast("Комбинации сброшены к стандартным");
            }}
          >
            <RotateCcw size={12} /> Сбросить
          </Btn>
        }
      >
        <div className="space-y-4">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div
                className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--dw-dim)" }}
              >
                {group}
              </div>
              <div className="space-y-1.5">
                {items.map((h) => {
                  const value = hotkeys[h.id] ?? "";
                  const isRec = recording === h.id;
                  return (
                    <div
                      key={h.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--dw-hover)]"
                    >
                      <span className="min-w-0 text-[12px]">{h.label}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          readOnly
                          value={isRec ? "нажмите сочетание…" : value || "не задано"}
                          onFocus={() => setRecording(h.id)}
                          onBlur={() => setRecording(null)}
                          onKeyDown={(e) => {
                            e.preventDefault();
                            if (e.key === "Escape") {
                              setRecording(null);
                              return;
                            }
                            const combo = comboFromEvent(e);
                            if (combo) {
                              onChange({ ...hotkeys, [h.id]: combo });
                              setRecording(null);
                              toast(`${h.label}: ${combo}`);
                            }
                          }}
                          className="h-8 w-[168px] cursor-pointer rounded-lg border bg-transparent px-2.5 text-center font-mono text-[11px] outline-none"
                          style={{
                            borderColor: isRec ? "#8b5cf6" : "var(--dw-line)",
                            color: isRec ? "#a78bfa" : "var(--dw-text)",
                            background: isRec ? "#8b5cf614" : "var(--dw-input)",
                          }}
                        />
                        <button
                          onClick={() => {
                            const def = DEFAULT_HOTKEYS[h.id] ?? "";
                            onChange({ ...hotkeys, [h.id]: def });
                            toast(`${h.label}: сброшено на ${def || "не задано"}`);
                          }}
                          title="Сбросить на значение по умолчанию"
                          disabled={value === (DEFAULT_HOTKEYS[h.id] ?? "")}
                          className="grid h-8 w-8 place-items-center rounded-lg border transition-colors hover:border-viol disabled:opacity-30"
                          style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
                        >
                          <RotateCcw size={12} />
                        </button>
                        {value && (
                          <button
                            onClick={() => {
                              onChange({ ...hotkeys, [h.id]: "" });
                              toast("Комбинация отключена");
                            }}
                            title="Отключить"
                            className="rounded-md px-1.5 py-1 font-mono text-[10px] hover:underline"
                            style={{ color: "var(--dw-dim)" }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[10.5px]" style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}>
          <Keyboard size={12} />
          Нажмите поле и зажмите новое сочетание — оно сохранится сразу. Escape — отмена, ✕ — отключить.
        </div>
      </Panel>
    </div>
  );
}
