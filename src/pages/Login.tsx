// ============================================================
// Login.tsx — Sign in / sign up
// ============================================================
// 1. Mobile number → Continue
// 2a. Unknown number   → ask for a name → new client account
// 2b. Client number    → signed in immediately (no password)
// 2c. Staff number     → password step (admin & barbers)
// ============================================================

import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Crown, FlaskConical, Lock, Phone, Scissors, UserRound } from 'lucide-react';
import type { User } from '../types';
import { addUser, findUserByMobile, getHoursFor, getSettings, saveSession, staffLogin, useStoreVersion } from '../store';
import { Avatar, Button, LanguageSwitcher, LogoMark, Wordmark, cx, inputCls } from '../ui';
import { cleanNumber, digitCount } from '../lib/util';
import { DEMO_ACCOUNTS, DEMO_MODE } from '../config';
import { todayStr } from '../lib/time';
import { t, type MessageKey } from '../i18n';
import { PrivacyLink } from './Privacy';

type Step = 'phone' | 'name' | 'password';
type DemoRole = 'admin' | 'barber' | 'client';

const DEMO_BUTTONS: { role: DemoRole; label: MessageKey; icon: typeof Crown }[] = [
  { role: 'admin', label: 'login.tryAdmin', icon: Crown },
  { role: 'barber', label: 'login.tryBarber', icon: Scissors },
  { role: 'client', label: 'login.tryClient', icon: UserRound },
];

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  useStoreVersion();
  const settings = getSettings();
  const hours = getHoursFor(todayStr());

  const [step, setStep] = useState<Step>('phone');
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [staff, setStaff] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [demoBusy, setDemoBusy] = useState<DemoRole | null>(null);

  const fail = (message: string) => {
    setError(message);
    setShake((s) => s + 1);
  };

  /** One-tap demo sign-in (only shown when DEMO_MODE is on) */
  const tryAs = async (role: DemoRole) => {
    setDemoBusy(role);
    setError('');
    try {
      if (role === 'client') {
        const { mobile: number, name: demoName } = DEMO_ACCOUNTS.client;
        const existing = await findUserByMobile(number);
        if (existing && existing.role === 'client') {
          saveSession({ user: existing });
          onLogin(existing);
        } else {
          onLogin(await addUser(demoName, number));
        }
      } else {
        const acc = DEMO_ACCOUNTS[role];
        const user = await staffLogin(acc.mobile, acc.password);
        if (user) onLogin(user);
        else fail(t('login.errDemoChanged'));
      }
    } catch {
      fail(t('errors.offline'));
    } finally {
      setDemoBusy(null);
    }
  };

  const go = (next: Step) => {
    setError('');
    setStep(next);
  };

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault();
    const number = cleanNumber(mobile);
    if (digitCount(number) < 3) return fail(t('login.errEnterNumber'));
    setBusy(true);
    setError('');
    try {
      const user = await findUserByMobile(number);
      // Short numbers are only for staff accounts — new clients need a real number
      if (!user && digitCount(number) < 7) fail(t('login.errValidNumber'));
      else if (!user) go('name');
      else if (user.role === 'client') {
        saveSession({ user });
        onLogin(user);
      } else {
        setStaff(user);
        setPassword('');
        go('password');
      }
    } catch {
      fail(t('errors.offline'));
    } finally {
      setBusy(false);
    }
  };

  const submitName = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return fail(t('login.errName'));
    setBusy(true);
    try {
      onLogin(await addUser(name.trim(), cleanNumber(mobile)));
    } catch {
      fail(t('login.errCreate'));
      setBusy(false);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return fail(t('login.errPassword'));
    setBusy(true);
    try {
      const user = await staffLogin(cleanNumber(mobile), password);
      if (user) onLogin(user);
      else {
        setPassword('');
        fail(t('login.errWrongPassword'));
        setBusy(false);
      }
    } catch {
      fail(t('errors.offline'));
      setBusy(false);
    }
  };

  return (
    <div className="page-glow grain relative flex min-h-dvh flex-col">
      <header className="relative z-10 flex items-start gap-3 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        {DEMO_MODE && (
          <p role="note" className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] px-3.5 py-2 text-[12.5px] leading-snug text-amber-100">
            <FlaskConical className="size-4 shrink-0 text-amber-300" strokeWidth={1.8} />
            {t('demo.banner')}
          </p>
        )}
        <LanguageSwitcher className="ms-auto shrink-0" />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-12 pt-8">
        {/* Brand */}
        <div className="animate-rise flex flex-col items-center text-center">
          <LogoMark size={68} />
          <Wordmark name={settings.shop_name} className="mt-7 text-[52px]" />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.38em] text-gold-400/80">{settings.tagline}</p>
        </div>

        <div className="hairline my-10" />

        <div key={step} className="animate-rise" style={{ animationDelay: '60ms' }}>
          {step === 'phone' && (
            <form onSubmit={submitPhone}>
              {DEMO_MODE && (
                <div className="mb-9">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">{t('login.demoTitle')}</p>
                  <p className="mt-1.5 text-sm text-ink-300">{t('login.demoSub')}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {DEMO_BUTTONS.map(({ role, label, icon: Icon }) => (
                      <button
                        key={role}
                        type="button"
                        disabled={demoBusy !== null}
                        onClick={() => tryAs(role)}
                        className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border border-gold-400/25 bg-gold-400/[0.06] px-1.5 py-2 text-cream transition hover:border-gold-400/50 hover:bg-gold-400/10 active:scale-[0.97] disabled:opacity-60"
                      >
                        {demoBusy === role ? (
                          <span className="size-5 animate-spin rounded-full border-2 border-gold-300 border-t-transparent" />
                        ) : (
                          <Icon className="size-5 text-gold-300" strokeWidth={1.6} />
                        )}
                        <span className="text-center text-[12.5px] font-medium leading-tight [hyphens:auto]">{t(label)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-8 flex items-center gap-3 text-xs text-ink-400">
                    <span className="h-px flex-1 bg-white/10" /> {t('login.orNumber')} <span className="h-px flex-1 bg-white/10" />
                  </div>
                </div>
              )}
              <h1 className="font-display text-[34px] leading-tight text-cream">{t('login.title')}</h1>
              <p className="mt-2 text-sm text-ink-300">{t('login.subtitle')}</p>
              {/* Phone numbers are always written left-to-right, also in Arabic */}
              <div key={shake} dir="ltr" className={cx('relative mt-7', shake > 0 && 'animate-shake')}>
                <Phone className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label={t('login.mobile')}
                  placeholder={t('login.mobile')}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className={cx(inputCls, 'tnum h-14 pl-11 text-[17px] tracking-wide')}
                />
              </div>
              {error && <p className="mt-2.5 text-sm text-rose-300">{error}</p>}
              {DEMO_MODE && <p className="mt-2.5 text-xs leading-relaxed text-ink-400">{t('demo.loginNote')}</p>}
              <Button type="submit" variant="gold" size="lg" className="mt-5 w-full" loading={busy}>
                {t('login.continue')} <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Button>
              <p className="mt-6 text-center text-xs text-ink-300">{t('login.staffNote')}</p>
            </form>
          )}

          {step === 'name' && (
            <form onSubmit={submitName}>
              <BackLink onClick={() => go('phone')} />
              <h1 className="font-display text-[34px] leading-tight text-cream">{t('login.welcome')}</h1>
              <p className="mt-2 text-sm text-ink-300">{t('login.newHere')}</p>
              <div key={shake} className={cx('relative mt-7', shake > 0 && 'animate-shake')}>
                <UserRound className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" />
                <input
                  autoFocus
                  autoComplete="name"
                  aria-label={t('login.fullName')}
                  placeholder={t('login.fullName')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={cx(inputCls, 'h-14 ps-11 text-[17px]')}
                />
              </div>
              {error && <p className="mt-2.5 text-sm text-rose-300">{error}</p>}
              <Button type="submit" variant="gold" size="lg" className="mt-5 w-full" loading={busy}>
                {t('login.createAccount')}
              </Button>
            </form>
          )}

          {step === 'password' && staff && (
            <form onSubmit={submitPassword}>
              <BackLink onClick={() => go('phone')} />
              <div className="flex items-center gap-4">
                <Avatar name={staff.full_name} size={52} />
                <div>
                  <h1 className="font-display text-[30px] leading-tight text-cream">
                    {staff.role === 'stylist' ? t('login.welcomeBackName', { name: staff.full_name.split(' ')[0] }) : t('login.welcomeBack')}
                  </h1>
                  <p className="text-sm text-ink-400">{staff.role === 'admin' ? t('login.adminSignIn') : t('login.barberSignIn')}</p>
                </div>
              </div>
              <div key={shake} className={cx('relative mt-7', shake > 0 && 'animate-shake')}>
                <Lock className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" />
                <input
                  autoFocus
                  type="password"
                  autoComplete="current-password"
                  aria-label={t('login.password')}
                  placeholder={t('login.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cx(inputCls, 'h-14 ps-11 text-[17px] tracking-widest')}
                />
              </div>
              {error && <p className="mt-2.5 text-sm text-rose-300">{error}</p>}
              <Button type="submit" variant="gold" size="lg" className="mt-5 w-full" loading={busy}>
                {t('login.signIn')}
              </Button>
            </form>
          )}
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-ink-300">
        <p>
          {hours ? t('login.openToday', { from: hours.open, to: hours.close }) : t('login.closedToday')} · {settings.address}
        </p>
        <PrivacyLink className="mt-3" />
      </footer>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition-colors hover:text-cream"
    >
      <ArrowLeft className="size-4 rtl:-scale-x-100" /> {t('login.changeNumber')}
    </button>
  );
}
