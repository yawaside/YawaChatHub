import type { PlatformId } from "./types";

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  short: string;
  color: string;
  gradient?: string;
  hint: string;
}

export const PLATFORMS: PlatformMeta[] = [
  { id: "twitch", name: "Twitch", short: "TV", color: "#9146FF", hint: "username канала" },
  { id: "youtube", name: "YouTube Live", short: "YT", color: "#FF0033", hint: "@handle или id канала" },
  { id: "vkplay", name: "VK Видео Live", short: "VK", color: "#0077FF", hint: "username канала" },
  { id: "kick", name: "Kick", short: "KK", color: "#53FC18", hint: "username канала" },
  { id: "tiktok", name: "TikTok Live", short: "TT", color: "#FE2C55", hint: "@username" },
  { id: "donationalerts", name: "DonationAlerts", short: "DA", color: "#F57D07", hint: "токен из ссылки виджета алертов" },
];

export function platformMeta(id: PlatformId): PlatformMeta {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

/* -------- брендовые иконки (упрощённые логотипы) -------- */

export function TwitchIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M4.3 1 2 5v16h5v3h3l3-3h4l5-6V1H4.3Zm15.5 13-3 3h-4l-3 3v-3H6V3.5h13.8V14ZM16 6.5h1.8v5H16V6.5Zm-5 0h1.8v5H11V6.5Z" />
    </svg>
  );
}

export function YouTubeIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M23 7.2s-.2-1.6-.9-2.3c-.9-1-1.9-1-2.4-1C16.4 3.6 12 3.6 12 3.6h0s-4.4 0-7.7.3c-.5.1-1.5.1-2.4 1-.7.7-.9 2.3-.9 2.3S.7 9.1.7 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9 1 2 .9 2.6 1 .9.1 3.9.3 7.6.3s7.7-.3 7.7-.3c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8Zm-13.3 6.5V8.2l6.1 2.8-6.1 2.7Z" />
    </svg>
  );
}

/**
 * VK Видео Live — оригинальный логотип: синий скруглённый бейдж
 * с белым «play» и подписью LIVE (фирменный синий VK #0077FF).
 */
export function VkVideoLiveIcon({
  size = 14,
  color = "#0077FF",
  brand = true,
}: {
  size?: number;
  color?: string;
  /** true — фирменный синий бейдж с белым знаком */
  brand?: boolean;
}) {
  if (brand) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        {/* фирменный «squircle» VK */}
        <path
          fill={color}
          d="M0 22.1C0 11.7 0 6.5 3.2 3.2 6.5 0 11.7 0 22.1 0h3.8c10.4 0 15.6 0 18.9 3.2C48 6.5 48 11.7 48 22.1v3.8c0 10.4 0 15.6-3.2 18.9C41.5 48 36.3 48 25.9 48h-3.8c-10.4 0-15.6 0-18.9-3.2C0 41.5 0 36.3 0 25.9v-3.8Z"
        />
        {/* экран плеера */}
        <rect x="9" y="13" width="30" height="19" rx="4.5" fill="#fff" />
        {/* кнопка play */}
        <path fill={color} d="M20.6 18.6a1 1 0 0 1 1.5-.9l7 3.9a1 1 0 0 1 0 1.7l-7 3.9a1 1 0 0 1-1.5-.8v-7.8Z" />
        {/* индикатор LIVE */}
        <rect x="15" y="35" width="18" height="5.5" rx="2.75" fill="#fff" />
        <circle cx="19.2" cy="37.7" r="1.6" fill="#FF3347" />
        <path
          fill={color}
          d="M22.9 35.9h1.2v3h1.6v1.1h-2.8v-4.1Zm3.4 0h1.2v4.1h-1.2v-4.1Zm2 0h1.3l.8 2.6.8-2.6h1.2l-1.4 4.1h-1.3l-1.4-4.1Z"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill={color} aria-hidden>
      <rect x="4" y="10" width="40" height="26" rx="6" fill="none" stroke={color} strokeWidth="3.4" />
      <path d="M20 18.8a1 1 0 0 1 1.5-.9l8.4 4.6a1 1 0 0 1 0 1.8l-8.4 4.6a1 1 0 0 1-1.5-.9v-9.2Z" />
    </svg>
  );
}

/** совместимость со старым именем */
export const VkPlayIcon = VkVideoLiveIcon;

export function KickIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M3 2h4.4v4.4h3.1V3.3h3.1V2H18v4.4h-3.1v3.1h-3.1v4.9h3.1v3.1H18V22h-4.4v-1.3h-3.1v-3.1H7.4V22H3V2Z" />
    </svg>
  );
}

export function TikTokIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M16.6 3c.4 2.3 1.9 3.8 4.4 4v3.1c-1.6 0-3.1-.5-4.4-1.4v6.6A6.2 6.2 0 1 1 8.1 9.2c.4 0 .8 0 1.2.1v3.3a3 3 0 1 0 2.1 2.9V3h5.2Z" />
    </svg>
  );
}

/**
 * Оригинальный логотип DonationAlerts — фирменный «звуковой рупор/колокол»
 * с волнами оповещения в круглом бейдже (брендовый оранжевый #F57D07).
 */
export function DonationAlertsIcon({
  size = 14,
  color = "#F57D07",
  brand = true,
}: {
  size?: number;
  color?: string;
  /** true — фирменный оранжевый круг с белым знаком (как в бренд-ките) */
  brand?: boolean;
}) {
  if (brand) {
    // Фирменный знак DonationAlerts: оранжево-жёлтый скруглённый квадрат
    // с белым колоколом оповещения.
    const gid = `da-grad-${size}`;
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFA320" />
            <stop offset="100%" stopColor="#F5620A" />
          </linearGradient>
        </defs>
        {/* squircle в стиле бренда */}
        <path
          fill={`url(#${gid})`}
          d="M0 22.1C0 11.7 0 6.5 3.2 3.2 6.5 0 11.7 0 22.1 0h3.8c10.4 0 15.6 0 18.9 3.2C48 6.5 48 11.7 48 22.1v3.8c0 10.4 0 15.6-3.2 18.9C41.5 48 36.3 48 25.9 48h-3.8c-10.4 0-15.6 0-18.9-3.2C0 41.5 0 36.3 0 25.9v-3.8Z"
        />
        {/* колокол */}
        <path
          fill="#fff"
          d="M24 10.5c-1.5 0-2.7 1.2-2.7 2.7v1c-4.4 1.2-7.6 5.2-7.6 9.9v5.2l-2 3.3c-.7 1.1.1 2.5 1.4 2.5h21.8c1.3 0 2.1-1.4 1.4-2.5l-2-3.3v-5.2c0-4.7-3.2-8.7-7.6-9.9v-1c0-1.5-1.2-2.7-2.7-2.7Z"
        />
        {/* язычок */}
        <path fill="#fff" d="M20.4 37.4h7.2c-.4 2-2.1 3.5-4.1 3.5s-3.7-1.5-4.1-3.5Z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill={color} aria-hidden>
      <path d="M24 5.5c-1.6 0-2.9 1.3-2.9 2.9v1c-4.9 1.3-8.4 5.7-8.4 11v6.3l-2.6 4.2c-.7 1.2.1 2.7 1.5 2.7h24.8c1.4 0 2.2-1.5 1.5-2.7l-2.6-4.2v-6.3c0-5.3-3.5-9.7-8.4-11v-1c0-1.6-1.3-2.9-2.9-2.9Z" />
      <path d="M19.6 36.4h8.8c-.4 2.2-2.2 3.9-4.4 3.9s-4-1.7-4.4-3.9Z" />
      <path
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        d="M37.2 9.6a15.7 15.7 0 0 1 4 9.7M10.8 9.6a15.7 15.7 0 0 0-4 9.7"
      />
    </svg>
  );
}

export function PlatformIcon({ id, size = 14, color }: { id: PlatformId; size?: number; color?: string }) {
  const c = color ?? platformMeta(id).color;
  switch (id) {
    case "twitch":
      return <TwitchIcon size={size} color={c} />;
    case "youtube":
      return <YouTubeIcon size={size} color={c} />;
    case "vkplay":
      return <VkVideoLiveIcon size={size} color={c} />;
    case "kick":
      return <KickIcon size={size} color={c} />;
    case "tiktok":
      return <TikTokIcon size={size} color={c} />;
    case "donationalerts":
      return <DonationAlertsIcon size={size} color={c} />;
  }
}

/** никнеймы цветные как на площадках */
export const NICK_COLORS = [
  "#FF6B6B", "#FFA94D", "#FFD43B", "#69DB7C", "#38D9A9",
  "#4DABF7", "#9775FA", "#F783AC", "#63E6BE", "#74C0FC",
  "#B197FC", "#E599F7",
];

export function nickColor(name: string, accent: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NICK_COLORS[h % NICK_COLORS.length] || accent;
}
