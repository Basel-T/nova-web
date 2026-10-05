// ============================================================
// Login.tsx — Sign in / sign up
// ============================================================
// 1. Mobile number → Continue
// 2a. Unknown number   → ask for a name → new client account
// 2b. Client number    → signed in immediately (no password)
// 2c. Staff number     → password step (admin & barbers)
// ============================================================

import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, Phone, UserRound } from 'lucide-react';
import type { User } from '../types';
import { addUser, findUserByMobile, getHoursFor, getSettings, saveSession, staffLogin, useStoreVersion } from '../store';
import { Avatar, Button, LogoMark, Wordmark, cx, inputCls } from '../ui';
import { cleanNumber } from '../lib/util';
import { todayStr } from '../lib/time';

type Step = 'phone' | 'name' | 'password';

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

  const fail = (message: string) => {
    setError(message);
    setShake((s) => s + 1);
  };

  const go = (next: Step) => {
    setError('');
    setStep(next);
  };

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault();
    const number = cleanNumber(mobile);
    if (number.length < 7) return fail('Please enter a valid mobile number');
    setBusy(true);
    setError('');
    try {
      const user = await findUserByMobile(number);
      if (!user) go('name');
      else if (user.role === 'client') {
        saveSession({ user });
        onLogin(user);
      } else {
        setStaff(user);
        setPassword('');
        go('password');
      }
    } catch {
      fail("Can't reach the shop right now — check your connection");
    } finally {
      setBusy(false);
    }
  };

  const submitName = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return fail('Please enter your full name');
    setBusy(true);
    try {
      onLogin(await addUser(name.trim(), cleanNumber(mobile)));
    } catch {
      fail('Could not create your account — please try again');
      setBusy(false);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return fail('Enter your password');
    setBusy(true);
    try {
      const user = await staffLogin(cleanNumber(mobile), password);
      if (user) onLogin(user);
      else {
        setPassword('');
        fail('Incorrect password');
        setBusy(false);
      }
    } catch {
      fail("Can't reach the shop right now — check your connection");
      setBusy(false);
    }
  };

  return (
    <div className="page-glow grain flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
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
              <h1 className="font-display text-[34px] leading-tight text-cream">Book your next cut</h1>
              <p className="mt-2 text-sm text-ink-400">Sign in or create an account with your mobile number.</p>
              <div key={shake} className={cx('relative mt-7', shake > 0 && 'animate-shake')}>
                <Phone className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="Mobile number"
                  placeholder="Mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className={cx(inputCls, 'tnum h-14 pl-11 text-[17px] tracking-wide')}
                />
              </div>
              {error && <p className="mt-2.5 text-sm text-rose-300">{error}</p>}
              <Button type="submit" variant="gold" size="lg" className="mt-5 w-full" loading={busy}>
                Continue <ArrowRight className="size-4" />
              </Button>
              <p className="mt-6 text-center text-xs text-ink-500">Barbers and staff sign in with their number and password.</p>
            </form>
          )}

          {step === 'name' && (
            <form onSubmit={submitName}>
              <BackLink onClick={() => go('phone')} />
              <h1 className="font-display text-[34px] leading-tight text-cream">Welcome</h1>
              <p className="mt-2 text-sm text-ink-400">Looks like you're new here. What should we call you?</p>
              <div key={shake} className={cx('relative mt-7', shake > 0 && 'animate-shake')}>
                <UserRound className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" />
                <input
                  autoFocus
                  autoComplete="name"
                  aria-label="Full name"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={cx(inputCls, 'h-14 pl-11 text-[17px]')}
                />
              </div>
              {error && <p className="mt-2.5 text-sm text-rose-300">{error}</p>}
              <Button type="submit" variant="gold" size="lg" className="mt-5 w-full" loading={busy}>
                Create account
              </Button>
            </form>
          )}

          {step === 'password' && staff && (
            <form onSubmit={submitPassword}>
              <BackLink onClick={() => go('phone')} />
              <div className="flex items-center gap-4">
                <Avatar name={staff.full_name} size={52} />
                <div>
                  <h1 className="font-display text-[30px] leading-tight text-cream">Welcome back{staff.role === 'stylist' ? `, ${staff.full_name.split(' ')[0]}` : ''}</h1>
                  <p className="text-sm text-ink-400">{staff.role === 'admin' ? 'Admin sign-in' : 'Barber sign-in'}</p>
                </div>
              </div>
              <div key={shake} className={cx('relative mt-7', shake > 0 && 'animate-shake')}>
                <Lock className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" />
                <input
                  autoFocus
                  type="password"
                  autoComplete="current-password"
                  aria-label="Password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cx(inputCls, 'h-14 pl-11 text-[17px] tracking-widest')}
                />
              </div>
              {error && <p className="mt-2.5 text-sm text-rose-300">{error}</p>}
              <Button type="submit" variant="gold" size="lg" className="mt-5 w-full" loading={busy}>
                Sign in
              </Button>
            </form>
          )}
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-ink-500">
        {hours ? `Open today ${hours.open} – ${hours.close}` : 'Closed today'} · {settings.address}
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
      <ArrowLeft className="size-4" /> Change number
    </button>
  );
}
