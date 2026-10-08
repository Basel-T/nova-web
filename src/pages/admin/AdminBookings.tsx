// ============================================================
// AdminBookings.tsx — Every booking in the shop
// ============================================================

import { useState } from 'react';
import { CalendarSearch, MessageSquare, Phone, Search, Users } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '../../types';
import {
  formatPrice,
  getAppointments,
  getStylistById,
  getStylists,
  getUserById,
  useStoreVersion,
} from '../../store';
import { Avatar, Card, Chips, EmptyState, Segmented, Select, Sheet, StatusPill, Button, cx, inputCls } from '../../ui';
import { endTime, formatDuration, formatLongDate, relativeDay, todayStr } from '../../lib/time';
import { AppointmentActions } from '../barber/BarberPanel';

type When = 'upcoming' | 'today' | 'past' | 'all';

export default function AdminBookings() {
  useStoreVersion();
  const today = todayStr();
  const [when, setWhen] = useState<When>('upcoming');
  const [barber, setBarber] = useState('all');
  const [status, setStatus] = useState<'all' | AppointmentStatus>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(80);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = getAppointments();
  const stylists = getStylists(true);

  const todayCount = all.filter((a) => a.date === today && a.status !== 'cancelled').length;
  const pending = all.filter((a) => a.status === 'pending' && a.date >= today).length;
  const expected = all.filter((a) => a.date >= today && (a.status === 'pending' || a.status === 'booked')).reduce((s, a) => s + a.price, 0);

  const query = q.trim().toLowerCase();
  const list = all
    .filter((a) => (when === 'upcoming' ? a.date >= today : when === 'today' ? a.date === today : when === 'past' ? a.date < today : true))
    .filter((a) => barber === 'all' || a.stylist_id === barber)
    .filter((a) => status === 'all' || a.status === status)
    .filter((a) => {
      if (!query) return true;
      const u = getUserById(a.user_id);
      return `${u?.full_name ?? ''} ${u?.mobile_number ?? ''} ${a.service_name} ${getStylistById(a.stylist_id)?.name ?? ''}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const asc = a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      return when === 'past' || when === 'all' ? -asc : asc;
    });

  const shown = list.slice(0, limit);
  const groups: { date: string; items: Appointment[] }[] = [];
  for (const a of shown) {
    const g = groups[groups.length - 1];
    if (g && g.date === a.date) g.items.push(a);
    else groups.push({ date: a.date, items: [a] });
  }

  const open = all.find((a) => a.id === openId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <Tile label="Today" value={String(todayCount)} />
        <Tile label="To confirm" value={String(pending)} accent={pending > 0} />
        <Tile label="Expected" value={formatPrice(expected)} />
      </div>

      <Segmented<When>
        value={when}
        onChange={(v) => {
          setWhen(v);
          setLimit(80);
        }}
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'today', label: 'Today' },
          { value: 'past', label: 'Past' },
          { value: 'all', label: 'All' },
        ]}
      />

      <Chips
        value={barber}
        onChange={setBarber}
        options={[
          { value: 'all', label: 'All barbers', lead: <Users className="size-4" /> },
          ...stylists.map((s) => ({ value: s.id, label: s.name.split(' ')[0], lead: <Avatar name={s.name} src={s.image} size={22} /> })),
        ]}
      />

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, phone, service…" className={cx(inputCls, 'h-11 pl-10 text-sm')} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-[140px] [&_select]:h-11 [&_select]:text-sm">
          <option value="all">Any status</option>
          <option value="pending">Pending</option>
          <option value="booked">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="no_show">No-show</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarSearch} title="No bookings found" text="Try another filter or time range." />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.date}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">
                  {relativeDay(g.date)}
                  {relativeDay(g.date) !== formatLongDate(g.date) && (
                    <span className="ml-2 normal-case tracking-normal text-ink-500">{formatLongDate(g.date)}</span>
                  )}
                </p>
                <span className="tnum text-xs text-ink-500">{g.items.length}</span>
              </div>
              <Card className="divide-y divide-white/[0.05] overflow-hidden">
                {g.items.map((a) => {
                  const client = getUserById(a.user_id);
                  const s = getStylistById(a.stylist_id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setOpenId(a.id)}
                      className={cx('flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025]', a.status === 'cancelled' && 'opacity-55')}
                    >
                      <span className="tnum w-11 shrink-0 text-sm font-semibold text-cream">{a.time}</span>
                      <Avatar name={s?.name ?? '?'} src={s?.image} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-cream">{client?.full_name ?? 'Client'}</span>
                        <span className="block truncate text-xs text-ink-400">
                          {a.service_name} · {s?.name.split(' ')[0] ?? 'Former barber'}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tnum text-sm text-cream">{formatPrice(a.price)}</span>
                        <StatusPill status={a.status} />
                      </span>
                    </button>
                  );
                })}
              </Card>
            </div>
          ))}
          {list.length > limit && (
            <Button variant="subtle" className="w-full" onClick={() => setLimit((l) => l + 80)}>
              Show more ({list.length - limit})
            </Button>
          )}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? getUserById(open.user_id)?.full_name ?? 'Booking' : ''} subtitle={open && <StatusPill status={open.status} />}>
        {open && <BookingDetails appt={open} />}
      </Sheet>
    </div>
  );
}

function BookingDetails({ appt }: { appt: Appointment }) {
  const client = getUserById(appt.user_id);
  const barber = getStylistById(appt.stylist_id);
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
        <Row label="Service" value={`${appt.service_name} · ${formatDuration(appt.duration_min)}`} />
        <Row label="Barber" value={barber?.name ?? 'Former barber'} />
        <Row label="Date" value={formatLongDate(appt.date)} />
        <Row label="Time" value={`${appt.time} – ${endTime(appt.time, appt.duration_min)}`} />
        <Row label="Price" value={formatPrice(appt.price)} />
        {appt.created_at && <Row label="Booked" value={new Date(appt.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} />}
        {appt.status === 'cancelled' && appt.cancelled_by && <Row label="Cancelled by" value={appt.cancelled_by} />}
      </div>
      {appt.client_note && (
        <p className="flex gap-2.5 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-ink-200">
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-gold-300" /> {appt.client_note}
        </p>
      )}
      {client && (
        <a
          href={`tel:${client.mobile_number}`}
          className="flex items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3 text-cream transition hover:bg-white/[0.03]"
        >
          <Phone className="size-4 text-gold-300" />
          <span className="tnum flex-1">{client.mobile_number}</span>
          <span className="text-xs text-ink-400">Call</span>
        </a>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <AppointmentActions appt={appt} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-400">{label}</span>
      <span className="tnum text-right text-cream">{value}</span>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cx('rounded-2xl border px-3 py-3 text-center', accent ? 'border-amber-300/25 bg-amber-400/[0.07]' : 'border-white/[0.06] bg-white/[0.02]')}>
      <p className={cx('tnum truncate text-xl font-semibold', accent ? 'text-amber-200' : 'text-cream')}>{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</p>
    </div>
  );
}
