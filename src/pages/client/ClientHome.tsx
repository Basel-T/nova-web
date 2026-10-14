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
  isStillUpcoming,
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
  LanguageSwitcher,
  Wordmark,
  confirmDialog,
  cx,
  toast,
} from '../../ui';
import {
  WEEK_ORDER,
  weekdayName,
  countdown,
  endTime,
  formatDuration,
  formatLongDate,
  formatShortDate,
  greeting,
  relativeDay,
  todayStr,
} from '../../lib/time';
import { cleanNumber, downloadIcs, mapsUrl } from '../../lib/util';
import { PrivacyLink } from '../Privacy';
import BookingFlow from './BookingFlow';
import { t } from '../../i18n';

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
    <Sheet open={open} onClose={onClose} title={t('client.limitTitle')}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] p-4">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <p className="text-sm leading-relaxed text-amber-50/90">
            {t('client.limitText', { n: upcoming.length, max })}
          </p>
        </div>
        <ul className="space-y-2">
          {upcoming.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
              <span dir="auto" className="min-w-0 truncate text-cream [text-align:match-parent]">{a.service_name}</span>
              <span className="tnum shrink-0 text-ink-300">
                {relativeDay(a.date)} · {a.time}
              </span>
            </li>
          ))}
        </ul>
        <Button variant="gold" className="w-full" onClick={onClose}>
          {t('common.gotIt')}
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
  const upcomingList = getUserUpcoming(user.id);
  const upcoming = upcomingList[0];
  const canBookMore = upcomingList.length < settings.max_upcoming;
  const visits = getUserAppointments(user.id).filter((a) => !isStillUpcoming(a)); // past & cancelled, newest first
  const services = getServices();
  const team = getStylists();
  const daysSince = getDaysSinceLastVisit(user.id);
  const firstName = user.full_name.split(' ')[0];

  return (
    <div className="page-glow min-h-dvh pb-16">
      <AppHeader
        left={<Wordmark name={settings.shop_name} className="text-[24px]" />}
        right={
          <button onClick={() => setAccountOpen(true)} aria-label={t('client.account')} className="rounded-full ring-1 ring-white/10 transition hover:ring-gold-400/50">
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
                ? t('client.firstVisitSoon')
                : t('client.firstVisitWelcome')
              : daysSince === 0
                ? t('client.inToday')
                : t('client.daysSince', { n: daysSince }) + (daysSince >= 21 ? ` · ${t('client.refresh')}` : '')}
          </p>
        </section>

        {/* Next appointment / booking CTA */}
        <section className="animate-rise" style={{ animationDelay: '60ms' }}>
          {upcomingList.length === 0 ? (
            <BookCta onBook={() => onBook({})} />
          ) : (
            <div className="space-y-4">
              {upcomingList.map((a, i) => (
                <UpcomingCard key={a.id} appt={a} label={i === 0 ? t('client.nextVisit') : t('client.alsoBooked')} />
              ))}
              {canBookMore ? (
                <Button variant="outline" size="lg" className="w-full" icon={<CalendarPlus className="size-[18px]" />} onClick={() => onBook({})}>
                  {t('client.bookAnother')}
                </Button>
              ) : (
                <p className="text-center text-xs text-ink-400">
                  {t('client.maxReached', { n: settings.max_upcoming })}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Services */}
        {services.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: '120ms' }}>
            <SectionTitle>{t('client.services')}</SectionTitle>
            <Card className="divide-y divide-white/[0.05] overflow-hidden">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onBook({ serviceId: s.id })}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.025]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-cream"><bdi>{s.name}</bdi></p>
                    <p dir="auto" className="mt-0.5 truncate text-[13px] text-ink-400 [text-align:match-parent]">{s.description || formatDuration(s.duration_min)}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
                      <Clock className="size-3.5" /> {formatDuration(s.duration_min)}
                    </p>
                  </div>
                  <span className="tnum font-display text-[22px] text-cream">{formatPrice(s.price)}</span>
                  <ChevronRight className="size-4 text-ink-500 rtl:-scale-x-100" />
                </button>
              ))}
            </Card>
          </section>
        )}

        {/* Team */}
        {team.length > 0 && (
          <section>
            <SectionTitle>{t('client.team')}</SectionTitle>
            <div className="scrollbar-hide -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1">
              {team.map((s) => (
                <button key={s.id} onClick={() => onBook({ stylistId: s.id })} className="group w-[150px] shrink-0 snap-start text-start">
                  <Portrait name={s.name} src={s.image} className="rounded-3xl border border-white/[0.07] transition group-hover:border-gold-400/40" />
                  <p className="mt-3 font-medium text-cream"><bdi>{s.name}</bdi></p>
                  <p className="text-xs text-ink-400"><bdi>{s.title}</bdi></p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* History */}
        {visits.length > 0 && (
          <section>
            <SectionTitle>{t('client.yourVisits')}</SectionTitle>
            <Card className="divide-y divide-white/[0.05]">
              {visits.slice(0, 8).map((a) => {
                const barber = getStylistById(a.stylist_id);
                return (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Avatar name={barber?.name ?? '?'} src={barber?.image} size={36} />
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="truncate text-sm font-medium text-cream [text-align:match-parent]">{a.service_name}</p>
                      <p className="text-xs text-ink-400">
                        {formatShortDate(a.date)} · {barber?.name ?? t('client.barber')}
                      </p>
                    </div>
                    <VisitPill appt={a} />
                  </div>
                );
              })}
            </Card>
          </section>
        )}

        <VisitUs />
      </main>

      {/* Account */}
      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title={t('client.account')}>
        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Avatar name={user.full_name} size={52} />
          <div>
            <p className="font-medium text-cream"><bdi>{user.full_name}</bdi></p>
            <p className="tnum text-sm text-ink-400">{user.mobile_number}</p>
          </div>
        </div>

        <LanguageSwitcher variant="row" className="mt-4" />
        <PrivacyLink variant="row" className="mt-2" />

        <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">{t('client.myVisits')}</p>
        {visits.length === 0 ? (
          <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-sm text-ink-400">
            {t('client.noVisits')}
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            {visits.slice(0, 20).map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-medium text-cream [text-align:match-parent]">{a.service_name}</p>
                  <p className="tnum text-xs text-ink-400">
                    {formatShortDate(a.date)} · {a.time} · {getStylistById(a.stylist_id)?.name ?? t('client.barber')} · {formatPrice(a.price)}
                  </p>
                </div>
                <VisitPill appt={a} />
              </li>
            ))}
          </ul>
        )}

        <Button variant="outline" className="mt-5 w-full" icon={<LogOut className="size-4" />} onClick={onLogout}>
          {t('common.signOut')}
        </Button>
      </Sheet>

      <BookedSheet id={justBooked} onClose={onDismissBooked} userId={user.id} />
    </div>
  );
}

/** Status for a past visit — requests nobody confirmed in time read "Not confirmed" */
function VisitPill({ appt }: { appt: Appointment }) {
  if (appt.status === 'pending' || appt.cancelled_by === 'system') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-ink-300 ring-1 ring-inset ring-white/10">
        <span className="size-1.5 rounded-full bg-ink-400" />
        {t('status.notConfirmed')}
      </span>
    );
  }
  return <StatusPill status={appt.status} />;
}

function BookCta({ onBook }: { onBook: () => void }) {
  return (
    <Card className="grain relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-gold-400/15 blur-3xl" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">{t('client.ctaKicker')}</p>
      <h2 className="mt-3 font-display text-[34px] leading-[1.05] text-cream">{t('client.ctaTitle')}</h2>
      <p className="mt-2 text-sm text-ink-400">{t('client.ctaText')}</p>
      <Button variant="gold" size="lg" className="mt-6 w-full" icon={<CalendarPlus className="size-[18px]" />} onClick={onBook}>
        {t('client.bookAppointment')}
      </Button>
    </Card>
  );
}

function UpcomingCard({ appt, label }: { appt: Appointment; label?: string }) {
  const settings = getSettings();
  const barber = getStylistById(appt.stylist_id);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    const ok = await confirmDialog({
      title: t('client.cancelTitle'),
      message: t('client.cancelText', {
        service: appt.service_name,
        barber: barber?.name ?? t('client.yourBarber'),
        date: formatLongDate(appt.date),
        time: appt.time,
      }),
      confirmText: t('client.cancelIt'),
      cancelText: t('client.keepIt'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await updateAppointmentStatus(appt.id, 'cancelled');
      toast(t('client.cancelled'));
    } catch {
      toast(t('client.cancelFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-gold-400/[0.08] to-transparent" />
      <div className="relative flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">{label ?? t('client.nextVisit')}</span>
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
          <p className="font-medium text-cream">{barber?.name ?? t('client.yourBarber')}</p>
          <p className="truncate text-sm text-ink-400">
            <bdi>{appt.service_name}</bdi> · {formatDuration(appt.duration_min)}
          </p>
        </div>
        <p className="tnum font-display text-[26px] text-cream">{formatPrice(appt.price)}</p>
      </div>

      {appt.status === 'pending' && (
        <p className="mt-4 flex items-center gap-2.5 rounded-2xl border border-amber-300/15 bg-amber-400/[0.06] px-3.5 py-2.5 text-[13px] text-amber-100/90">
          <Clock className="size-4 shrink-0 text-amber-300" />
          {t('client.waitingFor', { name: barber?.name.split(' ')[0] ?? t('client.yourBarber') })}
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
              description: t('client.icsWith', { name: barber?.name ?? t('client.yourBarber') }),
              location: settings.address,
              date: appt.date,
              time: appt.time,
              durationMin: appt.duration_min,
            })
          }
        >
          {t('client.calendar')}
        </Button>
        <a
          href={mapsUrl(settings.address)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-[13px] font-medium text-cream transition hover:bg-white/[0.1]"
        >
          <Navigation className="size-4" /> {t('client.directions')}
        </a>
        <Button variant="ghost" size="sm" onClick={cancel} loading={busy} className="text-rose-300 hover:text-rose-200">
          {t('common.cancel')}
        </Button>
      </div>
    </Card>
  );
}

function VisitUs() {
  const settings = getSettings();
  const todayIdx = new Date().getDay();
  const order = WEEK_ORDER; // Monday first
  const hoursToday = getHoursFor(todayStr());
  return (
    <section>
      <SectionTitle>{t('client.visitUs')}</SectionTitle>
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-gold-300" strokeWidth={1.6} />
          <div className="min-w-0 flex-1">
            <p className="text-cream"><bdi>{settings.address}</bdi></p>
            <p className={cx('mt-0.5 text-sm', hoursToday ? 'text-emerald-300/90' : 'text-ink-400')}>
              {hoursToday ? t('login.openToday', { from: hoursToday.open, to: hoursToday.close }) : t('login.closedToday')}
            </p>
          </div>
          <a
            href={mapsUrl(settings.address)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/[0.05]"
          >
            {t('client.directions')}
          </a>
        </div>
        {settings.phone && (
          <a href={`tel:${cleanNumber(settings.phone)}`} className="mt-4 flex items-center gap-3 text-cream">
            <Phone className="size-5 text-gold-300" strokeWidth={1.6} />
            <span className="tnum" dir="ltr">{settings.phone}</span>
          </a>
        )}
        <div className="hairline my-5" />
        <dl className="space-y-2 text-sm">
          {order.map((d) => {
            const h = settings.hours[String(d)];
            return (
              <div key={d} className={cx('flex justify-between', d === todayIdx ? 'text-cream' : 'text-ink-400')}>
                <dt className={d === todayIdx ? 'font-medium' : ''}>{weekdayName(d)}</dt>
                <dd className="tnum">{h ? `${h.open} – ${h.close}` : t('client.closed')}</dd>
              </div>
            );
          })}
        </dl>
      </Card>
      <p className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-500">
        <Scissors className="size-3.5" /> <bdi>{settings.shop_name}</bdi> · <bdi>{settings.tagline}</bdi>
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
    <Sheet open={!!appt} onClose={onClose} title={appt?.status === 'booked' ? t('client.bookedTitle') : t('client.requestSent')}>
      {appt && (
        <div>
          <div className="animate-pop mx-auto mb-5 grid size-16 place-items-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 shadow-[0_12px_40px_-10px_rgba(201,161,90,0.7)]">
            <Check className="size-8 text-ink-950" strokeWidth={2.5} />
          </div>
          <p className="text-center text-sm text-ink-300">
            {appt.status === 'booked'
              ? appt.date === todayStr()
                ? t('client.seeYouToday', { time: appt.time })
                : t('client.seeYouOn', { date: formatLongDate(appt.date), time: appt.time })
              : t('client.willConfirm', { name: barber?.name.split(' ')[0] ?? t('client.yourBarber') })}
          </p>
          <div className="mt-5 space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
            <Row label={t('client.service')} value={`${appt.service_name} · ${formatDuration(appt.duration_min)}`} />
            <Row label={t('client.barber')} value={barber?.name ?? '—'} />
            <Row label={t('client.when')} value={`${formatShortDate(appt.date)} · ${appt.time}`} />
            <Row label={t('client.price')} value={formatPrice(appt.price)} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              icon={<CalendarPlus className="size-4" />}
              onClick={() =>
                downloadIcs({
                  title: `${appt.service_name} · ${settings.shop_name}`,
                  description: t('client.icsWith', { name: barber?.name ?? t('client.yourBarber') }),
                  location: settings.address,
                  date: appt.date,
                  time: appt.time,
                  durationMin: appt.duration_min,
                })
              }
            >
              {t('client.calendar')}
            </Button>
            <Button variant="gold" onClick={onClose}>
              {t('common.done')}
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
      <span className="tnum text-end text-cream">
        <bdi>{value}</bdi>
      </span>
    </div>
  );
}
