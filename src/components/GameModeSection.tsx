import { Gamepad2, Lock, MousePointerClick, Move } from "lucide-react";
import { PlatformIcon, Reveal, Section } from "./bits";
import { Eq } from "./bits";

const POINTS = [
  { icon: Move, title: "Перетаскивается мышью", text: "Потяните окно в удобный угол — позиция запоминается." },
  { icon: MousePointerClick, title: "Сквозные клики", text: "Опция «клики насквозь» — игра продолжает получать ввод." },
  { icon: Lock, title: "Фиксация позиции", text: "Заблокируйте оверлей, чтобы случайно не сдвинуть во время игры." },
];

export default function GameModeSection() {
  return (
    <Section
      id="game"
      index="04"
      kicker="game mode"
      title="Оверлей поверх игры — читайте чат, не выходя из матча"
      desc="Отдельное окно всегда поверх игры: компактная лента, прозрачная подложка и мгновенное включение по горячей клавише."
    >
      <div className="mt-14 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-white/10">
            <img
              src="/game.jpg"
              alt="Игровой оверлей YawaChatHub поверх игры"
              className="h-[380px] w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-void via-void/25 to-transparent" />

            {/* оверлей поверх «игры» */}
            <div className="absolute right-4 top-4 w-[240px] rounded-xl border border-white/15 bg-black/55 p-3 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2">
                <Eq color="#22d3ee" />
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-cy">overlay</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { id: "twitch", a: "neon_wolf", t: "ЛЕЕЕЕТС ГОООУ", c: "#a78bfa" },
                  { id: "kick", a: "vanya_fps", t: "модератор молодец", c: "#4ade80" },
                  { id: "tiktok", a: "luna228", t: "пошёл за чаем", c: "#f472b6" },
                ].map((m, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center" style={{ color: m.c }}>
                      <PlatformIcon id={m.id as "twitch" | "youtube" | "vk" | "kick" | "tiktok"} size={12} />
                    </span>
                    <p className="text-[11px] leading-snug text-white/90">
                      <span className="mr-1 font-bold" style={{ color: m.c }}>{m.a}</span>
                      {m.t}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-white/15 bg-black/50 px-3 py-2 backdrop-blur-sm">
              <Gamepad2 size={13} className="text-viol" />
              <span className="font-mono text-[10.5px] text-white/80">Ctrl+Shift+G — показать / скрыть</span>
            </div>
          </div>
        </Reveal>

        <div className="space-y-4">
          {POINTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cy/15 text-cy">
                  <p.icon size={17} />
                </span>
                <div>
                  <h3 className="font-display text-[14.5px] font-bold">{p.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-fog">{p.text}</p>
                </div>
              </div>
            </Reveal>
          ))}

          <Reveal delay={0.2}>
            <div className="rounded-2xl border border-viol/30 bg-viol/10 p-5 text-[13px] leading-relaxed text-fog">
              Оверлей рисуется из того же кода, что и основное окно — отдельная копия чата не нужна: сообщения
              приходят в оба окна одновременно.
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
