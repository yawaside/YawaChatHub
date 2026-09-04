import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

/* ---------- контейнеры ---------- */

export function Panel({
  title, desc, right, children, className = "", collapsible = false, defaultOpen = false,
}: {
  title?: string; desc?: string; right?: ReactNode; children: ReactNode; className?: string;
  /** Сворачиваемый блок настроек. Предпросмотры и ключевые блоки остаются раскрытыми. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  return (
    <section
      className={`rounded-2xl border p-4 ${className}`}
      style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
    >
      {(title || right) && (
        <header className={`flex items-start justify-between gap-3 ${shown ? "mb-3" : ""}`}>
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
            >
              <ChevronDown
                size={14}
                className="mt-0.5 shrink-0 transition-transform duration-200"
                style={{ color: "var(--dw-dim)", transform: open ? "none" : "rotate(-90deg)" }}
              />
              <span className="min-w-0">
                {title && <h3 className="text-[13px] font-semibold">{title}</h3>}
                {desc && shown && (
                  <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>{desc}</p>
                )}
              </span>
            </button>
          ) : (
            <div className="min-w-0">
              {title && <h3 className="text-[13px] font-semibold">{title}</h3>}
              {desc && <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>{desc}</p>}
            </div>
          )}
          {right}
        </header>
      )}
      {shown && children}
    </section>
  );
}

/** Компактный выпадающий список для настроек. */
export function Select<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="dw-select w-full appearance-none pr-7"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
        style={{ color: "var(--dw-dim)" }}
      />
    </div>
  );
}

/** Выбор цвета с текстовым полем. */
export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-lg border bg-transparent p-1"
        style={{ borderColor: "var(--dw-line)" }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 font-mono text-[11px] outline-none focus:border-viol"
        style={{ borderColor: "var(--dw-line)" }}
      />
    </div>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--dw-dim)" }}>
        {children}
      </span>
      {hint && <span className="font-mono text-[10.5px]" style={{ color: "var(--dw-dim)" }}>{hint}</span>}
    </div>
  );
}

/* ---------- контролы ---------- */

export function Slider({
  value, min, max, step = 1, onChange, format, color = "#8b5cf6",
}: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string; color?: string;
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--p" as string]: `${p}%`, ["--range-fill" as string]: color }}
      />
      <span className="w-[62px] shrink-0 text-right font-mono text-[11px]" style={{ color: "var(--dw-dim)" }}>
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Toggle({
  on, onChange, label, hint, accent = "#8b5cf6", disabled,
}: {
  on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; accent?: string; disabled?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && onChange(!on)}
      onKeyDown={(e) => e.key === "Enter" && !disabled && onChange(!on)}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--dw-hover)]"
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <span className="min-w-0">
        <span className="block text-[12px] font-medium">{label}</span>
        {hint && <span className="block text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>{hint}</span>}
      </span>
      <span
        className="relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors duration-300"
        style={{ background: on ? accent : "var(--dw-input)" }}
      >
        <span
          className="absolute top-1/2 h-[13px] w-[13px] rounded-full bg-white shadow transition-all duration-300"
          style={{ left: 3, transform: `translate(${on ? 15 : 0}px, -50%)` }}
        />
      </span>
    </div>
  );
}

export function Btn({
  children, onClick, variant = "ghost", disabled, className = "", title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "danger" | "outline";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed";
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "#8b5cf6", color: "#fff" },
    danger: { background: "rgba(248,113,113,0.14)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" },
    outline: { border: "1px solid var(--dw-line)", color: "var(--dw-text)" },
    ghost: { background: "var(--dw-input)", color: "var(--dw-text)" },
  };
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${base} ${className}`} style={styles[variant]}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: Array<{ id: T; label: ReactNode }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border p-1" style={{ borderColor: "var(--dw-line)" }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all"
          style={{
            background: value === o.id ? "#8b5cf6" : "transparent",
            color: value === o.id ? "#fff" : "var(--dw-dim)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- список слов (теги) ---------- */

export function TagInput({
  items, onChange, placeholder, accent = "#f87171",
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  accent?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .filter((s) => !items.includes(s));
    if (parts.length) onChange([...items, ...parts]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 text-[11.5px] outline-none placeholder:text-[var(--dw-dim)] focus:border-viol"
          style={{ borderColor: "var(--dw-line)" }}
        />
        <Btn variant="primary" onClick={add} disabled={!draft.trim()}>
          Добавить
        </Btn>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((w) => (
            <span
              key={w}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10.5px]"
              style={{ background: `${accent}1f`, color: accent }}
            >
              {w}
              <button onClick={() => onChange(items.filter((x) => x !== w))} title="Удалить">
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            onClick={() => onChange([])}
            className="rounded-md px-2 py-1 font-mono text-[10.5px] underline-offset-2 hover:underline"
            style={{ color: "var(--dw-dim)" }}
          >
            очистить всё ({items.length})
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- числовое поле ---------- */

export function NumberInput({
  value, min, max, onChange, suffix,
}: {
  value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="h-8 w-24 rounded-lg border bg-transparent px-2.5 font-mono text-[11.5px] outline-none focus:border-viol"
        style={{ borderColor: "var(--dw-line)" }}
      />
      {suffix && <span className="font-mono text-[10.5px]" style={{ color: "var(--dw-dim)" }}>{suffix}</span>}
    </div>
  );
}

/* ---------- индикатор автосохранения ---------- */

export function AutoSave({ stamp }: { stamp: number }) {
  if (!stamp) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px]"
      style={{ color: "#22d3ee" }}
      title="Настройки сохраняются автоматически"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#22d3ee" }} />
      сохранено автоматически
    </span>
  );
}
