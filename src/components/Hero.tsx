import { motion } from "framer-motion";
import { ArrowDown, Download, Package, Play } from "lucide-react";
import { Eq, PlatformIcon } from "./bits";
import { PLATFORM_LIST } from "../lib/core";
import { APP_TAG, APP_VERSION } from "../version";

const RELEASE = "https://github.com/yawaside/Yawachat.test/releases/latest";

const BUBBLES = [
  { author: "neon_wolf", text: "ЛЕЕЕЕТС ГОООУ", color: "#a78bfa", delay: 0 },
  { author: "mila_lav", text: "привет из тиктока, залетела на огонёк", color: "#ff3b5c", delay: 1.4 },
  { author: "КиберДед", text: "респект за упорство, смотрю третий год", color: "#4ade80", delay: 2.6 },
];

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-5 pb-16 pt-28 sm:px-8 md:pb-24 md:pt-36">
      {/* фон */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-bg absolute inset-0 opacity-60" />
        <div className="absolute -left-32 top-10 h-[420px] w-[420px] rounded-full bg-viol/25 blur-[120px]" />
        <div className="absolute -right-24 top-40 h-[380px] w-[380px] rounded-full bg-cy/20 blur-[120px]" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        {/* текст */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-fog">
              <span className="h-1.5 w-1.5 rounded-full bg-cy" />
              версия {APP_VERSION} · {APP_TAG}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 font-display text-[clamp(2.1rem,6vw,4.4rem)] font-extrabold leading-[0.98] tracking-tight"
          >
            Все чаты стрима —
            <br />
            <span className="bg-gradient-to-r from-viol via-[#c4b5fd] to-cy bg-clip-text text-transparent">
              в одной ленте
            </span>{" "}
            с озвучкой
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.12 }}
            className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-fog"
          >
            YawaChatHub собирает сообщения Twitch, YouTube Live, VK Play Live, Kick и TikTok Live в единый
            поток, озвучивает их голосом и отдаёт картинку в OBS. Портативная версия без установки и обычный
            установщик — на выбор.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.18 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href={`${RELEASE}/download/YawaChatHub.exe`}
              className="inline-flex items-center gap-2 rounded-2xl bg-viol px-5 py-3 text-[14px] font-semibold text-white shadow-[0_0_36px_rgba(139,92,246,0.45)] transition-transform hover:scale-[1.03]"
            >
              <Download size={16} /> Portable exe
            </a>
            <a
              href={`${RELEASE}/download/YawaChatHub-Setup.exe`}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-[14px] font-semibold transition-colors hover:border-viol"
            >
              <Package size={16} /> Установщик
            </a>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[14px] text-fog transition-colors hover:text-white"
            >
              <Play size={15} /> Живое демо
            </a>
          </motion.div>

          <div className="mt-9 flex flex-wrap items-center gap-2.5">
            {PLATFORM_LIST.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-fog"
              >
                <span
                  className="grid h-5 w-5 place-items-center rounded-md"
                  style={{ background: `${p.color}22`, color: p.color }}
                >
                  <PlatformIcon id={p.id} size={12} />
                </span>
                {p.label}
              </span>
            ))}
          </div>
        </div>

        {/* превью */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="relative"
        >
          <div className="relative rounded-[26px] border border-white/10 bg-panel/80 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-fog">
                <Eq /> озвучка активна
              </span>
              <span className="font-mono text-[10.5px] text-fog">5 каналов</span>
            </div>

            <div className="space-y-2.5">
              {[
                { id: "twitch", p: "#a970ff", a: "neon_wolf", t: "ЛЕЕЕЕТС ГОООУ", delay: 0 },
                { id: "kick", p: "#53fc18", a: "cyber_arena", t: "кик грузит быстрее всех, факт", delay: 0.12 },
                { id: "youtube", p: "#ff4e45", a: "LofiRadio", t: "какой трек сейчас играет?", delay: 0.24 },
                { id: "tiktok", p: "#ff3b5c", a: "@yawa.live", t: "приветики из тиктока", delay: 0.36 },
                { id: "vk", p: "#4c8dff", a: "vklive.cyber", t: "смотрю с вк и с кика одновременно", delay: 0.48 },
              ].map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 + m.delay }}
                  className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center" style={{ color: m.p }}>
                    <PlatformIcon id={m.id as "twitch" | "youtube" | "vk" | "kick" | "tiktok"} size={14} />
                  </span>
                  <div className="min-w-0">
                    <span className="mr-2 text-[13px] font-bold" style={{ color: m.p }}>{m.a}</span>
                    <span className="text-[13.5px] text-white/85">{m.t}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-cy/25 bg-cy/10 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Eq color="#22d3ee" />
                <span className="font-mono text-[10.5px] text-cy">neon_wolf с Твича говорит: летс гоу</span>
              </div>
            </div>
          </div>

          {/* всплывающие сообщения */}
          {BUBBLES.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -20] }}
              transition={{ duration: 7, delay: b.delay, repeat: Infinity, repeatDelay: 1 }}
              className="absolute rounded-2xl border border-white/10 bg-void/90 px-3 py-2 text-[11.5px] shadow-2xl backdrop-blur"
              style={{ [i === 0 ? "top" : i === 1 ? "bottom" : "top"]: i === 1 ? -18 : i === 0 ? -14 : "42%", right: i === 2 ? -22 : -10 }}
            >
              <span className="mr-1.5 font-bold" style={{ color: b.color }}>{b.author}</span>
              <span className="text-white/80">{b.text}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="mx-auto mt-16 flex w-full max-w-6xl items-center gap-3 text-fog">
        <ArrowDown size={14} className="animate-bounce" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em]">что внутри</span>
      </div>
    </section>
  );
}
