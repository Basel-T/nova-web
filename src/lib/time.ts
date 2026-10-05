// ============================================================
// time.ts — Date & time helpers
// ============================================================
// Dates are local "YYYY-MM-DD" strings, times are "HH:MM" (24h).
// Minutes-since-midnight numbers are used for all time maths.
// ============================================================

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

/** Timestamp (ISO) → local "HH:MM" */
export function tsToTime(ts: string): string {
  const d = new Date(ts);
  return fromMin(d.getHours() * 60 + d.getMinutes());
}

export function endTime(time: string, durationMin: number): string {
  return fromMin(toMin(time) + durationMin);
}

/** 45 → "45 min", 90 → "1h 30m", 120 → "2h" */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "Monday, October 6" */
export function formatLongDate(date: string): string {
  return parseDate(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Mon, Oct 6" */
export function formatShortDate(date: string): string {
  return parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Oct 6" */
export function formatMonthDay(date: string): string {
  return parseDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Today" / "Tomorrow" / "Yesterday" / "Mon, Oct 6" */
export function relativeDay(date: string): string {
  const t = todayStr();
  if (date === t) return 'Today';
  if (date === addDays(t, 1)) return 'Tomorrow';
  if (date === addDays(t, -1)) return 'Yesterday';
  return formatShortDate(date);
}

/** "in 3 days", "in 2 hours", "starting soon" — for an upcoming appointment */
export function countdown(date: string, time: string): string {
  const start = new Date(`${date}T${time}:00`).getTime();
  const diffMin = Math.round((start - Date.now()) / 60000);
  if (diffMin <= 0) return 'Now';
  if (diffMin < 60) return `in ${diffMin} min`;
  const days = daysBetween(todayStr(), date);
  if (days === 0) return `in ${Math.round(diffMin / 60)} h`;
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Times between start and end (inclusive) every `step` minutes */
export function timeOptions(start: string, end: string, step: number): string[] {
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) out.push(fromMin(m));
  return out;
}
