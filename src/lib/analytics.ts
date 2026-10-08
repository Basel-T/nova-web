// ============================================================
// analytics.ts — Period maths & business metrics
// ============================================================
// Periods are calendar based (week = Monday–Sunday) and can be stepped
// back in time with `offset` (0 = current, -1 = previous, …).
// Revenue counts completed appointments, by appointment date.
// ============================================================

import type { Appointment, Stylist, User } from '../types';
import { addDays, formatMonthDay, parseDate, toDateStr, todayStr, tsToDateStr, WEEKDAYS_SHORT } from './time';

export type PeriodKind = 'week' | 'month' | 'year' | 'all';

export interface Period {
  kind: PeriodKind;
  offset: number;
  start: string;   // inclusive YYYY-MM-DD
  end: string;     // inclusive YYYY-MM-DD
  label: string;   // "Oct 5 – 11, 2026", "October 2026", "2026", "All time"
  caption: string; // "This week", "Last month", …
  bucket: 'day' | 'month' | 'year';
}

export function getPeriod(kind: PeriodKind, offset: number, bounds: { earliest: string; latest: string }): Period {
  const today = todayStr();
  const t = parseDate(today);

  if (kind === 'week') {
    const monday = addDays(today, -((t.getDay() + 6) % 7) + offset * 7);
    const sunday = addDays(monday, 6);
    const s = parseDate(monday);
    const e = parseDate(sunday);
    const range =
      s.getMonth() === e.getMonth()
        ? `${formatMonthDay(monday)} – ${e.getDate()}`
        : `${formatMonthDay(monday)} – ${formatMonthDay(sunday)}`;
    return {
      kind,
      offset,
      start: monday,
      end: sunday,
      label: `${range}, ${e.getFullYear()}`,
      caption: offset === 0 ? 'This week' : offset === -1 ? 'Last week' : '',
      bucket: 'day',
    };
  }

  if (kind === 'month') {
    const first = new Date(t.getFullYear(), t.getMonth() + offset, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return {
      kind,
      offset,
      start: toDateStr(first),
      end: toDateStr(last),
      label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      caption: offset === 0 ? 'This month' : offset === -1 ? 'Last month' : '',
      bucket: 'day',
    };
  }

  if (kind === 'year') {
    const y = t.getFullYear() + offset;
    return {
      kind,
      offset,
      start: `${y}-01-01`,
      end: `${y}-12-31`,
      label: String(y),
      caption: offset === 0 ? 'This year' : offset === -1 ? 'Last year' : '',
      bucket: 'month',
    };
  }

  const start = bounds.earliest < today ? bounds.earliest : today;
  const end = bounds.latest > today ? bounds.latest : today;
  const months = (parseDate(end).getFullYear() - parseDate(start).getFullYear()) * 12 +
    parseDate(end).getMonth() - parseDate(start).getMonth();
  return {
    kind,
    offset: 0,
    start: start.slice(0, 7) + '-01',
    end,
    label: 'All time',
    caption: `Since ${parseDate(start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    bucket: months > 24 ? 'year' : 'month',
  };
}

export const inPeriod = (date: string, p: Period) => date >= p.start && date <= p.end;

// ------------------------------------------------------------
// Buckets for the over-time chart
// ------------------------------------------------------------

export interface Bucket {
  key: string;
  label: string;   // axis label
  title: string;   // tooltip title
}

export function bucketKey(date: string, bucket: Period['bucket']): string {
  return bucket === 'day' ? date : bucket === 'month' ? date.slice(0, 7) : date.slice(0, 4);
}

export function getBuckets(p: Period): Bucket[] {
  const out: Bucket[] = [];
  if (p.bucket === 'day') {
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) {
      const dt = parseDate(d);
      out.push({
        key: d,
        label: p.kind === 'week' ? WEEKDAYS_SHORT[dt.getDay()] : String(dt.getDate()),
        title: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    }
  } else if (p.bucket === 'month') {
    const s = parseDate(p.start);
    const e = parseDate(p.end);
    for (let m = new Date(s.getFullYear(), s.getMonth(), 1); m <= e; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const multiYear = s.getFullYear() !== e.getFullYear();
      out.push({
        key: toDateStr(m).slice(0, 7),
        label: m.toLocaleDateString('en-US', { month: 'short' }) + (multiYear ? ` ’${String(m.getFullYear()).slice(2)}` : ''),
        title: m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
  } else {
    for (let y = Number(p.start.slice(0, 4)); y <= Number(p.end.slice(0, 4)); y++) {
      out.push({ key: String(y), label: String(y), title: String(y) });
    }
  }
  return out;
}

// ------------------------------------------------------------
// Headline metrics
// ------------------------------------------------------------

export interface Metrics {
  revenue: number;        // completed appointments
  expected: number;       // upcoming confirmed + pending
  total: number;          // every appointment in the period
  completed: number;
  cancelled: number;
  noShow: number;
  upcoming: number;
  avgTicket: number;
  clients: number;        // unique clients served (completed visits)
  newClients: number;     // sign-ups in the period
  returning: number;      // clients who had visited before the period
  cancelRate: number;     // 0..1
  noShowRate: number;     // 0..1
  bookedMinutes: number;  // chair time of completed + upcoming
}

/**
 * @param appts     appointments already filtered to the scope (barber) AND the period
 * @param history   appointments filtered to the scope only (for "returning")
 */
export function computeMetrics(appts: Appointment[], history: Appointment[], users: User[], p: Period): Metrics {
  const today = todayStr();
  const done = appts.filter((a) => a.status === 'completed');
  const live = appts.filter((a) => a.status === 'pending' || a.status === 'booked');
  const revenue = done.reduce((s, a) => s + a.price, 0);
  const cancelled = appts.filter((a) => a.status === 'cancelled').length;
  const noShow = appts.filter((a) => a.status === 'no_show').length;
  // "Served" = clients with at least one COMPLETED visit in the period
  const clientIds = new Set(done.map((a) => a.user_id));
  const returning = [...clientIds].filter((id) =>
    history.some((a) => a.user_id === id && a.status === 'completed' && a.date < p.start)
  ).length;

  return {
    revenue,
    expected: live.filter((a) => a.date >= today).reduce((s, a) => s + a.price, 0),
    total: appts.length,
    completed: done.length,
    cancelled,
    noShow,
    upcoming: live.filter((a) => a.date >= today).length,
    avgTicket: done.length ? revenue / done.length : 0,
    clients: clientIds.size,
    newClients: users.filter((u) => u.role === 'client' && u.created_at && inPeriod(tsToDateStr(u.created_at), p)).length,
    returning,
    cancelRate: appts.length ? cancelled / appts.length : 0,
    noShowRate: done.length + noShow ? noShow / (done.length + noShow) : 0,
    bookedMinutes: [...done, ...live].reduce((s, a) => s + a.duration_min, 0),
  };
}

/** Percentage change, or null when there is nothing to compare with */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

// ------------------------------------------------------------
// Breakdowns
// ------------------------------------------------------------

export function revenueByBucket(appts: Appointment[], p: Period): { bucket: Bucket; revenue: number; count: number }[] {
  const map = new Map<string, { revenue: number; count: number }>();
  for (const a of appts) {
    if (a.status !== 'completed') continue;
    const k = bucketKey(a.date, p.bucket);
    const cur = map.get(k) ?? { revenue: 0, count: 0 };
    cur.revenue += a.price;
    cur.count += 1;
    map.set(k, cur);
  }
  return getBuckets(p).map((b) => ({ bucket: b, ...(map.get(b.key) ?? { revenue: 0, count: 0 }) }));
}

export function byBarber(appts: Appointment[], stylists: Stylist[]) {
  const rows = new Map<string, { revenue: number; completed: number; bookings: number }>();
  for (const a of appts) {
    if (a.status === 'cancelled') continue;
    const r = rows.get(a.stylist_id) ?? { revenue: 0, completed: 0, bookings: 0 };
    r.bookings += 1;
    if (a.status === 'completed') {
      r.completed += 1;
      r.revenue += a.price;
    }
    rows.set(a.stylist_id, r);
  }
  return [...rows.entries()]
    .map(([id, r]) => ({ id, stylist: stylists.find((s) => s.id === id), ...r }))
    .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
}

export function byService(appts: Appointment[]) {
  const rows = new Map<string, { name: string; count: number; revenue: number }>();
  for (const a of appts) {
    if (a.status === 'cancelled') continue;
    const r = rows.get(a.service_id) ?? { name: a.service_name, count: 0, revenue: 0 };
    r.count += 1;
    if (a.status === 'completed') r.revenue += a.price;
    rows.set(a.service_id, r);
  }
  return [...rows.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.count - a.count || b.revenue - a.revenue);
}

/** Appointments per weekday, Monday first */
export function byWeekday(appts: Appointment[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const a of appts) {
    if (a.status === 'cancelled') continue;
    counts[(parseDate(a.date).getDay() + 6) % 7] += 1;
  }
  return counts;
}

/** Appointments per starting hour, trimmed to the hours that have data */
export function byHour(appts: Appointment[]): { hour: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const a of appts) {
    if (a.status === 'cancelled') continue;
    const h = Number(a.time.slice(0, 2));
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const hours = [...counts.keys()];
  const out = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h++) out.push({ hour: h, count: counts.get(h) ?? 0 });
  return out;
}

export function topClients(appts: Appointment[], users: User[], limit = 5) {
  const rows = new Map<string, { visits: number; spend: number; last: string }>();
  for (const a of appts) {
    if (a.status !== 'completed') continue;
    const r = rows.get(a.user_id) ?? { visits: 0, spend: 0, last: a.date };
    r.visits += 1;
    r.spend += a.price;
    if (a.date > r.last) r.last = a.date;
    rows.set(a.user_id, r);
  }
  return [...rows.entries()]
    .map(([id, r]) => ({ id, user: users.find((u) => u.id === id), ...r }))
    .sort((a, b) => b.spend - a.spend || b.visits - a.visits)
    .slice(0, limit);
}
