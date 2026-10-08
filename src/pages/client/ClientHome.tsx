// ============================================================
// ClientHome.tsx — The customer app
// ============================================================
// ClientApp: home screen + the booking flow on top of it. The booking
// steps are pushed onto browser history, so the phone's back gesture
// steps back through the flow instead of leaving the site.
// ============================================================

import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Scissors,
} from 'lucide-react';
import type { Appointment, User } from '../../types';
import {
  getDaysSinceLastVisit,
  getHoursFor,
  getServices,
  getSettings,
  getStylistById,
  getStylists,
  getUserUpcoming,
  hasReachedBookingLimit,
  getUserAppointments,
  formatPrice,
  isActive,
  updateAppointmentStatus,
  useStoreVersion,
} from '../../store';
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  Portrait,
  SectionTitle,
  Sheet,
  StatusPill,
  Wordmark,
  confirmDialog,
  cx,
  toast,
} from '../../ui';
import {
  WEEKDAYS,
  countdown,
  endTime,
  formatDuration,
  formatLongDate,
  formatShortDate,
  greeting,
  relativeDay,
  todayStr,
} from '../../lib/time';
import { downloadIcs, mapsUrl } from '../../lib/util';
import BookingFlow from './BookingFlow';

interface BookingState {
  step: number;
  serviceId?: string;
  stylistId?: string;
}

export default function ClientApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [booking, setBooking] = useState<BookingState | null>(null);
  const [justBooked, setJustBooked] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);

  // Browser back/forward moves between booking steps
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = e.state as { booking?: number } | null;
      if (s && typeof s.booking === 'number') setBooking((b) => (b ? { ...b, step: s.booking! } : b));
      else setBooking(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openBooking = (preset: { serviceId?: string; stylistId?: string }) => {
    if (hasReachedBookingLimit(user.id)) {
      setLimitOpen(true); // clear on-screen explanation, not just a toast
      return;
    }
    const step = preset.serviceId ? 1 : 0;
    history.pushState({ booking: step, depth: 1 }, '');
    setBooking({ step, ...preset });
    window.scrollTo(0, 0);
  };

  const goToStep = (step: number) => {
    const depth = ((history.state as { depth?: number } | null)?.depth ?? 0) + 1;
    history.pushState({ booking: step, depth }, '');
    setBooking((b) => (b ? { ...b, step } : b));
    window.scrollTo(0, 0);
  };

  const closeBooking = () => {
    const depth = (history.state as { depth?: number } | null)?.depth ?? 1;
    history.go(-depth);
  };

  if (booking) {
    return (
      <BookingFlow
        user={user}
        step={booking.step}
        presetServiceId={booking.serviceId}
        presetStylistId={booking.stylistId}
        onStep={goToStep}
        onBack={() => history.back()}
        onClose={closeBooking}
        onBooked={(id) => {
          setJustBooked(id);
          closeBooking();
        }}
      />
    );
  }

  return (
    <>
      <Home
        user={user}
        onBook={openBooking}
        onLogout={onLogout}
        justBooked={justBooked}
        onDismissBooked={() => setJustBooked(null)}
      />
      <LimitSheet open={limitOpen} onClose={() => setLimitOpen(false)} userId={user.id} />
    </>
  );
}

/** Shown when the client already holds the maximum number of upcoming bookings */
function LimitSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  useStoreVersion();
  const max = getSettings().max_upcoming;
  const upcoming = getUserUpcoming(userId);
  return (
    <Sheet open={open} onClose={onClose} title="Booking limit reached">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] p-4">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <p className="text-sm leading-relaxed text-amber-50/90">
            You already have <strong>{upcoming.length}</strong> upcoming booking{upcoming.length === 1 ? '' : 's'}. The shop allows up to{' '}
            <strong>{max}</strong> at a time, so you can book again once one of them has taken place — or cancel one from your home screen.
          </p>
        </div>
        <ul className="space-y-2">
          {upcoming.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
              <span className="min-w-0 truncate text-cream">{a.service_name}</span>
              <span className="tnum shrink-0 text-ink-300">
                {relativeDay(a.date)} · {a.time}
              </span>
            </li>
          ))}
        </ul>
        <Button variant="gold" className="w-full" onClick={onClose}>
          Got it
        </Button>
      </div>
    </Sheet>
  );
}

// ============================================================
// HOME
// ============================================================

function Home({
  user,
  onBook,
  onLogout,
  justBooked,
  onDismissBooked,
}: {
  user: User;
  onBook: (preset: { serviceId?: string; stylistId?: string }) => void;
  onLogout: () => void;
  justBooked: string | null;
  onDismissBooked: () => void;
}) {
  useStoreVersion();
  const [accountOpen, setAccountOpen] = useState(false);
  const settings = getSettings();
  const today = todayStr();
  const upcomingList = getUserUpcoming(user.id);
  const upcoming = upcomingList[0];
  const canBookMore = upcomingList.length < settings.max_upcoming;
  const visits = getUserAppointments(user.id).filter((a) => !(isActive(a) && a.date >= today));
  const services = getServices();
  const team = getStylists();
  const daysSince = getDaysSinceLastVisit(user.id);
  const firstName = user.full_name.split(' ')[0];

  return (
    <div className="page-glow min-h-dvh pb-16">
      <AppHeader
        left={<Wordmark name={settings.shop_name} className="text-[24px]" />}
        right={
          <button onClick={() => setAccountOpen(true)} aria-label="Account" className="rounded-full ring-1 ring-white/10 transition hover:ring-gold-400/50">
            <Avatar name={user.full_name} size={38} />
          </button>
        }
      />

      <main className="mx-auto max-w-lg space-y-10 px-4 pt-8">
        {/* Greeting */}
        <section className="animate-rise">
          <p className="text-sm text-ink-400">{greeting()},</p>
          <h1 className="mt-1 font-display text-[44px] leading-none text-cream">{firstName}</h1>
          <p className="mt-3 text-sm text-ink-400">
            {daysSince === null
              ? upcoming
                ? 'Your first visit is coming up — see you soon.'
                : 'Welcome — your first fresh cut is a few taps away.'
              : daysSince === 0
                ? 'Looking sharp — you were in today.'
                : `${daysSince} day${daysSince === 1 ? '' : 's'} since your last visit${daysSince >= 21 ? ' · time for a refresh?' : '.'}`}
          </p>
        </section>

        {/* Next appointment / booking CTA */}
        <section className="animate-rise" style={{ animationDelay: '60ms' }}>
          {upcomingList.length === 0 ? (
            <BookCta onBook={() => onBook({})} />
          ) : (
            <div className="space-y-4">
              {upcomingList.map((a, i) => (
                <UpcomingCard key={a.id} appt={a} label={i === 0 ? 'Your next visit' : 'Also booked'} />
              ))}
              {canBookMore ? (
                <Button variant="outline" size="lg" className="w-full" icon={<CalendarPlus className="size-[18px]" />} onClick={() => onBook({})}>
                  Book another appointment
                </Button>
              ) : (
                <p className="text-center text-xs text-ink-400">
                  You have the maximum of {settings.max_upcoming} upcoming booking{settings.max_upcoming === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Services */}
        {services.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: '120ms' }}>
            <SectionTitle>Services</SectionTitle>
            <Card className="divide-y divide-white/[0.05] overflow-hidden">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onBook({ serviceId: s.id })}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.025]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-cream">{s.name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-ink-400">{s.description || formatDuration(s.duration_min)}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
                      <Clock className="size-3.5" /> {formatDuration(s.duration_min)}
                    </p>
                  </div>
                  <span className="tnum font-display text-[22px] text-cream">{formatPrice(s.price)}</span>
                  <ChevronRight className="size-4 text-ink-500" />
                </button>
              ))}
            </Card>
          </section>
        )}

        {/* Team */}
        {team.length > 0 && (
          <section>
            <SectionTitle>The team</SectionTitle>
            <div className="scrollbar-hide -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1">
              {team.map((s) => (
                <button key={s.id} onClick={() => onBook({ stylistId: s.id })} className="group w-[150px] shrink-0 snap-start text-left">
                  <Portrait name={s.name} src={s.image} className="rounded-3xl border border-white/[0.07] transition group-hover:border-gold-400/40" />
                  <p className="mt-3 font-medium text-cream">{s.name}</p>
                  <p className="text-xs text-ink-400">{s.title}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* History */}
        {visits.length > 0 && (
          <section>
            <SectionTitle>Your visits</SectionTitle>
            <Card className="divide-y divide-white/[0.05]">
              {visits.slice(0, 8).map((a) => {
                const barber = getStylistById(a.stylist_id);
                return (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Avatar name={barber?.name ?? '?'} src={barber?.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-cream">{a.service_name}</p>
                      <p className="text-xs text-ink-400">
                        {formatShortDate(a.date)} · {barber?.name ?? 'Barber'}
                      </p>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                );
              })}
            </Card>
          </section>
        )}

        <VisitUs />
      </main>

      {/* Account */}
      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title="Your account">
        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Avatar name={user.full_name} size={52} />
          <div>
            <p className="font-medium text-cream">{user.full_name}</p>
            <p className="tnum text-sm text-ink-400">{user.mobile_number}</p>
          </div>
        </div>
        <Button variant="outline" className="mt-4 w-full" icon={<LogOut className="size-4" />} onClick={onLogout}>
          Sign out
        </Button>
      </Sheet>

      <BookedSheet id={justBooked} onClose={onDismissBooked} userId={user.id} />
    </div>
  );
}

function BookCta({ onBook }: { onBook: () => void }) {
  return (
    <Card className="grain relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-gold-400/15 blur-3xl" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">Book in 30 seconds</p>
      <h2 className="mt-3 font-display text-[34px] leading-[1.05] text-cream">Ready for a fresh cut?</h2>
      <p className="mt-2 text-sm text-ink-400">Choose a service, your barber and a time that suits you.</p>
      <Button variant="gold" size="lg" className="mt-6 w-full" icon={<CalendarPlus className="size-[18px]" />} onClick={onBook}>
        Book an appointment
      </Button>
    </Card>
  );
}

function UpcomingCard({ appt, label = 'Your next visit' }: { appt: Appointment; label?: string }) {
  const settings = getSettings();
  const barber = getStylistById(appt.stylist_id);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    const ok = await confirmDialog({
      title: 'Cancel this appointment?',
      message: `${appt.service_name} with ${barber?.name ?? 'your barber'} on ${formatLongDate(appt.date)} at ${appt.time}.`,
      confirmText: 'Cancel it',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await updateAppointmentStatus(appt.id, 'cancelled');
      toast('Appointment cancelled');
    } catch {
      toast('Could not cancel — please try again', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-gold-400/[0.08] to-transparent" />
      <div className="relative flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">{label}</span>
        <StatusPill status={appt.status} />
      </div>

      <div className="relative mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-[38px] leading-none text-cream">{relativeDay(appt.date)}</p>
          <p className="tnum mt-2 text-sm text-ink-300">
            {formatLongDate(appt.date)} · {appt.time} – {endTime(appt.time, appt.duration_min)}
          </p>
        </div>
        {countdown(appt.date, appt.time) !== relativeDay(appt.date) && (
          <span className="shrink-0 rounded-full border border-gold-400/30 bg-gold-400/10 px-3 py-1 text-xs font-medium text-gold-200">
            {countdown(appt.date, appt.time)}
          </span>
        )}
      </div>

      <div className="hairline my-5" />

      <div className="flex items-center gap-3">
        <Avatar name={barber?.name ?? '?'} src={barber?.image} size={48} className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-cream">{barber?.name ?? 'Your barber'}</p>
          <p className="truncate text-sm text-ink-400">
            {appt.service_name} · {formatDuration(appt.duration_min)}
          </p>
        </div>
        <p className="tnum font-display text-[26px] text-cream">{formatPrice(appt.price)}</p>
      </div>

      {appt.status === 'pending' && (
        <p className="mt-4 flex items-center gap-2.5 rounded-2xl border border-amber-300/15 bg-amber-400/[0.06] px-3.5 py-2.5 text-[13px] text-amber-100/90">
          <Clock className="size-4 shrink-0 text-amber-300" />
          Waiting for {barber?.name.split(' ')[0] ?? 'your barber'} to confirm — this updates live.
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Button
          variant="subtle"
          size="sm"
          icon={<CalendarPlus className="size-4" />}
          onClick={() =>
            downloadIcs({
              title: `${appt.service_name} · ${settings.shop_name}`,
              description: `With ${barber?.name ?? 'your barber'}`,
              location: settings.address,
              date: appt.date,
              time: appt.time,
              durationMin: appt.duration_min,
            })
          }
        >
          Calendar
        </Button>
        <a
          href={mapsUrl(settings.address)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[13px] font-medium text-cream transition hover:bg-white/[0.1]"
        >
          <Navigation className="size-4" /> Directions
        </a>
        <Button variant="ghost" size="sm" onClick={cancel} loading={busy} className="text-rose-300 hover:text-rose-200">
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function VisitUs() {
  const settings = getSettings();
  const todayIdx = new Date().getDay();
  const order = [1, 2, 3, 4, 5, 6, 0];
  const hoursToday = getHoursFor(todayStr());
  return (
    <section>
      <SectionTitle>Visit us</SectionTitle>
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-gold-300" strokeWidth={1.6} />
          <div className="min-w-0 flex-1">
            <p className="text-cream">{settings.address}</p>
            <p className={cx('mt-0.5 text-sm', hoursToday ? 'text-emerald-300/90' : 'text-ink-400')}>
              {hoursToday ? `Open today · ${hoursToday.open} – ${hoursToday.close}` : 'Closed today'}
            </p>
          </div>
          <a
            href={mapsUrl(settings.address)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/[0.05]"
          >
            Directions
          </a>
        </div>
        {settings.phone && (
          <a href={`tel:${settings.phone}`} className="mt-4 flex items-center gap-3 text-cream">
            <Phone className="size-5 text-gold-300" strokeWidth={1.6} />
            <span className="tnum">{settings.phone}</span>
          </a>
        )}
        <div className="hairline my-5" />
        <dl className="space-y-2 text-sm">
          {order.map((d) => {
            const h = settings.hours[String(d)];
            return (
              <div key={d} className={cx('flex justify-between', d === todayIdx ? 'text-cream' : 'text-ink-400')}>
                <dt className={d === todayIdx ? 'font-medium' : ''}>{WEEKDAYS[d]}</dt>
                <dd className="tnum">{h ? `${h.open} – ${h.close}` : 'Closed'}</dd>
              </div>
            );
          })}
        </dl>
      </Card>
      <p className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-500">
        <Scissors className="size-3.5" /> {settings.shop_name} · {settings.tagline}
      </p>
    </section>
  );
}

/** Celebration sheet right after a booking */
function BookedSheet({ id, onClose, userId }: { id: string | null; onClose: () => void; userId: string }) {
  const settings = getSettings();
  const appt = id ? getUserAppointments(userId).find((a) => a.id === id) : undefined;
  const barber = appt ? getStylistById(appt.stylist_id) : undefined;
  return (
    <Sheet open={!!appt} onClose={onClose} title={appt?.status === 'booked' ? "You're booked in" : 'Request sent'}>
      {appt && (
        <div>
          <div className="animate-pop mx-auto mb-5 grid size-16 place-items-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 shadow-[0_12px_40px_-10px_rgba(201,161,90,0.7)]">
            <Check className="size-8 text-ink-950" strokeWidth={2.5} />
          </div>
          <p className="text-center text-sm text-ink-300">
            {appt.status === 'booked'
              ? `See you ${relativeDay(appt.date).toLowerCase() === 'today' ? 'today' : `on ${formatLongDate(appt.date)}`} at ${appt.time}.`
              : `${barber?.name.split(' ')[0] ?? 'Your barber'} will confirm shortly — you'll see it update on your home screen.`}
          </p>
          <div className="mt-5 space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
            <Row label="Service" value={`${appt.service_name} · ${formatDuration(appt.duration_min)}`} />
            <Row label="Barber" value={barber?.name ?? '—'} />
            <Row label="When" value={`${formatShortDate(appt.date)} · ${appt.time}`} />
            <Row label="Price" value={formatPrice(appt.price)} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              icon={<CalendarPlus className="size-4" />}
              onClick={() =>
                downloadIcs({
                  title: `${appt.service_name} · ${settings.shop_name}`,
                  description: `With ${barber?.name ?? 'your barber'}`,
                  location: settings.address,
                  date: appt.date,
                  time: appt.time,
                  durationMin: appt.duration_min,
                })
              }
            >
              Calendar
            </Button>
            <Button variant="gold" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Sheet>
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
