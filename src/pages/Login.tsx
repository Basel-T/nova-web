// ============================================================
// Login.tsx — Frictionless Authentication Page
// ============================================================
// Flow:
//   1. User enters mobile number → click "Continue"
//   2. If number exists in the cloud DB → log them in immediately
//   3. If number doesn't exist → show name field → create account
// No passwords needed. Simple and fast.
// ============================================================

import { useState } from 'react';
import { findUserByMobile, addUser, setCurrentUser } from '../store';
import { User } from '../types';
import { btnGold, inputClass } from '../components';

interface Props {
  onLogin: (user: User) => void;
}

/** Keep digits only so "050-123 4567" and "0501234567" are the same account */
const cleanNumber = (s: string) => s.replace(/\D/g, '');

export default function Login({ onLogin }: Props) {
  const [mobile, setMobile] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** Step 1: look the mobile number up in the cloud */
  const handleMobileSubmit = async () => {
    const number = cleanNumber(mobile);
    if (number.length < 7) {
      setError('Please enter a valid mobile number');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await findUserByMobile(number);
      if (user) {
        setCurrentUser(user);
        onLogin(user);
      } else {
        setShowNameInput(true);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Step 2: new user gives their name → account is created */
  const handleRegister = async () => {
    if (fullName.trim().length < 2) {
      setError('Please enter your full name');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const newUser = await addUser(fullName.trim(), cleanNumber(mobile));
      setCurrentUser(newUser);
      onLogin(newUser);
    } catch {
      setError('Could not create your account. Please try again.');
      setBusy(false);
    }
  };

  const demoLogin = (n: string) => {
    setMobile(n);
    setShowNameInput(false);
    setError('');
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      <div className="barber-stripe h-1.5" />

      {/* Branding */}
      <div className="text-center pt-14 pb-8 px-6 text-white">
        <div className="text-6xl mb-4">💈</div>
        <h1 className="font-display text-4xl font-bold tracking-wider uppercase">
          Blade <span className="text-amber-500">&</span> Fade
        </h1>
        <p className="text-neutral-400 mt-2 text-sm tracking-widest uppercase">Barbershop · Est. 2026</p>
      </div>

      {/* Card */}
      <div className="flex-1 bg-stone-100 rounded-t-[2rem] px-5 pt-8 pb-10">
        <div className="max-w-md mx-auto">
          {!showNameInput ? (
            <div>
              <h2 className="font-display text-2xl font-semibold text-neutral-900 uppercase tracking-wide">
                Book your cut
              </h2>
              <p className="text-neutral-500 text-sm mt-1 mb-6">Enter your mobile number to sign in or sign up.</p>

              <label className="block text-sm font-medium text-neutral-600 mb-2">Mobile Number</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. 050 123 4567"
                className={inputClass}
                onKeyDown={(e) => e.key === 'Enter' && handleMobileSubmit()}
              />
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              <button onClick={handleMobileSubmit} disabled={busy} className={`${btnGold} w-full mt-6 py-4 text-lg`}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </div>
          ) : (
            <div>
              <div className="bg-neutral-900 text-white rounded-2xl p-4 mb-6">
                <p className="text-sm text-center">
                  👋 New here? Welcome! Let's set up your account.
                </p>
              </div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">Your Full Name</label>
              <input
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. James Carter"
                className={inputClass}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              />
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              <button onClick={handleRegister} disabled={busy} className={`${btnGold} w-full mt-6 py-4 text-lg`}>
                {busy ? 'Creating…' : 'Create Account'}
              </button>
              <button
                onClick={() => {
                  setShowNameInput(false);
                  setError('');
                }}
                className="w-full mt-3 py-3 text-neutral-500 hover:text-neutral-800 transition-colors text-sm"
              >
                ← Change number
              </button>
            </div>
          )}

          {/* Demo logins — tap to fill */}
          <div className="mt-10 border-t border-stone-300 pt-6">
            <p className="text-xs text-neutral-400 text-center uppercase tracking-widest mb-3">Demo logins (tap to fill)</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['👑 Admin', '0000000000'],
                ['✂️ Marcus (Barber)', '1111111111'],
                ['✂️ Leo (Barber)', '2222222222'],
                ['✂️ Omar (Barber)', '3333333333'],
              ].map(([label, n]) => (
                <button
                  key={n}
                  onClick={() => demoLogin(n)}
                  className="bg-white border border-stone-200 rounded-xl px-3 py-2 text-left hover:border-amber-400 transition-colors"
                >
                  <span className="block font-semibold text-neutral-700">{label}</span>
                  <span className="font-mono text-neutral-400">{n}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 text-center mt-3">
              Any other number = new customer account
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
