import type { ContentCard, ContentCardChannel, ContentCardStatus } from "@/shared/contracts";

/** Fork-owned (Axe Code): shared constants + helpers for the Content board. */

/** Board columns shown in the UI. Legacy "review"/"approved" cards render under Drafts. */
export const BOARD_COLUMNS: readonly ContentCardStatus[] = ["draft", "scheduled", "published"];

export const CHANNELS: readonly ContentCardChannel[] = [
  "writer",
  "seo",
  "x",
  "linkedin",
  "facebook",
  "youtube",
];

export const CHANNEL_LABELS: Record<ContentCardChannel, string> = {
  writer: "Writer",
  seo: "SEO",
  x: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
};

/** Board columns that accept card drops. Published stays publish-only —
 *  dropping there would fabricate a publish attempt in History. */
export const BOARD_DROP_TARGETS: readonly ContentCardStatus[] = ["draft", "scheduled"];

/** Default slot given to a card dropped on Scheduled — 10 minutes from now. */
export const DROP_SCHEDULE_OFFSET_MS = 10 * 60 * 1000;

/**
 * The card patch produced by dropping `card` onto a board column, or null when
 * the drop is a no-op (same column, or a column that is not a drop target).
 * A published card leaving the Published column clears its live post link,
 * mirroring the modal's "Move back to drafts" action; a card going back to
 * Drafts drops its schedule slot so it does not linger on the calendar. A card
 * dropped on Scheduled is booked for `now + 10 min` — the picker refines it.
 */
export function dropPatchForColumn(
  card: ContentCard,
  column: ContentCardStatus,
  now: Date = new Date(),
): {
  status: ContentCardStatus;
  scheduledFor?: string | null;
  publishUrl?: null;
  publishError?: null;
} | null {
  if (!BOARD_DROP_TARGETS.includes(column) || columnOf(card.status) === column) return null;
  return {
    status: column,
    scheduledFor:
      column === "scheduled"
        ? new Date(now.getTime() + DROP_SCHEDULE_OFFSET_MS).toISOString()
        : null,
    ...(card.status === "published" ? { publishUrl: null, publishError: null } : {}),
  };
}

/**
 * Per-channel composer shape, matching how each platform actually composes:
 * X is plain text capped at 280 chars (longer content becomes a numbered
 * thread), LinkedIn/Facebook are plain-ish long posts, YouTube is title +
 * description + required video, writer/seo are rich articles.
 */
export const CHANNEL_COMPOSE: Record<
  ContentCardChannel,
  {
    /** Soft character cap shown as a live counter in the composer. */
    charLimit: number | null;
    /** Whether the body editor uses the rich toolbar. */
    rich: boolean;
    /** Media is the primary payload (video for YouTube). */
    mediaFirst: boolean;
    placeholderKey: string;
  }
> = {
  writer: { charLimit: null, rich: true, mediaFirst: false, placeholderKey: "article" },
  seo: { charLimit: null, rich: true, mediaFirst: false, placeholderKey: "article" },
  x: { charLimit: 280, rich: false, mediaFirst: false, placeholderKey: "post" },
  linkedin: { charLimit: 3000, rich: false, mediaFirst: false, placeholderKey: "post" },
  facebook: { charLimit: null, rich: false, mediaFirst: false, placeholderKey: "post" },
  youtube: { charLimit: 5000, rich: false, mediaFirst: true, placeholderKey: "video" },
};

/** Cards that land in the Drafts column (review/approved collapse into it). */
export function columnOf(status: ContentCardStatus): ContentCardStatus {
  return BOARD_COLUMNS.includes(status) ? status : "draft";
}

export function groupByStatus(
  cards: readonly ContentCard[],
): Map<ContentCardStatus, ContentCard[]> {
  const grouped = new Map<ContentCardStatus, ContentCard[]>();
  for (const status of BOARD_COLUMNS) grouped.set(status, []);
  for (const card of cards) {
    if (card.status === "archived") continue;
    grouped.get(columnOf(card.status))?.push(card);
  }
  return grouped;
}

/** The calendar date a card belongs to: its scheduled slot, else publish day. */
export function calendarDate(card: ContentCard): string | null {
  return card.scheduledFor ?? card.publishedAt ?? null;
}

/** Calendar shows scheduled and published cards (published appear on their day). */
export function calendarCards(cards: readonly ContentCard[]): ContentCard[] {
  return cards.filter(
    (card) => card.status !== "archived" && card.status !== "draft" && calendarDate(card) !== null,
  );
}

/** Monday-start week grid: 7 days covering `date`. */
export function weekDays(date: Date): Date[] {
  const monday = new Date(date);
  const day = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/** Month grid: Monday-start weeks covering the whole month (always 42 cells). */
export function monthDays(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function cardsForDay(cards: readonly ContentCard[], day: Date): ContentCard[] {
  return cards.filter((card) => {
    const iso = calendarDate(card);
    return iso !== null && sameDay(new Date(iso), day);
  });
}

export function relativeAge(
  iso: string,
  now = Date.now(),
): { kind: "minutes" | "hours" | "days"; value: number } {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return { kind: "minutes", value: Math.max(1, minutes) };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { kind: "hours", value: hours };
  return { kind: "days", value: Math.floor(hours / 24) };
}

/** ISO string for a datetime-local input value, or null when empty/invalid. */
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Value for <input type="datetime-local"> from an ISO string (local time). */
export function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ── Quick scheduling: timezone + time-of-day presets ────────────────── */

export const SCHEDULE_TIMEZONES = [
  { id: "America/Los_Angeles", label: "San Francisco" },
  { id: "America/New_York", label: "New York" },
  { id: "Europe/London", label: "London" },
  { id: "Asia/Kolkata", label: "India" },
  { id: "Asia/Tokyo", label: "Tokyo" },
] as const;

export const SCHEDULE_SLOTS = [
  { id: "morning", hour: 9 },
  { id: "noon", hour: 12 },
  { id: "evening", hour: 18 },
  { id: "night", hour: 21 },
] as const;

export type ScheduleSlotId = (typeof SCHEDULE_SLOTS)[number]["id"];

/**
 * Convert a wall-clock date+hour in `timeZone` to a UTC ISO string.
 * Two-pass offset refinement handles DST boundaries correctly.
 */
export function scheduleSlotIso(dateStr: string, timeZone: string, hour: number): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const naiveUtc = new Date(`${dateStr}T${pad(hour)}:00:00Z`);
  if (Number.isNaN(naiveUtc.getTime())) return null;

  const wallInTz = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    return Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")),
      Number(get("hour")),
      Number(get("minute")),
    );
  };

  let instant = naiveUtc;
  for (let i = 0; i < 3; i += 1) {
    const errorMs = wallInTz(instant) - naiveUtc.getTime();
    if (errorMs === 0) break;
    instant = new Date(instant.getTime() - errorMs);
  }
  return instant.toISOString();
}

/** Next N calendar dates as {dateStr, label} for the quick-schedule picker. */
export function nextDays(count: number, from = new Date()): { dateStr: string; day: Date }[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    return {
      dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      day: d,
    };
  });
}
