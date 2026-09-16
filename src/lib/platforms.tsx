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
  { id: "rutube", name: "Rutube", short: "RT", color: "#14191F", hint: "ссылка на канал, его номер или ссылка на эфир" },
  { id: "boosty", name: "Boosty", short: "BY", color: "#F15F2C", hint: "имя блога в ссылке boosty.to/…" },
  { id: "donationalerts", name: "DonationAlerts", short: "DA", color: "#F57D07", hint: "токен из ссылки виджета алертов" },
  { id: "donatepay", name: "DonatePay", short: "DP", color: "#44AB4F", hint: "API-ключ из раздела «API»" },
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
 * DonationAlerts — ОРИГИНАЛЬНЫЙ фирменный знак: «облачко уведомления» с
 * восклицательным знаком и уголком, в фирменном оранжевом градиенте
 * (#F59C07 → #F57507). Контур взят один в один с официального логотипа.
 */
export function DonationAlertsIcon({
  size = 14,
  color = "#F57D07",
  brand = true,
}: {
  size?: number;
  color?: string;
  /** true — фирменный оранжевый градиент, false — одноцветная заливка */
  brand?: boolean;
}) {
  const gid = `da-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 37 43" aria-hidden>
      {brand && (
        <defs>
          <linearGradient id={gid} x1="86.328%" x2="8.51%" y1="11.463%" y2="100%">
            <stop offset="0%" stopColor="#F59C07" />
            <stop offset="100%" stopColor="#F57507" />
          </linearGradient>
        </defs>
      )}
      <path
        fill={brand ? `url(#${gid})` : color}
        fillRule="nonzero"
        d="M18.692 25.041h-2.906a.63.63 0 0 1-.445-.175.502.502 0 0 1-.152-.415l.257-2.626c.025-.28.285-.495.596-.494h2.907c.17 0 .33.063.445.176.113.112.169.263.152.414l-.257 2.627c-.025.28-.285.494-.597.493zm.466-5.143h-2.96a.582.582 0 0 1-.593-.571l.806-8.875a.585.585 0 0 1 .592-.503h2.96c.327 0 .593.256.593.571l-.83 8.88a.585.585 0 0 1-.568.498zM36.566 9.549L28.898.63A1.81 1.81 0 0 0 27.525 0H4.56a1.803 1.803 0 0 0-1.8 1.616L.006 32.896c-.044.503.126 1 .468 1.373a1.81 1.81 0 0 0 1.332.582h4.51L5.63 43l8.869-8.143h10.074c.47 0 .922-.18 1.26-.507l9.462-9.155c.312-.302.504-.705.541-1.137l1.157-13.184a1.794 1.794 0 0 0-.427-1.325zm-7.013 11.994a1.796 1.796 0 0 1-.541 1.142l-5.478 5.197a1.81 1.81 0 0 1-1.249.496h-13.4a1.831 1.831 0 0 1-1.324-.59 1.816 1.816 0 0 1-.476-1.365L8.707 8.11a1.803 1.803 0 0 1 1.8-1.616h13.628c.522 0 1.02.226 1.362.62l4.326 4.976c.326.358.494.832.465 1.314l-.735 8.138z"
      />
    </svg>
  );
}

/**
 * DonatePay — ОРИГИНАЛЬНЫЙ фирменный знак: «бесконечность» из двух колец
 * с плюсом и точками, фирменный зелёный #44AB4F. Контуры взяты один в один
 * с официального логотипа площадки.
 */
export function DonatePayIcon({
  size = 14,
  color = "#44AB4F",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 16" aria-hidden>
      {/* кольца «бесконечности» */}
      <path
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.704 11.208l.003.003.002.004c1.426 2.03 3.237 3.619 6.194 3.619 3.913 0 7.097-3.14 7.097-7 0-3.855-3.19-7-7.097-7-2.175 0-3.859.918-5.1 2.189-1.215 1.243-2.068 2.788-2.909 4.313l-.084.153c-.86 1.557-1.729 3.077-2.758 4.138-.514.53-1.057.965-1.7 1.264-.645.301-1.375.46-2.255.46-3.1 0-5.592-2.459-5.592-5.517 0-3.043 2.507-5.516 5.592-5.516 2.504 0 3.992 1.398 5.237 3.266.263-.456.543-.92.84-1.39C11.764 2.293 9.96.835 7.097.835 3.184.834 0 3.974 0 7.834c0 3.854 3.19 7 7.097 7 2.155 0 3.838-.918 5.067-2.189.83-.857 1.488-1.862 2.093-2.908l.28-.485.257.497c.195.377.574 1.008.91 1.46zm.647-1.69l.003.004c1.31 2.135 2.844 3.828 5.549 3.828 3.085 0 5.593-2.473 5.593-5.516 0-3.059-2.492-5.516-5.593-5.516-1.807 0-2.97.646-4.02 1.722-.857.876-1.65 2.257-2.35 3.497l-.054.096.02.108c.047.236.207.579.366.889.166.323.354.655.484.883l.002.005z"
      />
      {/* точки внутри правого кольца */}
      <path
        fill={color}
        d="M21.063 5.802a.91.91 0 01.916-.903.91.91 0 01.916.903.91.91 0 01-.916.903.91.91 0 01-.916-.903zm-1.984 1.957a.91.91 0 01.916-.904.91.91 0 01.915.904.91.91 0 01-.915.903.91.91 0 01-.916-.903zm4.884-.904a.91.91 0 00-.916.904c0 .499.41.903.916.903a.91.91 0 00.916-.903.91.91 0 00-.916-.904zm-2.9 2.861a.91.91 0 01.916-.904.91.91 0 01.916.904.91.91 0 01-.916.903.91.91 0 01-.916-.903z"
      />
      {/* плюс в левом кольце */}
      <path
        fill={color}
        d="M6.41 5.35h1.222v1.807h1.831V8.36H7.632v1.806H6.41V8.361H4.579V7.157H6.41V5.35z"
      />
    </svg>
  );
}

/**
 * Rutube — фирменный знак: тёмный скруглённый бейдж с белым «play»
 * и характерной пурпурно-сине-бирюзовой полосой бренда.
 */
export function RutubeIcon({
  size = 14,
  color = "#14191F",
  brand = true,
}: {
  size?: number;
  color?: string;
  brand?: boolean;
}) {
  if (brand) {
    const gid = `rt-grad-${size}`;
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#00C8C8" />
            <stop offset="50%" stopColor="#3B5BFF" />
            <stop offset="100%" stopColor="#C800DC" />
          </linearGradient>
        </defs>
        <path
          fill="#14191F"
          d="M0 22.1C0 11.7 0 6.5 3.2 3.2 6.5 0 11.7 0 22.1 0h3.8c10.4 0 15.6 0 18.9 3.2C48 6.5 48 11.7 48 22.1v3.8c0 10.4 0 15.6-3.2 18.9C41.5 48 36.3 48 25.9 48h-3.8c-10.4 0-15.6 0-18.9-3.2C0 41.5 0 36.3 0 25.9v-3.8Z"
        />
        {/* фирменная полоса-градиент */}
        <rect x="9" y="33.5" width="30" height="4" rx="2" fill={`url(#${gid})`} />
        {/* белый «play» в скобке-экране */}
        <path
          fill="#fff"
          d="M11 12.5h17.8c3.9 0 6.2 2.1 6.2 5.6v3.2c0 3.1-1.8 5.1-4.9 5.5l5.2 5.2h-6.4l-4.8-5.1h-7.4v5.1H11V12.5Zm5.7 4.6v5h11c1.4 0 2.1-.6 2.1-1.8v-1.4c0-1.2-.7-1.8-2.1-1.8h-11Z"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M3 5h10.5c2.5 0 4 1.4 4 3.7v2.1c0 2-1.2 3.3-3.2 3.6L18 19h-3.9l-3.1-3.3H6V19H3V5Zm3 3v4.7h7.2c.9 0 1.4-.4 1.4-1.2v-1c0-.8-.5-1.2-1.4-1.2H6Z" />
      <rect x="3" y="20.4" width="18" height="1.8" rx=".9" />
    </svg>
  );
}

/**
 * Boosty — фирменный оранжевый бейдж с белой «молнией»-стрелкой.
 */
export function BoostyIcon({
  size = 14,
  color = "#F15F2C",
  brand = true,
}: {
  size?: number;
  color?: string;
  brand?: boolean;
}) {
  if (brand) {
    const gid = `by-grad-${size}`;
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF8A3C" />
            <stop offset="100%" stopColor="#F1442C" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${gid})`}
          d="M0 22.1C0 11.7 0 6.5 3.2 3.2 6.5 0 11.7 0 22.1 0h3.8c10.4 0 15.6 0 18.9 3.2C48 6.5 48 11.7 48 22.1v3.8c0 10.4 0 15.6-3.2 18.9C41.5 48 36.3 48 25.9 48h-3.8c-10.4 0-15.6 0-18.9-3.2C0 41.5 0 36.3 0 25.9v-3.8Z"
        />
        <path fill="#fff" d="M26.6 9 13.2 27.2h7.5l-3.6 11.9 14.1-18.7h-7.8L26.6 9Z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M13.6 2 4.2 14.7h5.3L7 23l9.9-13.1h-5.5L13.6 2Z" />
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
    case "rutube":
      return <RutubeIcon size={size} color={c} />;
    case "boosty":
      return <BoostyIcon size={size} color={c} />;
    case "donationalerts":
      return <DonationAlertsIcon size={size} color={c} />;
    case "donatepay":
      return <DonatePayIcon size={size} color={c} />;
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
