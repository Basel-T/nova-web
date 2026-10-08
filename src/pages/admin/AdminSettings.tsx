// ============================================================
// AdminSettings.tsx — Shop profile, opening hours, booking rules
// ============================================================

import { useState, type ReactNode } from 'react';
import { CalendarClock, KeyRound, RotateCcw, Store } from 'lucide-react';
import type { DayHours, Settings, User } from '../../types';
import { adminSetPassword, getSettings, resetDemo, saveSettings, useStoreVersion } from '../../store';
import { Button, Card, Field, Select, Toggle, confirmDialog, cx, inputCls, toast } from '../../ui';
import { DEMO_MODE } from '../../config';
import { WEEKDAYS, formatDuration, timeOptions, toMin } from '../../lib/time';

const CURRENCIES = ['$', '€', '£', '₪', 'AED', 'SAR', 'QAR', 'KWD', 'JOD', 'EGP', 'TRY', '₹', 'CHF', 'CA$', 'A$', '¥'];
const HOUR_OPTIONS = timeOptions('05:00', '24:00', 30);
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function AdminSettings({ user }: { user: User }) {
  useStoreVersion();
  const saved = getSettings();
  const [draft, setDraft] = useState<Settings>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));

  const setDay = (day: number, hours: DayHours | null) => set({ hours: { ...draft.hours, [String(day)]: hours } });

  const badDay = ORDER.find((d) => {
    const h = draft.hours[String(d)];
    return h && toMin(h.close) <= toMin(h.open);
  });

  const save = async () => {
    if (draft.shop_name.trim().length < 2) return toast('Shop name is too short', 'error');
    if (badDay !== undefined) return toast(`${WEEKDAYS[badDay]}: closing time must be after opening`, 'error');
    setSaving(true);
    try {
      const { id: _id, ...patch } = draft;
      await saveSettings({ ...patch, shop_name: draft.shop_name.trim(), tagline: draft.tagline.trim(), address: draft.address.trim(), phone: draft.phone.trim() });
      toast('Settings saved');
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const currencies = CURRENCIES.includes(draft.currency) ? CURRENCIES : [draft.currency, ...CURRENCIES];

  return (
    <div className="space-y-5">
      {/* Shop profile */}
      <Section icon={Store} title="Shop profile">
        <Field label="Shop name">
          <input value={draft.shop_name} onChange={(e) => set({ shop_name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Tagline">
          <input value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="e.g. Barbershop · Est. 2026" className={inputCls} />
        </Field>
        <Field label="Address">
          <input value={draft.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Phone">
            <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" placeholder="Shown to clients" className={cx(inputCls, 'tnum')} />
          </Field>
          <Field label="Currency">
            <Select value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      {/* Opening hours */}
      <Section icon={CalendarClock} title="Opening hours">
        <ul className="divide-y divide-white/[0.05]">
          {ORDER.map((day) => {
            const h = draft.hours[String(day)];
            return (
              <li key={day} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!h}
                  aria-label={`${WEEKDAYS[day]} open`}
                  onClick={() => setDay(day, h ? null : { open: '10:00', close: '20:00' })}
                  className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', h ? 'bg-gold-500' : 'bg-ink-600')}
                >
                  <span className={cx('absolute top-1 size-4 rounded-full bg-white transition-all', h ? 'left-5' : 'left-1')} />
                </button>
                <span className={cx('w-10 shrink-0 text-sm sm:w-24', h ? 'text-cream' : 'text-ink-400')}>
                  <span className="sm:hidden">{WEEKDAYS[day].slice(0, 3)}</span>
                  <span className="hidden sm:inline">{WEEKDAYS[day]}</span>
                </span>
                {h ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                    <TimeSelect value={h.open} onChange={(v) => setDay(day, { ...h, open: v })} />
                    <span className="text-ink-500">–</span>
                    <TimeSelect value={h.close} onChange={(v) => setDay(day, { ...h, close: v })} />
                  </div>
                ) : (
                  <span className="flex-1 text-sm text-ink-500">Closed</span>
                )}
              </li>
            );
          })}
        </ul>
        {badDay !== undefined && <p className="text-sm text-rose-300">{WEEKDAYS[badDay]}: closing time must be after opening.</p>}
      </Section>

      {/* Booking rules */}
      <Section icon={CalendarClock} title="Booking rules">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start times every" hint="How often booking times are offered.">
            <Select value={draft.slot_interval} onChange={(e) => set({ slot_interval: Number(e.target.value) })}>
              {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Book ahead up to" hint="How far ahead clients can book.">
            <Select value={draft.booking_window_days} onChange={(e) => set({ booking_window_days: Number(e.target.value) })}>
              {[7, 14, 21, 30, 45, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Minimum notice" hint="Stops last-minute bookings you can't prepare for.">
          <Select value={draft.min_notice_min} onChange={(e) => set({ min_notice_min: Number(e.target.value) })}>
            {[0, 15, 30, 60, 120, 240, 720, 1440].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'None — book any free time' : `${formatDuration(m)} before`}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Toggle
            checked={draft.auto_confirm}
            onChange={(v) => set({ auto_confirm: v })}
            label="Confirm bookings automatically"
            description="Off: barbers approve each request. On: bookings are confirmed instantly."
          />
        </div>
      </Section>

      <PasswordCard user={user} />

      {DEMO_MODE && <ResetDemoCard onDone={() => setDraft(getSettings())} />}

      {/* Save bar */}
      <div className={cx('sticky z-20 transition-all duration-300', dirty ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0')} style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3 rounded-2xl border border-gold-400/25 bg-ink-850/95 p-3 pl-4 shadow-2xl backdrop-blur-xl">
          <span className="flex-1 text-sm text-ink-200">You have unsaved changes</span>
          <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>
            Discard
          </Button>
          <Button size="sm" variant="gold" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Store; title: string; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">
        <Icon className="size-4 text-gold-300" /> {title}
      </p>
      {children}
    </Card>
  );
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = HOUR_OPTIONS.includes(value) ? HOUR_OPTIONS : [value, ...HOUR_OPTIONS].sort();
  return (
    // Plain compact select (no chevron padding) so "10:00" always fits on a 375px phone
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Time"
      className={cx(inputCls, 'tnum h-10 w-0 min-w-[64px] flex-1 cursor-pointer appearance-none px-1 text-center text-sm')}
    >
      {options.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );
}

/** Demo only: wipe everything testers did and restore the demo shop */
function ResetDemoCard({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Reset the demo?',
      message:
        'Are you sure? This deletes ALL bookings, blocked times, the activity log and every client except the demo client, and restores the demo barbers, services, hours and settings. Staff passwords go back to 12345. This cannot be undone.',
      confirmText: 'Yes, reset',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await resetDemo();
      onDone();
      toast('Demo reset — fresh shop ready');
    } catch (e) {
      toast(`Could not reset: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 border-rose-400/20 p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200/80">
        <RotateCcw className="size-4" /> Demo
      </p>
      <p className="text-sm text-ink-300">
        Clean up after testers: removes all bookings, clients and activity and restores the original demo shop. Barber photos are kept.
      </p>
      <Button variant="danger" className="w-full" loading={busy} icon={<RotateCcw className="size-4" />} onClick={reset}>
        Reset demo
      </Button>
    </Card>
  );
}

function PasswordCard({ user }: { user: User }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const update = async () => {
    if (pw.length < 3) return toast('Use at least 3 characters', 'error');
    if (pw !== pw2) return toast("Passwords don't match", 'error');
    setBusy(true);
    try {
      await adminSetPassword(user.id, pw);
      setPw('');
      setPw2('');
      toast('Admin password updated');
    } catch (e) {
      toast(`Could not update: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon={KeyRound} title="Admin password">
      <div className="grid grid-cols-2 gap-3">
        <Field label="New password">
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Repeat">
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Button variant="subtle" className="w-full" disabled={!pw} loading={busy} onClick={update}>
        Update password
      </Button>
      <p className="text-xs text-ink-500">Barber passwords are set in Team → tap a barber.</p>
    </Section>
  );
}
