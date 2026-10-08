// ============================================================
// BookingFlow.tsx — Service → Barber → Date & time → Review
// ============================================================
// The current step comes from ClientApp (browser history), the
// selections live here. Availability works for any service length
// and updates live while the client is choosing.
// ============================================================

import { useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Clock, MessageSquare, Sparkles, Users, X } from 'lucide-react';
import type { User } from '../../types';
import {
  addAppointment,
  firstFreeBarber,
  formatPrice,
  getAnyBarberStarts,
  getAvailableStarts,
  getHoursFor,
  getServiceById,
  getServices,
  getSettings,
  getStylistById,
  getStylists,
  isDayOff,
  lastBookableDate,
  nextAvailable,
  useStoreVersion,
} from '../../store';
import { Avatar, Button, Card, DateStrip, EmptyState, IconButton, Portrait, cx, textareaCls, toast } from '../../ui';
import { addDays, endTime, formatDuration, formatLongDate, relativeDay, todayStr } from '../../lib/time';

const STEPS = ['Choose a service', 'Choose your barber', 'Pick a time', 'Review & confirm'];

/** Special barber choice: whoever is free first at the chosen time */
const ANY = 'any';

/** Free start times for one barber, or for "any barber" */
function startsFor(stylistId: string, date: string, duration: number): string[] {
  return stylistId === ANY ? getAnyBarberStarts(date, duration) : getAvailableStarts(stylistId, date, duration);
}

/** First date & time that has a free slot (one barber or any) */
function firstFree(stylistId: string, duration: number): { date: string; time: string } | null {
  if (stylistId !== ANY) return nextAvailable(stylistId, duration);
  for (let d = todayStr(); d <= lastBookableDate(); d = addDays(d, 1)) {
    const s = getAnyBarberStarts(d, duration);
    if (s.length) return { date: d, time: s[0] };
  }
  return null;
}

interface Props {
  user: User;
  step: number;
  presetServiceId?: string;
  presetStylistId?: string;
  onStep: (step: number) => void;
  onBack: () => void;
  onClose: () => void;
  onBooked: (appointmentId: string) => void;
}

export default function BookingFlow({ user, step, presetServiceId, presetStylistId, onStep, onBack, onClose, onBooked }: Props) {
  useStoreVersion();
  const settings = getSettings();
  const [serviceId, setServiceId] = useState(presetServiceId ?? '');
  const [stylistId, setStylistId] = useState(presetStylistId ?? '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const service = getServiceById(serviceId);
  const isAny = stylistId === ANY;
  // With "Any barber", the barber is the first one free at the chosen time
  const stylist =
    isAny && service && date && time ? firstFreeBarber(date, time, service.duration_min) : getStylistById(stylistId);

  // Fall back gracefully if a choice disappeared (e.g. the admin hid a service)
  const current = !service ? 0 : step >= 2 && !stylist && !isAny ? 1 : step >= 3 && (!time || !stylist) ? 2 : step;

  const chooseService = (id: string) => {
    setServiceId(id);
    setTime('');
    if (stylistId) {
      // Barber already chosen (from "The team") → straight to their first free day
      const svc = getServiceById(id);
      setDate(svc ? firstFree(stylistId, svc.duration_min)?.date ?? todayStr() : todayStr());
      onStep(2);
    } else onStep(1);
  };

  const chooseBarber = (id: string, duration: number) => {
    setStylistId(id);
    setTime('');
    setDate(firstFree(id, duration)?.date ?? todayStr());
    onStep(2);
  };

  const confirm = async () => {
    if (!service || !stylist || !date || !time) return;
    setBusy(true);
    // "Any barber": if the first free barber gets taken meanwhile, try the next one
    const candidates = isAny
      ? getStylists().filter((s) => getAvailableStarts(s.id, date, service.duration_min).includes(time))
      : [stylist];
    try {
      for (const barber of candidates) {
        try {
          const appt = await addAppointment(user.id, barber.id, service.id, date, time, note);
          onBooked(appt.id);
          return;
        } catch (e) {
          if ((e as Error).message !== 'SLOT_TAKEN') throw e;
        }
      }
      toast('Someone just took that time — please pick another', 'error');
      setTime('');
      onBack();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'LIMIT') {
        toast(`You already have ${settings.max_upcoming} upcoming booking${settings.max_upcoming === 1 ? '' : 's'} — the maximum`, 'error');
        onClose();
      } else if (msg === 'CLIENT_OVERLAP') {
        toast('You already have a booking at that time — pick another time', 'error');
        setTime('');
        onBack();
      } else {
        toast('Could not book — check your connection and try again', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-glow flex min-h-dvh flex-col">
      {/* Header + progress */}
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink-950/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-16 max-w-lg items-center gap-2 px-2">
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-500">
              Step {current + 1} of {STEPS.length}
            </p>
            <p className="truncate font-medium text-cream">{STEPS[current]}</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="h-[2px] bg-white/[0.04]">
          <div
            className="h-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-200 transition-all duration-500"
            style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      <main key={current} className="animate-rise mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-6">
        {/* Selection summary */}
        {current > 0 && service && (
          <div className="mb-6 flex flex-wrap gap-2">
            <SummaryChip onClick={() => onStep(0)}>
              {service.name} · {formatDuration(service.duration_min)} · {formatPrice(service.price)}
            </SummaryChip>
            {current > 1 && isAny && (
              <SummaryChip onClick={() => onStep(1)}>
                <Users className="size-4 text-gold-300" /> Any barber
              </SummaryChip>
            )}
            {current > 1 && !isAny && stylist && (
              <SummaryChip onClick={() => onStep(1)}>
                <Avatar name={stylist.name} src={stylist.image} size={20} /> {stylist.name}
              </SummaryChip>
            )}
          </div>
        )}

        {current === 0 && <ServiceStep selected={serviceId} onChoose={chooseService} />}
        {current === 1 && service && <BarberStep duration={service.duration_min} selected={stylistId} onChoose={chooseBarber} />}
        {current === 2 && service && (isAny || stylist) && (
          <TimeStep
            stylistId={isAny ? ANY : stylist!.id}
            duration={service.duration_min}
            date={date || todayStr()}
            time={time}
            onDate={(d) => {
              setDate(d);
              setTime('');
            }}
            onTime={setTime}
          />
        )}
        {current === 3 && service && stylist && (
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <Avatar name={stylist.name} src={stylist.image} size={64} className="rounded-2xl" />
                <div className="min-w-0">
                  <p className="font-display text-[26px] leading-tight text-cream">{service.name}</p>
                  <p className="text-sm text-ink-400">
                    with {stylist.name}
                    {isAny && <span className="text-gold-300/90"> · first available</span>}
                  </p>
                </div>
              </div>
              <div className="hairline" />
              <dl className="space-y-3 p-5 text-sm">
                <Line label="Date" value={formatLongDate(date)} />
                <Line label="Time" value={`${time} – ${endTime(time, service.duration_min)}`} />
                <Line label="Duration" value={formatDuration(service.duration_min)} />
                <div className="hairline !my-4" />
                <div className="flex items-baseline justify-between">
                  <dt className="text-ink-300">Total</dt>
                  <dd className="tnum font-display text-[30px] leading-none text-cream">{formatPrice(service.price)}</dd>
                </div>
              </dl>
            </Card>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                <MessageSquare className="size-3.5" /> Note for your barber (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="e.g. Skin fade, #2 on top, keep the length at the front"
                className={textareaCls}
              />
            </label>

            <p className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-500">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-gold-400" />
              Pay at the shop. {settings.auto_confirm ? 'Your booking is confirmed instantly.' : `${stylist.name.split(' ')[0]} will confirm your request.`} You can
              cancel any time from the app.
            </p>
          </div>
        )}
      </main>

      {/* Sticky footer */}
      {current === 2 && (
        <Footer>
          <Button variant="gold" size="lg" className="w-full" disabled={!time} onClick={() => onStep(3)}>
            {time ? `Continue · ${relativeDay(date || todayStr())} at ${time}` : 'Select a time'}
          </Button>
        </Footer>
      )}
      {current === 3 && (
        <Footer>
          <Button variant="gold" size="lg" className="w-full" loading={busy} icon={!busy && <Check className="size-[18px]" />} onClick={confirm}>
            {settings.auto_confirm ? 'Confirm booking' : 'Request booking'}
          </Button>
        </Footer>
      )}
    </div>
  );
}

// ------------------------------------------------------------

function ServiceStep({ selected, onChoose }: { selected: string; onChoose: (id: string) => void }) {
  const services = getServices();
  if (services.length === 0) return <EmptyState icon={Clock} title="No services available" text="Please check back soon." />;
  return (
    <div className="space-y-3">
      {services.map((s) => (
        <button
          key={s.id}
          onClick={() => onChoose(s.id)}
          className={cx(
            'w-full rounded-3xl border p-5 text-left transition-all active:scale-[0.99]',
            selected === s.id
              ? 'border-gold-400/60 bg-gold-400/[0.06]'
              : 'border-white/[0.07] bg-ink-900/80 hover:border-white/[0.14] hover:bg-ink-850'
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[17px] font-medium text-cream">{s.name}</p>
              {s.description && <p className="mt-1 text-sm leading-relaxed text-ink-400">{s.description}</p>}
            </div>
            <span className="tnum shrink-0 font-display text-[26px] leading-none text-cream">{formatPrice(s.price)}</span>
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-xs text-ink-300">
            <Clock className="size-3.5" /> {formatDuration(s.duration_min)}
          </p>
        </button>
      ))}
    </div>
  );
}

function BarberStep({
  duration,
  selected,
  onChoose,
}: {
  duration: number;
  selected: string;
  onChoose: (id: string, duration: number) => void;
}) {
  const team = getStylists();
  if (team.length === 0) return <EmptyState icon={Clock} title="No barbers available" text="Please check back soon." />;
  const anyNext = firstFree(ANY, duration);
  return (
    <div className="space-y-3">
      {/* "Any barber" — first card */}
      <button
        onClick={() => onChoose(ANY, duration)}
        className={cx(
          'flex w-full items-center gap-4 rounded-3xl border p-3 text-left transition-all active:scale-[0.99]',
          selected === ANY
            ? 'border-gold-400/60 bg-gold-400/[0.06]'
            : 'border-gold-400/25 bg-gradient-to-r from-gold-400/[0.07] to-transparent hover:border-gold-400/45'
        )}
      >
        <div className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-2xl border border-gold-400/25 bg-ink-850">
          <Users className="size-8 text-gold-300" strokeWidth={1.4} />
        </div>
        <div className="min-w-0 flex-1 py-1 pr-1">
          <p className="text-[17px] font-medium text-cream">Any barber</p>
          <p className="text-[13px] text-gold-300/90">Fastest option</p>
          <p className="mt-1.5 text-[13px] leading-snug text-ink-400">We'll book the first barber who is free at your time.</p>
          <p
            className={cx(
              'mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px]',
              anyNext ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.04] text-ink-400'
            )}
          >
            <span className={cx('size-1.5 rounded-full', anyNext ? 'bg-emerald-300' : 'bg-ink-500')} />
            {anyNext ? `Next free: ${relativeDay(anyNext.date)} ${anyNext.time}` : 'Fully booked'}
          </p>
        </div>
      </button>

      {team.map((s) => {
        const next = nextAvailable(s.id, duration);
        return (
          <button
            key={s.id}
            onClick={() => onChoose(s.id, duration)}
            className={cx(
              'flex w-full gap-4 rounded-3xl border p-3 text-left transition-all active:scale-[0.99]',
              selected === s.id
                ? 'border-gold-400/60 bg-gold-400/[0.06]'
                : 'border-white/[0.07] bg-ink-900/80 hover:border-white/[0.14] hover:bg-ink-850'
            )}
          >
            <Portrait name={s.name} src={s.image} className="w-[92px] shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 py-1 pr-1">
              <p className="text-[17px] font-medium text-cream">{s.name}</p>
              <p className="text-[13px] text-gold-300/90">{s.title}</p>
              {s.bio && <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-400">{s.bio}</p>}
              <p
                className={cx(
                  'mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px]',
                  next ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.04] text-ink-400'
                )}
              >
                <span className={cx('size-1.5 rounded-full', next ? 'bg-emerald-300' : 'bg-ink-500')} />
                {next ? `Next free: ${relativeDay(next.date)} ${next.time}` : 'Fully booked'}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TimeStep({
  stylistId,
  duration,
  date,
  time,
  onDate,
  onTime,
}: {
  stylistId: string;
  duration: number;
  date: string;
  time: string;
  onDate: (d: string) => void;
  onTime: (t: string) => void;
}) {
  const today = todayStr();
  const last = lastBookableDate();
  const days: string[] = [];
  for (let d = today; d <= last; d = addDays(d, 1)) days.push(d);

  const isAny = stylistId === ANY;
  const items = days.map((d) => {
    const closed = !getHoursFor(d);
    const off = !isAny && isDayOff(stylistId, d);
    const free = closed || off ? 0 : startsFor(stylistId, d, duration).length;
    return { date: d, disabled: free === 0, note: closed ? 'Closed' : off ? 'Off' : free === 0 ? 'Full' : undefined };
  });

  const starts = startsFor(stylistId, date, duration);
  const groups = [
    { label: 'Morning', times: starts.filter((t) => t < '12:00') },
    { label: 'Afternoon', times: starts.filter((t) => t >= '12:00' && t < '17:00') },
    { label: 'Evening', times: starts.filter((t) => t >= '17:00') },
  ].filter((g) => g.times.length);

  const firstOpen = items.find((i) => !i.disabled)?.date;

  return (
    <div>
      <p className="mb-3 font-display text-[26px] text-cream">{formatLongDate(date)}</p>
      <DateStrip items={items} value={date} onChange={onDate} />

      <div className="mt-6 space-y-6">
        {groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={Clock}
              title={
                !getHoursFor(date)
                  ? 'The shop is closed this day'
                  : !isAny && isDayOff(stylistId, date)
                    ? 'Your barber is off this day'
                    : 'Fully booked'
              }
              text="Try another day."
              action={
                firstOpen && firstOpen !== date ? (
                  <Button variant="subtle" size="sm" onClick={() => onDate(firstOpen)}>
                    Jump to {relativeDay(firstOpen)}
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">{g.label}</p>
              <div className="grid grid-cols-4 gap-2">
                {g.times.map((t) => (
                  <button
                    key={t}
                    onClick={() => onTime(t)}
                    className={cx(
                      'tnum h-11 rounded-xl border text-[14px] font-medium transition-all active:scale-95',
                      t === time
                        ? 'border-transparent bg-cream text-ink-950 shadow-[0_8px_20px_-8px_rgba(244,239,230,0.4)]'
                        : 'border-white/[0.08] bg-white/[0.02] text-cream hover:border-gold-400/40'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SummaryChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2.5 pr-3 text-[12.5px] text-ink-200 transition hover:border-gold-400/40"
    >
      {children}
    </button>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-400">{label}</dt>
      <dd className="tnum text-right text-cream">{value}</dd>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-20 border-t border-white/[0.06] bg-ink-950/85 backdrop-blur-xl"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto max-w-lg px-4 pt-3">{children}</div>
    </div>
  );
}
