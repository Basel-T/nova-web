// ============================================================
// Analytics.tsx — Everything that happened, for any period
// ============================================================
// Week / Month / Year / All time, stepping back through history.
// Admin: whole shop or one barber. Barber: their own numbers.
//   • KPIs with change vs the previous period
//   • Revenue over time, busiest days, peak hours
//   • By barber, top services, top clients
//   • Full activity log (every booking, change, sign-in…) + CSV export
// ============================================================

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  KeyRound,
  Scissors,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  enableActivity,
  formatPrice,
  getActivity,
  getAppointments,
  getStylistById,
  getStylists,
  getUserById,
  getUsers,
  useStoreVersion,
} from '../store';
import { BarChart, RankList } from '../charts';
import { Avatar, Button, Card, Chips, IconButton, Segmented, cx, inputCls, toast } from '../ui';
import {
  byBarber,
  byHour,
  byService,
  byWeekday,
  change,
  computeMetrics,
  getPeriod,
  inPeriod,
  revenueByBucket,
  topClients,
  type PeriodKind,
} from '../lib/analytics';
import { formatDuration, formatShortDate, relativeDay, todayStr, tsToDateStr, tsToTime } from '../lib/time';
import { downloadFile, toCsv } from '../lib/util';

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

type Category = 'all' | 'bookings' | 'clients' | 'team' | 'schedule' | 'access' | 'settings';

function categoryOf(type: string): Exclude<Category, 'all'> {
  if (type.startsWith('booking_')) return 'bookings';
  if (type === 'client_signup') return 'clients';
  if (type.startsWith('barber_') || type.startsWith('service_')) return 'team';
  if (type.startsWith('time_') || type.startsWith('day_')) return 'schedule';
  if (type === 'staff_login') return 'access';
  return 'settings';
}

const CATEGORY_ICON: Record<Exclude<Category, 'all'>, ComponentType<{ className?: string }>> = {
  bookings: CalendarCheck,
  clients: UserPlus,
  team: Scissors,
  schedule: Clock3,
  access: KeyRound,
  settings: Settings2,
};

const count = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Analytics({ stylistId }: { stylistId?: string }) {
  useStoreVersion();
  const isBarber = !!stylistId;
  const [kind, setKind] = useState<PeriodKind>('month');
  const [offset, setOffset] = useState(0);
  const [barber, setBarber] = useState('all');
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    enableActivity()
      .catch(() => toast('Could not load the activity log', 'error'))
      .finally(() => setLoadingLog(false));
  }, []);

  const scopeId = stylistId ?? (barber === 'all' ? null : barber);
  const all = getAppointments();
  const users = getUsers();
  const stylists = getStylists(true);
  const scoped = scopeId ? all.filter((a) => a.stylist_id === scopeId) : all;

  const today = todayStr();
  const bounds = useMemo(() => {
    const dates = all.map((a) => a.date);
    const created = users.map((u) => (u.created_at ? tsToDateStr(u.created_at) : today));
    const earliest = [...dates, ...created].reduce((m, d) => (d < m ? d : m), today);
    const latest = dates.reduce((m, d) => (d > m ? d : m), today);
    return { earliest, latest };
  }, [all, users, today]);

  const period = getPeriod(kind, offset, bounds);
  const prev = kind === 'all' ? null : getPeriod(kind, offset - 1, bounds);
  const inP = scoped.filter((a) => inPeriod(a.date, period));
  const m = computeMetrics(inP, scoped, users, period);
  const pm = prev ? computeMetrics(scoped.filter((a) => inPeriod(a.date, prev)), scoped, users, prev) : null;

  const series = revenueByBucket(inP, period);
  const weekdays = byWeekday(inP);
  const hours = byHour(inP);
  const services = byService(inP).slice(0, 6);
  const barbers = byBarber(inP, stylists);
  const clients = topClients(inP, users);

  const exportCsv = () => {
    const rows = [...inP].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const csv = toCsv([
      ['Date', 'Time', 'Client', 'Phone', 'Barber', 'Service', 'Minutes', 'Price', 'Status', 'Note', 'Booked at'],
      ...rows.map((a) => {
        const u = getUserById(a.user_id);
        return [
          a.date,
          a.time,
          u?.full_name ?? '',
          u?.mobile_number ?? '',
          getStylistById(a.stylist_id)?.name ?? '',
          a.service_name,
          a.duration_min,
          a.price,
          a.status,
          a.client_note,
          a.created_at ? new Date(a.created_at).toLocaleString() : '',
        ];
      }),
    ]);
    downloadFile(`bookings-${period.start}-to-${period.end}.csv`, csv, 'text/csv;charset=utf-8');
    toast(`Exported ${rows.length} booking${rows.length === 1 ? '' : 's'}`);
  };

  return (
    <div className="space-y-4">
      {/* Period controls */}
      <Segmented<PeriodKind>
        value={kind}
        onChange={(k) => {
          setKind(k);
          setOffset(0);
        }}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
          { value: 'all', label: 'All time' },
        ]}
      />
      <div className="flex items-center gap-2">
        <IconButton label="Previous period" disabled={kind === 'all'} onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-display text-[26px] leading-tight text-cream">{period.label}</p>
          <p className="h-4 text-[11px] uppercase tracking-[0.18em] text-ink-500">{period.caption}</p>
        </div>
        <IconButton label="Next period" disabled={kind === 'all' || offset >= 0} onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>

      {!isBarber && (
        <Chips
          value={barber}
          onChange={setBarber}
          options={[
            { value: 'all', label: 'All barbers', lead: <Users className="size-4" /> },
            ...stylists.map((s) => ({ value: s.id, label: s.name.split(' ')[0], lead: <Avatar name={s.name} src={s.image} size={22} /> })),
          ]}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi label="Revenue" value={formatPrice(m.revenue)} delta={pm && change(m.revenue, pm.revenue)} hint={`${m.completed} completed`} feature />
        <Kpi label="Appointments" value={String(m.total - m.cancelled)} delta={pm && change(m.total - m.cancelled, pm.total - pm.cancelled)} hint={`${m.upcoming} still upcoming`} />
        <Kpi label="Avg. ticket" value={formatPrice(Math.round(m.avgTicket * 100) / 100)} delta={pm && change(m.avgTicket, pm.avgTicket)} hint="per completed visit" />
        <Kpi label="Expected" value={formatPrice(m.expected)} hint="upcoming bookings" />
        <Kpi
          label={isBarber ? 'Clients' : 'New clients'}
          value={String(isBarber ? m.clients : m.newClients)}
          delta={pm && (isBarber ? change(m.clients, pm.clients) : change(m.newClients, pm.newClients))}
          hint={isBarber ? `${m.returning} returning` : `${m.clients} served · ${m.returning} returning`}
        />
        <Kpi label="Cancellations" value={String(m.cancelled)} hint={`${pct(m.cancelRate)} of bookings`} delta={pm && change(m.cancelled, pm.cancelled)} invert />
        <Kpi label="No-shows" value={String(m.noShow)} hint={`${pct(m.noShowRate)} of visits`} delta={pm && change(m.noShow, pm.noShow)} invert />
        <Kpi label="Chair time" value={formatDuration(m.bookedMinutes)} hint="booked & completed" />
      </div>

      {/* Revenue over time */}
      <Card className="p-5">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">Revenue</p>
            <p className="tnum mt-1 font-display text-[34px] leading-none text-cream">{formatPrice(m.revenue)}</p>
          </div>
          <p className="text-right text-xs text-ink-500">
            Completed visits
            <br />
            by {period.bucket}
          </p>
        </div>
        <BarChart
          title="Revenue over time"
          format={formatPrice}
          emptyText="No completed visits in this period yet"
          data={series.map((s) => ({
            key: s.bucket.key,
            label: s.bucket.label,
            value: s.revenue,
            tooltip: s.bucket.title,
            detail: `${s.count} visit${s.count === 1 ? '' : 's'}`,
          }))}
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {!scopeId && (
          <Card className="p-5">
            <CardTitle>By barber</CardTitle>
            <RankList
              emptyText="No bookings in this period"
              rows={barbers.map((b) => ({
                key: b.id,
                label: b.stylist?.name ?? 'Former barber',
                value: b.revenue || b.bookings / 1000,
                display: formatPrice(b.revenue),
                sub: `${b.completed} completed · ${b.bookings} booked${m.revenue ? ` · ${pct(b.revenue / m.revenue)} of revenue` : ''}`,
                lead: <Avatar name={b.stylist?.name ?? '?'} src={b.stylist?.image} size={36} />,
              }))}
            />
          </Card>
        )}

        <Card className="p-5">
          <CardTitle>Top services</CardTitle>
          <RankList
            emptyText="No bookings in this period"
            rows={services.map((s) => ({
              key: s.id,
              label: s.name,
              value: s.count,
              display: `${s.count}×`,
              sub: `${formatPrice(s.revenue)} earned`,
            }))}
          />
        </Card>

        <Card className="p-5">
          <CardTitle>Busiest days</CardTitle>
          <BarChart
            title="Appointments by weekday"
            integer
            height={120}
            format={count}
            emptyText="No bookings in this period"
            data={weekdays.map((v, i) => ({
              key: WEEK_LABELS[i],
              label: WEEK_LABELS[i],
              value: v,
              tooltip: WEEK_NAMES[i],
              detail: `${v} appointment${v === 1 ? '' : 's'}`,
            }))}
          />
        </Card>

        <Card className="p-5">
          <CardTitle>Peak hours</CardTitle>
          <BarChart
            title="Appointments by start hour"
            integer
            height={120}
            format={count}
            emptyText="No bookings in this period"
            data={hours.map((h) => ({
              key: String(h.hour),
              label: String(h.hour),
              value: h.count,
              tooltip: `${String(h.hour).padStart(2, '0')}:00 – ${String(h.hour + 1).padStart(2, '0')}:00`,
              detail: `${h.count} appointment${h.count === 1 ? '' : 's'}`,
            }))}
          />
        </Card>

        <Card className={cx('p-5', scopeId ? '' : 'sm:col-span-2')}>
          <CardTitle>Top clients</CardTitle>
          <RankList
            emptyText="No completed visits in this period"
            rows={clients.map((c) => ({
              key: c.id,
              label: c.user?.full_name ?? 'Client',
              value: c.spend,
              display: formatPrice(c.spend),
              sub: `${c.visits} visit${c.visits === 1 ? '' : 's'} · last ${formatShortDate(c.last)}`,
              lead: <Avatar name={c.user?.full_name ?? '?'} size={36} />,
            }))}
          />
        </Card>
      </div>

      <ActivityLog period={period} scopeId={scopeId} loading={loadingLog} />

      {!isBarber && (
        <Button variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={exportCsv}>
          Export bookings (CSV)
        </Button>
      )}
    </div>
  );
}

function CardTitle({ children }: { children: string }) {
  return <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">{children}</p>;
}

function Kpi({
  label,
  value,
  hint,
  delta,
  invert = false,
  feature = false,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null | false;
  invert?: boolean;
  feature?: boolean;
}) {
  const hasDelta = typeof delta === 'number' && delta !== 0;
  const up = hasDelta && (delta as number) > 0;
  const good = invert ? !up : up;
  return (
    <div
      className={cx(
        'rounded-3xl border p-4',
        feature ? 'border-gold-400/25 bg-gradient-to-b from-gold-400/[0.09] to-transparent' : 'border-white/[0.07] bg-ink-900/80'
      )}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">{label}</p>
      <p className="tnum mt-2 truncate text-[24px] font-semibold leading-none tracking-tight text-cream">{value}</p>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
        {hasDelta && (
          <span
            className={cx(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
              good ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
            )}
          >
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {pct(Math.abs(delta as number))}
          </span>
        )}
        {delta === null && <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-ink-300">New</span>}
        {hint && <span className="text-[11px] text-ink-500">{hint}</span>}
      </div>
    </div>
  );
}

// ============================================================
// ACTIVITY LOG
// ============================================================

function ActivityLog({ period, scopeId, loading }: { period: ReturnType<typeof getPeriod>; scopeId: string | null; loading: boolean }) {
  const [cat, setCat] = useState<Category>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);

  const events = getActivity().filter((e) => {
    if (!inPeriod(tsToDateStr(e.created_at), period)) return false;
    if (scopeId && e.stylist_id !== scopeId) return false;
    if (cat !== 'all' && categoryOf(e.type) !== cat) return false;
    if (q && !`${e.message} ${e.actor_name ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const shown = events.slice(0, limit);
  const groups: { date: string; items: typeof shown }[] = [];
  for (const e of shown) {
    const d = tsToDateStr(e.created_at);
    const g = groups[groups.length - 1];
    if (g && g.date === d) g.items.push(e);
    else groups.push({ date: d, items: [e] });
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">Activity</p>
          <p className="mt-1 text-sm text-ink-300">Everything that happened in this period</p>
        </div>
        <span className="tnum text-xs text-ink-500">{events.length} events</span>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients, barbers, services…"
          className={cx(inputCls, 'h-11 pl-10 text-sm')}
        />
      </div>
      <Chips
        value={cat}
        onChange={(c) => {
          setCat(c);
          setLimit(40);
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'bookings', label: 'Bookings' },
          { value: 'clients', label: 'New clients' },
          { value: 'schedule', label: 'Schedule' },
          { value: 'team', label: 'Team & services' },
          { value: 'access', label: 'Sign-ins' },
          { value: 'settings', label: 'Settings' },
        ]}
      />

      {loading ? (
        <p className="py-8 text-center text-sm text-ink-500">Loading activity…</p>
      ) : groups.length === 0 ? (
        <div className="py-10 text-center">
          <Sparkles className="mx-auto size-6 text-gold-300/70" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-ink-400">Nothing recorded in this period</p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <div key={g.date}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">{relativeDay(g.date)}</p>
              <ul className="space-y-1">
                {g.items.map((e) => {
                  const c = categoryOf(e.type);
                  const Icon = CATEGORY_ICON[c];
                  return (
                    <li key={e.id} className="flex gap-3 rounded-2xl px-1 py-2">
                      <span
                        className={cx(
                          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border',
                          c === 'bookings' ? 'border-gold-400/25 bg-gold-400/10 text-gold-300' : 'border-white/[0.07] bg-white/[0.03] text-ink-300'
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-cream">{e.message}</p>
                        <p className="tnum mt-0.5 text-[11.5px] text-ink-500">
                          {tsToTime(e.created_at)}
                          {e.actor_name && ` · by ${e.actor_name}`}
                          {e.amount != null && e.type === 'booking_completed' && ` · ${formatPrice(e.amount)}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {events.length > limit && (
            <Button variant="subtle" className="w-full" onClick={() => setLimit((l) => l + 60)}>
              Show more ({events.length - limit} older)
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
