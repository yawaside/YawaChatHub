import { ExternalLink, Heart } from "lucide-react";
import type { PlatformId } from "../../lib/types";
import { PlatformIcon } from "../../lib/platforms";
import { openExternal } from "../../lib/bridge";
import { Box } from "./ui";

/** Иконка Telegram: своя, т.к. это не площадка трансляций из PlatformId. */
function TelegramIcon({ size = 20, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M21.94 4.3 18.9 19.1c-.23 1.02-.84 1.27-1.7.79l-4.7-3.46-2.27 2.18c-.25.25-.46.46-.94.46l.33-4.78 8.7-7.86c.38-.34-.08-.53-.59-.19L6.97 13.1l-4.63-1.45c-1.01-.31-1.03-1 .21-1.49l18.1-6.98c.84-.3 1.57.2 1.29 1.12Z" />
    </svg>
  );
}

interface Link {
  /** id площадки для иконки; "telegram" — своя иконка */
  id: PlatformId | "telegram";
  name: string;
  handle: string;
  action: string;
  url: string;
  /** градиент баннера в цветах площадки */
  gradient: string;
  glow: string;
}

const LINKS: Link[] = [
  {
    id: "donationalerts",
    name: "DonationAlerts",
    handle: "yawaside",
    action: "Поддержать донатом",
    url: "https://www.donationalerts.com/r/yawaside",
    gradient: "linear-gradient(120deg, #FFA320 0%, #F5620A 100%)",
    glow: "rgba(245,98,10,0.35)",
  },
  {
    id: "telegram",
    name: "Telegram",
    handle: "Группа приложения",
    action: "Новости, помощь и предложения",
    url: "https://t.me/+pk1zIbjQle01NWEy",
    gradient: "linear-gradient(120deg, #2AABEE 0%, #229ED9 100%)",
    glow: "rgba(42,171,238,0.35)",
  },
  {
    id: "twitch",
    name: "Twitch",
    handle: "yawaside_",
    action: "Смотреть стримы",
    url: "https://www.twitch.tv/yawaside_",
    gradient: "linear-gradient(120deg, #9146FF 0%, #6441A5 100%)",
    glow: "rgba(145,70,255,0.35)",
  },
  {
    id: "youtube",
    name: "YouTube",
    handle: "@YAWASIDE",
    action: "Подписаться на канал",
    url: "https://www.youtube.com/@YAWASIDE",
    gradient: "linear-gradient(120deg, #FF4E45 0%, #C00 100%)",
    glow: "rgba(255,0,51,0.32)",
  },
  {
    id: "vkplay",
    name: "VK Видео Live",
    handle: "yawaside",
    action: "Смотреть трансляции",
    url: "https://live.vkvideo.ru/yawaside",
    gradient: "linear-gradient(120deg, #2D9CFF 0%, #0055FF 100%)",
    glow: "rgba(0,119,255,0.32)",
  },
];

/**
 * «Поддержи автора» — баннеры-ссылки на площадки разработчика.
 * Открываются во внешнем браузере, а не внутри окна приложения.
 */
export default function SupportPanel() {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="overflow-hidden rounded-2xl border p-4"
        style={{
          borderColor: "var(--dw-line)",
          background:
            "linear-gradient(120deg, color-mix(in srgb, var(--dw-accent) 22%, transparent), transparent 70%), var(--dw-panel)",
        }}
      >
        <div className="flex items-center gap-2.5 pb-1.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(135deg, #f472b6, #ec4899)" }}
          >
            <Heart size={17} color="#fff" fill="#fff" />
          </span>
          <div>
            <h3 className="text-[14px] font-bold" style={{ color: "var(--dw-text)" }}>
              Поддержи автора
            </h3>
            <p className="text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
              YawaChatHub — бесплатный проект с открытым кодом
            </p>
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--dw-dim)" }}>
          Подписка на каналы и донат помогают развивать приложение: новые площадки,
          стили оформления и функции появляются благодаря вашей поддержке.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LINKS.map((l) => (
          <button
            key={l.id}
            onClick={() => openExternal(l.url)}
            title={l.url}
            className="group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-xl p-3 text-left transition-all hover:brightness-110"
            style={{ background: l.gradient, boxShadow: `0 4px 18px ${l.glow}` }}
          >
            {/* декоративный блик */}
            <span
              className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full opacity-20"
              style={{ background: "#fff" }}
            />
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(255,255,255,0.22)" }}
            >
              {l.id === "telegram" ? (
                <TelegramIcon size={20} color="#fff" />
              ) : (
                <PlatformIcon id={l.id} size={20} color="#fff" />
              )}
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-white">{l.name}</span>
              <span className="block truncate text-[11px] text-white/80">{l.handle}</span>
              <span className="block truncate pt-0.5 text-[10.5px] font-medium text-white/70">{l.action}</span>
            </span>
            <ExternalLink size={15} className="relative shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>

      <Box collapsible={false} title="О программе">
        <div className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
          <p>
            <b style={{ color: "var(--dw-text)" }}>YawaChatHub</b> — единая лента чата со всех стримов,
            озвучка голосом, виджет для OBS и игровой оверлей.
          </p>
          <p>Площадки: Twitch · YouTube Live · VK Видео Live · Kick · TikTok Live · DonationAlerts</p>
          <p className="pt-1">Оболочка: WebView2 (.NET 8) · Лицензия MIT</p>
        </div>
      </Box>
    </div>
  );
}
