import {
  Ban, Download, Keyboard, MonitorPlay, Package, Radio, ShieldCheck,
  Sparkles, Volume2, Zap,
} from "lucide-react";
import { Keys, Logo, Reveal, Section } from "./bits";
import { GithubIcon } from "./brands";
import { APP_TAG, APP_VERSION } from "../version";
import { DEFAULT_HOTKEYS, HOTKEY_META } from "../lib/widget";

const RELEASE = "https://github.com/yawaside/Yawachat.test/releases/latest";

/* ================= возможности ================= */

const FEATURES = [
  {
    icon: Radio,
    title: "Пять площадок сразу",
    text: "Twitch, YouTube Live, VK Play Live, Kick и TikTok Live в одной ленте со статусами подключения и авто-переподключением.",
  },
  {
    icon: Volume2,
    title: "Озвучка голосом",
    text: "Системные голоса Windows (SAPI) читают сообщения вслух: скорость, громкость, шаблон и очередь с пропуском.",
  },
  {
    icon: Ban,
    title: "Фильтры и банворды",
    text: "Пресеты мата, скама, спама и 18+, свои чёрные списки, маскирование слов на «пип» и белый список авторов.",
  },
  {
    icon: MonitorPlay,
    title: "Виджет для OBS",
    text: "Локальный сервер с токеном, 9 тем, прозрачная подложка и живое время жизни сообщений. Browser Source — и готово.",
  },
  {
    icon: Sparkles,
    title: "Игровой оверлей",
    text: "Компактная лента поверх игры: поверх всех окон, перетаскивается, опционально пропускает клики мыши.",
  },
  {
    icon: ShieldCheck,
    title: "Никакой телеметрии",
    text: "Настройки лежат в settings.json рядом с exe. Без установки в реестр, без аккаунтов и облаков.",
  },
];

export function Features() {
  return (
    <Section
      id="features"
      index="02"
      kicker="возможности"
      title="Всё, что нужно стримеру для чата — и ничего лишнего"
      desc="Приложение делает одну вещь: собирает чат со всех площадок и помогает его не пропустить."
    >
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.05}>
            <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-viol/60 hover:bg-white/[0.05]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-viol/15 text-viol">
                <f.icon size={18} />
              </span>
              <h3 className="mt-4 font-display text-[15px] font-bold">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fog">{f.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ================= горячие клавиши ================= */

export function Hotkeys() {
  return (
    <Section
      id="hotkeys"
      index="05"
      kicker="управление"
      title="Горячие клавиши"
      desc="Работают глобально — даже когда окно приложения свёрнуто в трей. Комбинации меняются в настройках."
    >
      <div className="mt-14 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {HOTKEY_META.map((h, i) => (
          <div
            key={h.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10.5px] text-fog">
                {String(i + 1).padStart(2, "0")} · {h.group}
              </span>
              <span className="text-[14px]">{h.label}</span>
            </div>
            <Keys keys={(DEFAULT_HOTKEYS[h.id] || "").split("+")} />
          </div>
        ))}
        <div className="flex items-center gap-2 bg-cy/5 px-5 py-4 text-[12.5px] text-fog">
          <Keyboard size={14} className="text-cy" />
          Сочетания задаются в настройках приложения и сохраняются автоматически.
        </div>
      </div>
    </Section>
  );
}

/* ================= скачать ================= */

export function DownloadSection() {
  return (
    <Section
      id="download"
      index="06"
      kicker="скачать"
      title={
        <>
          YawaChatHub {APP_VERSION} — <span className="text-viol">portable и установщик</span>
        </>
      }
      desc="Один код, две сборки Windows x64: портативная (без установки) и обычный инсталлятор с ярлыками."
      className="border-t border-white/8"
    >
      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-2xl border border-viol/40 bg-gradient-to-br from-viol/15 to-transparent p-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-viol/40 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-viol">
              <Zap size={11} /> без установки
            </span>
            <h3 className="mt-4 font-display text-xl font-bold">Portable exe</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-fog">
              Один файл. Положите в любую папку (лучше не в Program Files) и запустите — настройки и
              settings.json живут рядом с exe.
            </p>
            <a
              href={`${RELEASE}/download/YawaChatHub.exe`}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-viol px-5 py-3 text-[14px] font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              <Download size={16} /> Скачать YawaChatHub.exe
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="h-full rounded-2xl border border-white/12 bg-white/[0.03] p-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fog">
              <Package size={11} /> установщик
            </span>
            <h3 className="mt-4 font-display text-xl font-bold">NSIS installer</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-fog">
              Классическая установка: ярлыки в меню «Пуск» и на рабочем столе, удаление через «Программы и
              компоненты».
            </p>
            <a
              href={`${RELEASE}/download/YawaChatHub-Setup.exe`}
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-[14px] font-semibold transition-colors hover:border-viol"
            >
              <Package size={16} /> Скачать YawaChatHub-Setup.exe
            </a>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.12}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5">
          <div className="text-[13px] text-fog">
            Релиз <span className="font-mono text-white">{APP_TAG}</span> собирается автоматически в GitHub Actions:
            билд → тег → публикация.
          </div>
          <a
            href="https://github.com/yawaside/Yawachat.test/releases"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-[13px] font-semibold transition-colors hover:border-viol"
          >
            <GithubIcon size={14} /> Все релизы
          </a>
        </div>
      </Reveal>
    </Section>
  );
}

/* ================= подвал ================= */

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-5 py-12 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          <Logo />
          <span className="font-mono text-[11px] text-fog">
            v{APP_VERSION} · MIT · Twitch / YouTube Live / VK Play Live / Kick / TikTok Live
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-[13px] text-fog">
          <a href="#demo" className="transition-colors hover:text-white">Демо</a>
          <a href="#features" className="transition-colors hover:text-white">Возможности</a>
          <a href="#download" className="transition-colors hover:text-white">Скачать</a>
          <a
            href="https://github.com/yawaside/Yawachat.test"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-white"
          >
            <GithubIcon size={14} /> GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
