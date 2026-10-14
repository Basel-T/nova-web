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
  formatPrice,
  getAppointmentsForStylist,
  getBlocks,
  getHoursFor,
  getSettings,
  getStylistByMobile,
  getUserById,
  isDayOff,
  isStillUpcoming,
  removeBlocks,
  getMergedBlocks,
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
  LanguageSwitcher,
  confirmDialog,
  cx,
  inputCls,
  toast,
} from '../../ui';
import {
  weekdayName,
  addDays,
  endTime,
  formatDuration,
  formatLongDate,
  fromMin,
  relativeDay,
  timeOptions,
  toMin,
  nowMinutes,
  todayStr,
  weekdayOf,
} from '../../lib/time';
import Analytics from '../Analytics';
import { t } from '../../i18n';

type Tab = 'agenda' | 'requests' | 'timeoff' | 'stats';

const byTime = (a: Appointment, b: Appointment) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export default function BarberPanel({ user, onLogout }: { user: User; onLogout: () => void }) {
  useStoreVersion();
  const [tab, setTab] = useState<Tab>('agenda');
  const stylist = getStylistByMobile(user.mobile_number);

  const signOut = async () => {
    if (await confirmDialog({ title: t('common.signOutQ'), confirmText: t('common.signOut'), cancelText: t('common.stay') })) onLogout();
  };

  if (!stylist) {
    return (
      <div className="page-glow grid min-h-dvh place-items-center p-6">
        <EmptyState
          icon={UserX}
          title={t('barber.notFound')}
          text={t('barber.notFoundText')}
          action={<Button onClick={onLogout}>{t('common.signOut')}</Button>}
        />
      </div>
    );
  }

  const requests = getAppointmentsForStylist(stylist.id)
    .filter((a) => a.status === 'pending' && isStillUpcoming(a))
    .sort(byTime);

  return (
    <div className="page-glow min-h-dvh pb-28">
      <AppHeader
        left={
          <div className="flex items-center gap-3">
            <Avatar name={stylist.name} src={stylist.image} size={40} />
            <div className="min-w-0">
              <p className="truncate font-display text-[22px] leading-none text-cream">{t('barber.hi', { name: stylist.name.split(' ')[0] })}</p>
              <p className="mt-1 truncate text-xs text-ink-400">{stylist.title}</p>
            </div>
          </div>
        }
        right={
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <IconButton label={t('common.signOut')} onClick={signOut}>
              <LogOut className="size-5 rtl:-scale-x-100" />
            </IconButton>
          </div>
        }
      />

      <main className="mx-auto max-w-lg px-4 pt-5">
        {tab === 'agenda' && <Agenda stylist={stylist} pendingCount={requests.length} onRequests={() => setTab('requests')} />}
        {tab === 'requests' && <Requests requests={requests} />}
        {tab === 'timeoff' && <TimeOff stylist={stylist} />}
        {tab === 'stats' && (
          <div className="animate-rise">
            <h1 className="mb-5 font-display text-[40px] leading-none text-cream">{t('barber.yourStats')}</h1>
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
          { key: 'agenda', label: t('barber.tabAgenda'), icon: CalendarDays },
          { key: 'requests', label: t('barber.tabRequests'), icon: Inbox, badge: requests.length },
          { key: 'timeoff', label: t('barber.tabTimeOff'), icon: CalendarOff },
          { key: 'stats', label: t('barber.tabStats'), icon: BarChart3 },
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
    strip.push({ date: d, marked: has, note: isDayOff(stylist.id, d) ? t('strip.off') : !getHoursFor(d) ? t('strip.closed') : undefined });
  }

  const appts = getAppointmentsForStylist(stylist.id, date).sort(byTime);
  const live = appts.filter((a) => a.status !== 'cancelled');
  const cancelled = appts.filter((a) => a.status === 'cancelled');
  const blocks = getMergedBlocks(stylist.id, date); // 19:00–19:30 + 19:30–20:00 → one row
  const hours = getHoursFor(date);
  const dayOff = isDayOff(stylist.id, date);
  // One rule everywhere: revenue = completed only; not-yet-completed = expected
  const earned = live.filter((a) => a.status === 'completed').reduce((s, a) => s + a.price, 0);
  const expected = live.filter((a) => a.status === 'pending' || a.status === 'booked').reduce((s, a) => s + a.price, 0);

  type Item = { kind: 'appt'; at: number; appt: Appointment } | { kind: 'block'; at: number; end: number; note: string; id: string };
  const items: Item[] = [
    ...live.map((a) => ({ kind: 'appt' as const, at: toMin(a.time), appt: a })),
    ...blocks.map((b) => ({ kind: 'block' as const, at: b.start, end: b.end, note: b.note, id: b.ids.join('+') })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="animate-rise space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-400">{relativeDay(date)}</p>
          {date !== today && (
            <button
              onClick={() => setDate(today)}
              className="rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-xs font-medium text-gold-200 transition hover:bg-gold-400/15"
            >
              {t('time.today')}
            </button>
          )}
        </div>
        <h1 className="font-display text-[40px] leading-none text-cream">{formatLongDate(date)}</h1>
        <p className="tnum mt-2 text-xs text-ink-400">
          {dayOff ? t('barber.dayOff') : hours ? t('barber.shopOpen', { from: hours.open, to: hours.close }) : t('barber.shopClosed')}
        </p>
      </div>

      <DateStrip items={strip} value={date} onChange={setDate} />

      {pendingCount > 0 && (
        <button
          onClick={onRequests}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] px-4 py-3 text-start transition hover:bg-amber-400/10"
        >
          <Inbox className="size-5 text-amber-300" />
          <span className="flex-1 text-sm text-amber-100">
            {t('barber.requestsWaiting', { n: pendingCount })}
          </span>
          <span className="text-xs font-medium text-amber-200">{t('barber.review')}</span>
        </button>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat label={t('barber.statBookings')} value={String(live.length)} />
        <MiniStat label={t('barber.statEarned')} value={formatPrice(earned)} />
        <MiniStat label={t('barber.statExpected')} value={formatPrice(expected)} />
      </div>

      {dayOff ? (
        <Card>
          <EmptyState icon={CalendarOff} title={t('barber.offThisDay')} text={t('barber.offThisDayText')} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Coffee} title={t('barber.nothingBooked')} text={hours ? t('barber.nothingBookedText') : t('booking.shopClosed')} />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) =>
            it.kind === 'appt' ? (
              <AppointmentCard key={it.appt.id} appt={it.appt} />
            ) : (
              <div key={it.id} className="flex items-center gap-4 rounded-3xl border border-dashed border-white/[0.09] px-4 py-3.5">
                <div className="tnum w-12 shrink-0 text-end text-sm text-ink-400">{fromMin(it.at)}</div>
                <Coffee className="size-4 text-ink-400" />
                <p className="flex-1 text-sm text-ink-300">
                  {it.note || t('barber.blocked')} · <span className="tnum">{fromMin(it.at)} – {fromMin(it.end)}</span>
                </p>
              </div>
            )
          )}
        </div>
      )}

      {cancelled.length > 0 && (
        <p className="text-center text-xs text-ink-500">
          {t('barber.cancelledHidden', { n: cancelled.length })}
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
        <div className="w-12 shrink-0 text-end">
          <p className="tnum text-[15px] font-semibold text-cream">{appt.time}</p>
          <p className="tnum text-xs text-ink-500">{endTime(appt.time, appt.duration_min)}</p>
        </div>
        <div className="w-px shrink-0 bg-gradient-to-b from-gold-400/60 to-transparent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium text-cream">{client?.full_name ?? t('barber.client')}</p>
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
                <Phone className="size-3.5" /> {t('common.call')}
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
  const client = getUserById(appt.user_id)?.full_name ?? t('barber.theClient');

  const run = async (status: Appointment['status'], label: string, ask?: { title: string; message: string; confirmText: string }) => {
    if (ask && !(await confirmDialog({ ...ask, destructive: true, cancelText: t('common.back') }))) return;
    setBusy(status);
    try {
      await updateAppointmentStatus(appt.id, status);
      toast(label);
    } catch {
      toast(t('barber.saveFailed'), 'error');
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
            run('cancelled', t('barber.declined'), {
              title: t('barber.declineTitle'),
              message: t('barber.declineText', { client }),
              confirmText: t('barber.decline'),
            })
          }
        >
          {t('barber.decline')}
        </Button>
        <Button size="sm" variant="gold" loading={busy === 'booked'} onClick={() => run('booked', t('barber.confirmedToast'))}>
          {t('common.confirm')}
        </Button>
      </>
    );
  }

  // A booking that has already started can't be cancelled — it already happened
  const started = new Date(`${appt.date}T${appt.time}:00`).getTime() <= Date.now();

  if (appt.status === 'completed') {
    // Auto-completed (or completed by mistake) → still allow correcting to No-show
    return (
      <Button
        size="sm"
        variant="subtle"
        loading={busy === 'no_show'}
        onClick={() =>
          run('no_show', t('barber.changedNoShow'), {
            title: t('barber.changeNoShowTitle'),
            message: t('barber.changeNoShowText', { client, price: formatPrice(appt.price) }),
            confirmText: t('status.no_show'),
          })
        }
      >
        {t('barber.markNoShow')}
      </Button>
    );
  }

  if (appt.status === 'booked') {
    return (
      <>
        {!started && (
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-300 hover:text-rose-200"
            loading={busy === 'cancelled'}
            onClick={() =>
              run('cancelled', t('barber.cancelledToast'), {
                title: t('barber.cancelTitle'),
                message: t('barber.cancelText', { client, service: appt.service_name, date: formatLongDate(appt.date), time: appt.time }),
                confirmText: t('barber.cancelBooking'),
              })
            }
          >
            {t('common.cancel')}
          </Button>
        )}
        {started && (
          <>
            <Button
              size="sm"
              variant="subtle"
              loading={busy === 'no_show'}
              onClick={() =>
                run('no_show', t('barber.markedNoShow'), {
                  title: t('barber.markNoShowTitle'),
                  message: t('barber.markNoShowText', { client }),
                  confirmText: t('status.no_show'),
                })
              }
            >
              {t('status.no_show')}
            </Button>
            <Button size="sm" variant="gold" loading={busy === 'completed'} onClick={() => run('completed', t('barber.markedCompleted'))}>
              {t('barber.complete')}
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
        <h1 className="font-display text-[40px] leading-none text-cream">{t('barber.tabRequests')}</h1>
        <p className="mt-2 text-sm text-ink-400">{t('barber.requestsText')}</p>
      </div>
      {requests.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={t('barber.caughtUp')} text={t('barber.caughtUpText')} />
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
      note: isDayOff(stylist.id, d) ? t('strip.off') : !getHoursFor(d) ? t('strip.closed') : undefined,
      marked: getBlocks(stylist.id, d).length > 0,
    });
  }

  const hours = getHoursFor(date);
  const off = isDayOff(stylist.id, date);
  const blocks = getMergedBlocks(stylist.id, date);
  const bookedThatDay = getAppointmentsForStylist(stylist.id, date).filter((a) => a.status === 'pending' || a.status === 'booked');

  const toggleDay = async (v: boolean) => {
    if (v && bookedThatDay.length > 0) {
      const ok = await confirmDialog({
        title: t('barber.bookingsThatDay'),
        message: t('barber.bookingsThatDayText', { n: bookedThatDay.length }),
        confirmText: t('barber.takeDayOff'),
        cancelText: t('common.back'),
      });
      if (!ok) return;
    }
    try {
      await setDayOff(stylist.id, date, v);
      toast(v ? t('barber.dayOffSaved') : t('barber.workingAgain'));
    } catch {
      toast(t('barber.saveFailed'), 'error');
    }
  };

  return (
    <div className="animate-rise space-y-5">
      <div>
        <h1 className="font-display text-[40px] leading-none text-cream">{t('barber.tabTimeOff')}</h1>
        <p className="mt-2 text-sm text-ink-400">{t('barber.timeOffText')}</p>
      </div>

      <DateStrip items={strip} value={date} onChange={setDate} />

      {!hours ? (
        <Card>
          <EmptyState icon={CalendarOff} title={t('barber.shopClosedOn', { day: weekdayName(weekdayOf(date)) })} />
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <Toggle
              checked={off}
              onChange={toggleDay}
              label={`${t('barber.dayOff')} · ${relativeDay(date)}`}
              description={t('barber.dayOffText')}
            />
          </Card>

          {!off && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">{t('barber.breaks')}</p>
                <span className="tnum text-xs text-ink-500">
                  {t('barber.open', { from: hours.open, to: hours.close })}
                </span>
              </div>
              {blocks.length === 0 ? (
                <p className="py-3 text-sm text-ink-500">{t('barber.noBlocks')}</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {blocks.map((b) => {
                    return (
                      <li key={b.ids.join('+')} className="flex items-center gap-3 py-3">
                        <Coffee className="size-4 text-gold-300" />
                        <span className="tnum text-cream">
                          {fromMin(b.start)} – {fromMin(b.end)}
                        </span>
                        <span className="flex-1 truncate text-sm text-ink-400">{b.note || t('barber.blocked')}</span>
                        <IconButton
                          label={t('barber.remove')}
                          onClick={async () => {
                            try {
                              await removeBlocks(b.ids);
                              toast(t('barber.reopened'));
                            } catch {
                              toast(t('barber.saveFailed'), 'error');
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
                {t('barber.blockTime')}
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
  // Today: don't offer start times that already passed
  const nowM = date === todayStr() ? nowMinutes() : -1;
  // Today: "Now" first — the current time rounded up to the next 5 minutes
  const nowSlot = nowM >= 0 ? fromMin(Math.ceil(nowM / 5) * 5) : '';
  const hasNow = nowSlot !== '' && toMin(nowSlot) >= toMin(hours.open) && toMin(nowSlot) < toMin(hours.close);
  const gridStarts = options.slice(0, -1).filter((x) => toMin(x) > nowM);
  const startOptions = hasNow && !gridStarts.includes(nowSlot) ? [nowSlot, ...gridStarts] : gridStarts;
  const defaultEnd = (from: string) =>
    options.find((t) => toMin(t) >= toMin(from) + 60) ?? options[options.length - 1];
  const firstStart = startOptions.includes('13:00') ? '13:00' : startOptions[0] ?? '';
  const [start, setStart] = useState(firstStart);
  const [end, setEnd] = useState(firstStart ? defaultEnd(firstStart) : '');
  const [note, setNote] = useState(''); // no reason pre-selected
  const endOptions = options.filter((t) => start && toMin(t) > toMin(start));
  const [saving, setSaving] = useState(false);

  const s = toMin(start);
  const e = toMin(end);
  const clash = getAppointmentsForStylist(stylist.id, date).some(
    (a) => (a.status === 'pending' || a.status === 'booked') && s < toMin(a.time) + a.duration_min && e > toMin(a.time)
  );
  const error = !start
    ? t('barber.noTimeLeft')
    : e <= s
      ? t('barber.endAfterStart')
      : clash
        ? t('barber.bookingDuring')
        : '';

  const save = async () => {
    if (error) return;
    setSaving(true);
    try {
      await addBlock(stylist.id, date, start, end, note);
      toast(t('barber.blockedToast', { from: start, to: end }));
      onClose();
    } catch {
      toast(t('barber.saveFailed'), 'error');
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('barber.blockTime')}
      subtitle={formatLongDate(date)}
      footer={
        <Button variant="gold" size="lg" className="w-full" disabled={!!error} loading={saving} onClick={save}>
          {start ? t('barber.blockRange', { from: start, to: end }) : t('barber.blockTime')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('barber.from')}>
            <Select
              value={start}
              onChange={(ev) => {
                const v = ev.target.value;
                setStart(v);
                if (toMin(end) <= toMin(v)) setEnd(defaultEnd(v));
              }}
            >
              {startOptions.map((x) => (
                <option key={x} value={x}>
                  {hasNow && x === nowSlot ? t('barber.now', { time: x }) : x}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('barber.to')}>
            <Select value={end} onChange={(ev) => setEnd(ev.target.value)}>
              {endOptions.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="tnum text-sm text-ink-400">{e > s ? formatDuration(e - s) : '—'}</p>
        <Field label={t('barber.reason')}>
          <div className="mb-2 flex flex-wrap gap-2">
            {[t('barber.reasonLunch'), t('barber.reasonBreak'), t('barber.reasonPersonal'), t('barber.reasonTraining')].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNote(note === n ? '' : n)}
                className={cx(
                  'h-8 rounded-full border px-3 text-[13px] transition',
                  note === n ? 'border-gold-400/50 bg-gold-400/10 text-gold-200' : 'border-white/[0.08] text-ink-300'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={t('barber.reasonOptional')} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>
    </Sheet>
  );
}
