import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { AudioWaveform } from "lucide-react";
import { KickIcon, TiktokIcon, TwitchIcon, VkIcon, YoutubeIcon } from "./brands";
import type { PlatformId } from "../lib/core";
import { PLATFORMS } from "../lib/core";

/* ---------- reveal on scroll ---------- */
export function Reveal({
  children, delay = 0, className, y = 26,
}: {
  children: ReactNode; delay?: number; className?: string; y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- section shell ---------- */
export function Section({
  id, index, kicker, title, desc, children, className = "",
}: {
  id: string;
  index: string;
  kicker: string;
  title: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`relative scroll-mt-24 px-5 py-24 sm:px-8 md:py-32 ${className}`}>
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="mb-4 flex items-center gap-3">
            <span className="font-mono text-[11px] tracking-[0.25em] text-viol">{index}</span>
            <span className="h-px w-10 bg-white/15" />
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">{kicker}</span>
          </div>
          <h2 className="max-w-3xl font-display text-[clamp(1.7rem,4.2vw,3rem)] font-bold leading-[1.08] tracking-tight">
            {title}
          </h2>
          {desc && <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fog">{desc}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

/* ---------- logo ---------- */
export function Logo({ size = 15 }: { size?: number }) {
  return (
    <a href="#top" className="group flex items-center gap-3">
      <span
        className="grid place-items-center rounded-[11px] bg-gradient-to-br from-viol to-cy shadow-[0_0_24px_rgba(139,92,246,0.45)] transition-transform duration-500 group-hover:rotate-[8deg]"
        style={{ width: size * 2.4, height: size * 2.4 }}
      >
        <AudioWaveform size={size} strokeWidth={2.4} className="text-white" />
      </span>
      <span className="font-display text-[15px] font-bold tracking-tight">
        Yawa<span className="text-viol">Chat</span>
        <span className="text-fog">Hub</span>
      </span>
    </a>
  );
}

/* ---------- platform icon ---------- */
export function PlatformIcon({ id, size = 13 }: { id: PlatformId; size?: number }) {
  if (id === "twitch") return <TwitchIcon size={size} />;
  if (id === "youtube") return <YoutubeIcon size={size} />;
  if (id === "kick") return <KickIcon size={size} />;
  if (id === "tiktok") return <TiktokIcon size={size} />;
  return <VkIcon size={size} />;
}

export function PlatformChip({ id, active = true }: { id: PlatformId; active?: boolean }) {
  const p = PLATFORMS[id];
  return (
    <span
      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px]"
      style={{ background: `${p.color}22`, color: p.color, opacity: active ? 1 : 0.4 }}
      title={p.label}
    >
      <PlatformIcon id={id} size={12} />
    </span>
  );
}

/* ---------- small switch ---------- */
export function Switch({
  on, onChange, small = false, accent = "#8b5cf6",
}: {
  on: boolean; onChange: (v: boolean) => void; small?: boolean; accent?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className="relative shrink-0 rounded-full transition-colors duration-300"
      style={{
        width: small ? 34 : 44,
        height: small ? 19 : 24,
        background: on ? accent : "rgba(255,255,255,0.14)",
        boxShadow: on ? `0 0 14px ${accent}55` : "none",
      }}
    >
      <span
        className="absolute top-1/2 rounded-full bg-white transition-all duration-300"
        style={{
          width: small ? 13 : 17,
          height: small ? 13 : 17,
          left: small ? 3 : 3.5,
          transform: `translate(${on ? (small ? 15 : 20) : 0}px, -50%)`,
        }}
      />
    </button>
  );
}

/* ---------- kbd combo ---------- */
export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-[10px] text-fog">+</span>}
          <kbd className="kbd">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

/* ---------- equalizer bars ---------- */
export function Eq({ color = "#8b5cf6" }: { color?: string }) {
  return (
    <span className="flex h-3.5 items-end gap-[2.5px]">
      {[0.9, 0.5, 0.7, 0.35].map((d, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom animate-eq rounded-full"
          style={{ height: "100%", background: color, animationDelay: `${i * 0.13}s`, animationDuration: `${d}s` }}
        />
      ))}
    </span>
  );
}
