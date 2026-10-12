// ============================================================
// time.ts — Date & time helpers (translated, 24-hour, Monday-first)
// ============================================================
// Dates are local "YYYY-MM-DD" strings, times are "HH:MM" (24h).
// Minutes-since-midnight numbers are used for all time maths.
// Names of days/months come from Intl in the active language.
// ============================================================

import { getLocale, t } from '../i18n';

/** Weekdays in display order: Monday first (Europe) — values are JS getDay() numbers */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Localised weekday name for getDay() number (0 = Sunday) */
export function weekdayName(day: number, style: 'long' | 'short' = 'long'): string {
  // 7 Jan 2024 was a Sunday
  return new Intl.DateTimeFormat(getLocale(), { weekday: style }).format(new Date(2024, 0, 7 + day));
}

/** "10:30" → 630 */
export function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 630 → "10:30" */
export function fromMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Local YYYY-MM-DD (not UTC, so the date is right in every timezone) */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function parseDate(date: string): Date {
  return new Date(date + 'T00:00:00');
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  return parseDate(date).getDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Timestamp (ISO) → local YYYY-MM-DD */
export function tsToDateStr(ts: string): string {
  return toDateStr(new Date(ts));
}

/** Timestamp (ISO) → local "HH:MM" (24h) */
export function tsToTime(ts: string): string {
  const d = new Date(ts);
  return fromMin(d.getHours() * 60 + d.getMinutes());
}

/** Timestamp (ISO) → "12 Oct 2026, 14:38" in the active language, 24h */
export function formatTimestamp(ts: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ts));
}

export function endTime(time: string, durationMin: number): string {
  return fromMin(toMin(time) + durationMin);
}

/** 45 → "45 min", 90 → "1 h 30 min", 120 → "2 h" (translated) */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return t('time.durMin', { n: m });
  return m ? t('time.durHourMin', { h, m }) : t('time.durHour', { h });
}

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(getLocale(), opts).format(parseDate(date));

/** "Monday, 6 October" (word order follows the language) */
export function formatLongDate(date: string): string {
  return fmt(date, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Mon, 6 Oct" */
export function formatShortDate(date: string): string {
  return fmt(date, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "6 Oct" */
export function formatMonthDay(date: string): string {
  return fmt(date, { month: 'short', day: 'numeric' });
}

/** "Oct" */
export function formatMonthShort(date: string): string {
  return fmt(date, { month: 'short' });
}

/** "Today" / "Tomorrow" / "Yesterday" / "Mon, 6 Oct" */
export function relativeDay(date: string): string {
  const today = todayStr();
  if (date === today) return t('time.today');
  if (date === addDays(today, 1)) return t('time.tomorrow');
  if (date === addDays(today, -1)) return t('time.yesterday');
  return formatShortDate(date);
}

/** "in 3 days", "in 2 h", "now" — for an upcoming appointment */
export function countdown(date: string, time: string): string {
  const start = new Date(`${date}T${time}:00`).getTime();
  const diffMin = Math.round((start - Date.now()) / 60000);
  if (diffMin <= 0) return t('time.now');
  if (diffMin < 60) return t('time.inMinutes', { n: diffMin });
  const days = daysBetween(todayStr(), date);
  if (days === 0) return t('time.inHours', { n: Math.round(diffMin / 60) });
  if (days === 1) return t('time.tomorrow');
  return t('time.inDays', { n: days });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return t('greet.evening');
  if (h < 12) return t('greet.morning');
  if (h < 18) return t('greet.afternoon');
  return t('greet.evening');
}

/** Times between start and end (inclusive) every `step` minutes */
export function timeOptions(start: string, end: string, step: number): string[] {
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) out.push(fromMin(m));
  return out;
}
