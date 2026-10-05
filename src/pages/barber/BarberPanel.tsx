// ============================================================
// BarberPanel.tsx — The barber's app
// ============================================================
//   Agenda   — day view: bookings + breaks in time order
//   Requests — pending bookings to confirm or decline
//   Time off — days off and blocked time (lunch, breaks…)
//   Stats    — personal analytics (earnings, services, activity)
// ============================================================

import { useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  CalendarOff,
  Coffee,
  Inbox,
  LogOut,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
  UserX,
} from 'lucide-react';
import type { Appointment, Stylist, User } from '../../types';
import {
  addBlock,
  blockRange,
  formatPrice,
  getAppointmentsForStylist,
  getBlocks,
  getHoursFor,
  getSettings,
  getStylistByMobile,
  getUserById,
  isDayOff,
  removeBlock,
  setDayOff,
  updateAppointmentStatus,
  useStoreVersion,
} from '../../store';
import {
  AppHeader,
  Avatar,
  BottomNav,
  Button,
  Card,
  DateStrip,
  EmptyState,
  Field,
  IconButton,
  Select,
  Sheet,
  StatusPill,
  Toggle,
  confirmDialog,
  cx,
  inputCls,
  toast,
} from '../../ui';
import {
  WEEKDAYS,
  addDays,
  endTime,
  formatDuration,
  formatLongDate,
  fromMin,
  relativeDay,
  timeOptions,
  toMin,
  todayStr,
  weekdayOf,
} from '../../lib/time';
import Analytics from '../Analytics';

type Tab = 'agenda' | 'requests' | 'timeoff' | 'stats';

const byTime = (a: Appointment, b: Appointment) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export default function BarberPanel({ user, onLogout }: { user: User; onLogout: () => void }) {
  useStoreVersion();
  const [tab, setTab] = useState<Tab>('agenda');
  const stylist = getStylistByMobile(user.mobile_number);
  const today = todayStr();

  const signOut = async () => {
    if (await confirmDialog({ title: 'Sign out?', confirmText: 'Sign out', cancelText: 'Stay' })) onLogout();
  };

  if (!stylist) {
    return (
      <div className="page-glow grid min-h-dvh place-items-center p-6">
        <EmptyState
          icon={UserX}
          title="Barber profile not found"
          text="Ask the shop admin to add you to the team."
          action={<Button onClick={onLogout}>Sign out</Button>}
        />
      </div>
    );
  }

  const requests = getAppointmentsForStylist(stylist.id)
    .filter((a) => a.status === 'pending' && a.date >= today)
    .sort(byTime);

  return (
    <div className="page-glow min-h-dvh pb-28">
      <AppHeader
        left={
          <div className="flex items-center gap-3">
            <Avatar name={stylist.name} src={stylist.image} size={40} />
            <div className="min-w-0">
              <p className="truncate font-display text-[22px] leading-none text-cream">Hi, {stylist.name.split(' ')[0]}</p>
              <p className="mt-1 truncate text-xs text-ink-400">{stylist.title}</p>
            </div>
          </div>
        }
        right={
          <IconButton label="Sign out" onClick={signOut}>
            <LogOut className="size-5" />
          </IconButton>
        }
      />

      <main className="mx-auto max-w-lg px-4 pt-5">
        {tab === 'agenda' && <Agenda stylist={stylist} pendingCount={requests.length} onRequests={() => setTab('requests')} />}
        {tab === 'requests' && <Requests requests={requests} />}
        {tab === 'timeoff' && <TimeOff stylist={stylist} />}
        {tab === 'stats' && (
          <div className="animate-rise">
            <h1 className="mb-5 font-display text-[40px] leading-none text-cream">Your stats</h1>
            <Analytics stylistId={stylist.id} />
          </div>
        )}
      </main>

      <BottomNav
        value={tab}
        onChange={(t) => {
          setTab(t);
          window.scrollTo(0, 0);
        }}
        items={[
          { key: 'agenda', label: 'Agenda', icon: CalendarDays },
          { key: 'requests', label: 'Requests', icon: Inbox, badge: requests.length },
          { key: 'timeoff', label: 'Time off', icon: CalendarOff },
          { key: 'stats', label: 'Stats', icon: BarChart3 },
        ]}
      />
    </div>
  );
}

// ============================================================
// AGENDA
// ============================================================

function Agenda({ stylist, pendingCount, onRequests }: { stylist: Stylist; pendingCount: number; onRequests: () => void }) {
  const today = todayStr();
  const [date, setDate] = useState(today);
  const horizon = Math.max(30, getSettings().booking_window_days);

  const strip = [];
  for (let d = addDays(today, -7); d <= addDays(today, horizon); d = addDays(d, 1)) {
    const has = getAppointmentsForStylist(stylist.id, d).some((a) => a.status === 'pending' || a.status === 'booked');
    strip.push({ date: d, marked: has, note: isDayOff(stylist.id, d) ? 'Off' : !getHoursFor(d) ? 'Closed' : undefined });
  }

  const appts = getAppointmentsForStylist(stylist.id, date).sort(byTime);
  const live = appts.filter((a) => a.status !== 'cancelled');
  const cancelled = appts.filter((a) => a.status === 'cancelled');
  const blocks = getBlocks(stylist.id, date);
  const hours = getHoursFor(date);
  const dayOff = isDayOff(stylist.id, date);
  const takings = live.filter((a) => a.status !== 'no_show').reduce((s, a) => s + a.price, 0);

  type Item = { kind: 'appt'; at: number; appt: Appointment } | { kind: 'block'; at: number; end: number; note: string; id: string };
  const items: Item[] = [
    ...live.map((a) => ({ kind: 'appt' as const, at: toMin(a.time), appt: a })),
    ...blocks.map((b) => {
      const r = blockRange(b);
      return { kind: 'block' as const, at: r.start, end: r.end, note: b.note, id: b.id };
    }),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="animate-rise space-y-5">
      <div>
        <p className="text-sm text-ink-400">{relativeDay(date)}</p>
        <h1 className="font-display text-[40px] leading-none text-cream">{formatLongDate(date)}</h1>
      </div>

      <DateStrip items={strip} value={date} onChange={setDate} />

      {pendingCount > 0 && (
        <button
          onClick={onRequests}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] px-4 py-3 text-left transition hover:bg-amber-400/10"
        >
          <Inbox className="size-5 text-amber-300" />
          <span className="flex-1 text-sm text-amber-100">
            {pendingCount} booking request{pendingCount > 1 ? 's' : ''} waiting for you
          </span>
          <span className="text-xs font-medium text-amber-200">Review</span>
        </button>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat label="Bookings" value={String(live.length)} />
        <MiniStat label="Takings" value={formatPrice(takings)} />
        <MiniStat label="Hours" value={dayOff ? 'Off' : hours ? `${hours.open}–${hours.close}` : 'Closed'} small />
      </div>

      {dayOff ? (
        <Card>
          <EmptyState icon={CalendarOff} title="You're off this day" text="Turn this off in Time off if plans change." />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Coffee} title="Nothing booked yet" text={hours ? 'New bookings appear here instantly.' : 'The shop is closed this day.'} />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) =>
            it.kind === 'appt' ? (
              <AppointmentCard key={it.appt.id} appt={it.appt} />
            ) : (
              <div key={it.id} className="flex items-center gap-4 rounded-3xl border border-dashed border-white/[0.09] px-4 py-3.5">
                <div className="tnum w-12 shrink-0 text-right text-sm text-ink-400">{fromMin(it.at)}</div>
                <Coffee className="size-4 text-ink-400" />
                <p className="flex-1 text-sm text-ink-300">
                  {it.note || 'Blocked'} · <span className="tnum">{fromMin(it.at)} – {fromMin(it.end)}</span>
                </p>
              </div>
            )
          )}
        </div>
      )}

      {cancelled.length > 0 && (
        <p className="text-center text-xs text-ink-500">
          {cancelled.length} cancelled booking{cancelled.length > 1 ? 's' : ''} hidden
        </p>
      )}
    </div>
  );
}

function MiniStat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-center">
      <p className={cx('tnum truncate font-semibold text-cream', small ? 'text-[13px] leading-7' : 'text-xl')}>{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</p>
    </div>
  );
}

/** A booking with the client, service, note and the right actions */
export function AppointmentCard({ appt, showDate = false }: { appt: Appointment; showDate?: boolean }) {
  const client = getUserById(appt.user_id);
  return (
    <Card className="p-4">
      <div className="flex gap-4">
        <div className="w-12 shrink-0 text-right">
          <p className="tnum text-[15px] font-semibold text-cream">{appt.time}</p>
          <p className="tnum text-xs text-ink-500">{endTime(appt.time, appt.duration_min)}</p>
        </div>
        <div className="w-px shrink-0 bg-gradient-to-b from-gold-400/60 to-transparent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium text-cream">{client?.full_name ?? 'Client'}</p>
            <StatusPill status={appt.status} />
          </div>
          <p className="mt-0.5 text-sm text-ink-400">
            {showDate && <span className="text-ink-200">{relativeDay(appt.date)} · </span>}
            {appt.service_name} · {formatDuration(appt.duration_min)} · {formatPrice(appt.price)}
          </p>
          {appt.client_note && (
            <p className="mt-2 flex gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[13px] text-ink-200">
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-gold-300" /> {appt.client_note}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {client && (
              <a
                href={`tel:${client.mobile_number}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 text-[13px] text-ink-200 hover:bg-white/[0.04]"
              >
                <Phone className="size-3.5" /> Call
              </a>
            )}
            <AppointmentActions appt={appt} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Confirm / decline / complete / no-show / cancel — shared with the admin */
export function AppointmentActions({ appt }: { appt: Appointment }) {
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayStr();
  const client = getUserById(appt.user_id)?.full_name ?? 'the client';

  const run = async (status: Appointment['status'], label: string, ask?: { title: string; message: string; confirmText: string }) => {
    if (ask && !(await confirmDialog({ ...ask, destructive: true, cancelText: 'Back' }))) return;
    setBusy(status);
    try {
      await updateAppointmentStatus(appt.id, status);
      toast(label);
    } catch {
      toast('Could not save — check your connection', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (appt.status === 'pending') {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'cancelled'}
          onClick={() =>
            run('cancelled', 'Request declined', {
              title: 'Decline this request?',
              message: `${client} will see that the booking was declined.`,
              confirmText: 'Decline',
            })
          }
        >
          Decline
        </Button>
        <Button size="sm" variant="gold" loading={busy === 'booked'} onClick={() => run('booked', 'Booking confirmed')}>
          Confirm
        </Button>
      </>
    );
  }

  if (appt.status === 'booked') {
    return (
      <>
        <Button
          size="sm"
          variant="ghost"
          className="text-rose-300 hover:text-rose-200"
          loading={busy === 'cancelled'}
          onClick={() =>
            run('cancelled', 'Booking cancelled', {
              title: 'Cancel this booking?',
              message: `${client}'s ${appt.service_name} on ${formatLongDate(appt.date)} at ${appt.time} will be cancelled.`,
              confirmText: 'Cancel booking',
            })
          }
        >
          Cancel
        </Button>
        {appt.date <= today && (
          <>
            <Button
              size="sm"
              variant="subtle"
              loading={busy === 'no_show'}
              onClick={() =>
                run('no_show', 'Marked as no-show', {
                  title: 'Mark as no-show?',
                  message: `${client} didn't turn up for this appointment.`,
                  confirmText: 'No-show',
                })
              }
            >
              No-show
            </Button>
            <Button size="sm" variant="gold" loading={busy === 'completed'} onClick={() => run('completed', 'Marked as completed')}>
              Complete
            </Button>
          </>
        )}
      </>
    );
  }
  return null;
}

// ============================================================
// REQUESTS
// ============================================================

function Requests({ requests }: { requests: Appointment[] }) {
  return (
    <div className="animate-rise space-y-5">
      <div>
        <h1 className="font-display text-[40px] leading-none text-cream">Requests</h1>
        <p className="mt-2 text-sm text-ink-400">New bookings waiting for your confirmation.</p>
      </div>
      {requests.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="You're all caught up" text="New requests show up here the moment a client books." />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {requests.map((a) => (
            <AppointmentCard key={a.id} appt={a} showDate />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TIME OFF
// ============================================================

function TimeOff({ stylist }: { stylist: Stylist }) {
  const today = todayStr();
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState(false);

  const strip = [];
  for (let d = today; d <= addDays(today, 60); d = addDays(d, 1)) {
    strip.push({
      date: d,
      note: isDayOff(stylist.id, d) ? 'Off' : !getHoursFor(d) ? 'Closed' : undefined,
      marked: getBlocks(stylist.id, d).length > 0,
    });
  }

  const hours = getHoursFor(date);
  const off = isDayOff(stylist.id, date);
  const blocks = getBlocks(stylist.id, date);
  const bookedThatDay = getAppointmentsForStylist(stylist.id, date).filter((a) => a.status === 'pending' || a.status === 'booked');

  const toggleDay = async (v: boolean) => {
    if (v && bookedThatDay.length > 0) {
      const ok = await confirmDialog({
        title: 'You have bookings that day',
        message: `${bookedThatDay.length} booking${bookedThatDay.length > 1 ? 's stay' : ' stays'} in place — cancel ${bookedThatDay.length > 1 ? 'them' : 'it'} from your agenda if needed. New bookings will be blocked.`,
        confirmText: 'Take the day off',
        cancelText: 'Back',
      });
      if (!ok) return;
    }
    try {
      await setDayOff(stylist.id, date, v);
      toast(v ? 'Day off saved' : 'You are working this day again');
    } catch {
      toast('Could not save — check your connection', 'error');
    }
  };

  return (
    <div className="animate-rise space-y-5">
      <div>
        <h1 className="font-display text-[40px] leading-none text-cream">Time off</h1>
        <p className="mt-2 text-sm text-ink-400">Block breaks or whole days so clients can't book them.</p>
      </div>

      <DateStrip items={strip} value={date} onChange={setDate} />

      {!hours ? (
        <Card>
          <EmptyState icon={CalendarOff} title={`The shop is closed on ${WEEKDAYS[weekdayOf(date)]}s`} />
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <Toggle
              checked={off}
              onChange={toggleDay}
              label={`Day off · ${relativeDay(date)}`}
              description="Clients can't book you on this day."
            />
          </Card>

          {!off && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">Breaks & blocked time</p>
                <span className="tnum text-xs text-ink-500">
                  Open {hours.open} – {hours.close}
                </span>
              </div>
              {blocks.length === 0 ? (
                <p className="py-3 text-sm text-ink-500">No blocked time on this day.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {blocks.map((b) => {
                    const r = blockRange(b);
                    return (
                      <li key={b.id} className="flex items-center gap-3 py-3">
                        <Coffee className="size-4 text-gold-300" />
                        <span className="tnum text-cream">
                          {fromMin(r.start)} – {fromMin(r.end)}
                        </span>
                        <span className="flex-1 truncate text-sm text-ink-400">{b.note}</span>
                        <IconButton
                          label="Remove"
                          onClick={async () => {
                            try {
                              await removeBlock(b.id);
                              toast('Time reopened');
                            } catch {
                              toast('Could not save', 'error');
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button variant="subtle" className="mt-3 w-full" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Block time
              </Button>
            </Card>
          )}
        </>
      )}

      {adding && hours && <BlockSheet stylist={stylist} date={date} open={adding} onClose={() => setAdding(false)} />}
    </div>
  );
}

function BlockSheet({ stylist, date, open, onClose }: { stylist: Stylist; date: string; open: boolean; onClose: () => void }) {
  const hours = getHoursFor(date)!;
  const step = Math.min(15, getSettings().slot_interval);
  const options = timeOptions(hours.open, hours.close, step);
  const [start, setStart] = useState(options.includes('13:00') ? '13:00' : options[0]);
  const [end, setEnd] = useState(options.includes('14:00') ? '14:00' : options[Math.min(4, options.length - 1)]);
  const [note, setNote] = useState('Lunch');
  const [saving, setSaving] = useState(false);

  const s = toMin(start);
  const e = toMin(end);
  const clash = getAppointmentsForStylist(stylist.id, date).some(
    (a) => (a.status === 'pending' || a.status === 'booked') && s < toMin(a.time) + a.duration_min && e > toMin(a.time)
  );
  const error = e <= s ? 'End time must be after the start time' : clash ? 'You have a booking during that time' : '';

  const save = async () => {
    if (error) return;
    setSaving(true);
    try {
      await addBlock(stylist.id, date, start, end, note);
      toast(`Blocked ${start} – ${end}`);
      onClose();
    } catch {
      toast('Could not save — check your connection', 'error');
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Block time"
      subtitle={formatLongDate(date)}
      footer={
        <Button variant="gold" size="lg" className="w-full" disabled={!!error} loading={saving} onClick={save}>
          Block {start} – {end}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Select value={start} onChange={(ev) => setStart(ev.target.value)}>
              {options.slice(0, -1).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select value={end} onChange={(ev) => setEnd(ev.target.value)}>
              {options.slice(1).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="tnum text-sm text-ink-400">{e > s ? formatDuration(e - s) : '—'}</p>
        <Field label="Reason">
          <div className="mb-2 flex flex-wrap gap-2">
            {['Lunch', 'Break', 'Personal', 'Training'].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNote(n)}
                className={cx(
                  'h-8 rounded-full border px-3 text-[13px] transition',
                  note === n ? 'border-gold-400/50 bg-gold-400/10 text-gold-200' : 'border-white/[0.08] text-ink-300'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Reason (optional)" className={inputCls} />
        </Field>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>
    </Sheet>
  );
}
