/* Онлайн (число зрителей) по каналам и площадкам — общий код для окна приложения и оверлея. */
import { PLATFORM_IDS } from "./core";
import type { PlatformId } from "./core";
import type { Channel } from "./bridge";

/** Компактный формат: 842 → «842», 1 234 → «1,2K», 15 800 → «16K», 1 200 000 → «1,2M». */
export function fmtViewers(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(".", ",").replace(",0", "")}K`;
  return String(v);
}

/** Полный формат с разделителями: 12345 → «12 345». */
export function fmtViewersFull(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return Math.max(0, Math.round(n)).toLocaleString("ru-RU");
}

export interface PlatformOnline {
  platform: PlatformId;
  /** сумма зрителей по подключённым каналам площадки; null — площадка в эфире, но число ещё неизвестно */
  viewers: number | null;
  /** сколько каналов площадки сейчас подключено */
  channels: number;
}

/**
 * Онлайн по площадкам. В список попадают ТОЛЬКО площадки, у которых есть
 * хотя бы один подключённый канал (status === "online") — неподключённые не показываем.
 */
export function aggregateViewers(channels: Channel[]): PlatformOnline[] {
  const out: PlatformOnline[] = [];
  for (const platform of PLATFORM_IDS) {
    const online = channels.filter((c) => c.platform === platform && c.status === "online");
    if (!online.length) continue;
    const known = online.filter((c) => typeof c.viewers === "number" && Number.isFinite(c.viewers));
    out.push({
      platform,
      channels: online.length,
      viewers: known.length ? known.reduce((s, c) => s + (c.viewers as number), 0) : null,
    });
  }
  return out;
}

/** Суммарный онлайн по всем подключённым площадкам (null — данных пока нет). */
export function totalViewers(list: PlatformOnline[]): number | null {
  const known = list.filter((p) => p.viewers !== null);
  if (!known.length) return null;
  return known.reduce((s, p) => s + (p.viewers as number), 0);
}

/** Слово «зритель» в нужной форме: 1 зритель, 2 зрителя, 5 зрителей. */
export function pluralViewers(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return "зрителей";
  if (b > 1 && b < 5) return "зрителя";
  if (b === 1) return "зритель";
  return "зрителей";
}
