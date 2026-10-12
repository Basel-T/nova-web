// ============================================================
// AdminSettings.tsx — Shop profile, opening hours, booking rules
// ============================================================

import { useState, type ReactNode } from 'react';
import { CalendarClock, KeyRound, RotateCcw, Store } from 'lucide-react';
import type { DayHours, Settings, User } from '../../types';
import { adminSetPassword, currencyCode, errorText, getSettings, resetDemo, saveSettings, useStoreVersion } from '../../store';
import { cleanNumber } from '../../lib/util';
import { Button, Card, Field, LanguageSwitcher, Select, Toggle, confirmDialog, cx, inputCls, toast } from '../../ui';
import { DEMO_MODE } from '../../config';
import { WEEK_ORDER, formatDuration, timeOptions, toMin, weekdayName } from '../../lib/time';
import { getLocale, t } from '../../i18n';

// ISO codes, euro first; shown with their sign in the active language
const CURRENCIES = ['EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'USD', 'AED', 'SAR'];

function currencyLabel(code: string): string {
  try {
    const sign = new Intl.NumberFormat(getLocale(), { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value;
    return sign && sign !== code ? `${code} (${sign})` : code;
  } catch {
    return code;
  }
}
const HOUR_OPTIONS = timeOptions('05:00', '24:00', 30);
const ORDER = WEEK_ORDER; // Monday first

export default function AdminSettings({ user }: { user: User }) {
  useStoreVersion();
  const saved = getSettings();
  // Older versions saved a sign ("$"); show it as its ISO code
  const [draft, setDraft] = useState<Settings>(() => ({ ...saved, currency: currencyCode(saved.currency) ?? saved.currency }));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...saved, currency: currencyCode(saved.currency) ?? saved.currency });
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));

  const setDay = (day: number, hours: DayHours | null) => set({ hours: { ...draft.hours, [String(day)]: hours } });

  const badDay = ORDER.find((d) => {
    const h = draft.hours[String(d)];
    return h && toMin(h.close) <= toMin(h.open);
  });

  const save = async () => {
    if (draft.shop_name.trim().length < 2) return toast(t('settings.errName'), 'error');
    if (badDay !== undefined) return toast(t('settings.errHours', { day: weekdayName(badDay) }), 'error');
    setSaving(true);
    try {
      const { id: _id, ...patch } = draft;
      await saveSettings({ ...patch, shop_name: draft.shop_name.trim(), tagline: draft.tagline.trim(), address: draft.address.trim(), phone: cleanNumber(draft.phone) });
      toast(t('settings.saved'));
    } catch (e) {
      toast(t('errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const currencies = CURRENCIES.includes(draft.currency) ? CURRENCIES : [draft.currency, ...CURRENCIES];

  return (
    <div className="space-y-5">
      {/* Shop profile */}
      <LanguageSwitcher variant="row" />

      <Section icon={Store} title={t('settings.profile')}>
        <Field label={t('settings.shopName')}>
          <input value={draft.shop_name} onChange={(e) => set({ shop_name: e.target.value })} className={inputCls} />
        </Field>
        <Field label={t('settings.tagline')}>
          <input value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder={t('settings.taglinePlaceholder')} className={inputCls} />
        </Field>
        <Field label={t('settings.address')}>
          <input value={draft.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label={t('csv.phone')}>
            <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" dir="ltr" placeholder="+44 20 7946 0123" className={cx(inputCls, 'tnum text-start')} />
            <p className="mt-1.5 text-xs text-ink-400">{t('settings.phonePlaceholder')}</p>
          </Field>
          <Field label={t('settings.currency')}>
            <Select value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {currencyLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      {/* Opening hours */}
      <Section icon={CalendarClock} title={t('settings.hours')}>
        <ul className="divide-y divide-white/[0.05]">
          {ORDER.map((day) => {
            const h = draft.hours[String(day)];
            return (
              <li key={day} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!h}
                  aria-label={t('settings.dayOpen', { day: weekdayName(day) })}
                  onClick={() => setDay(day, h ? null : { open: '10:00', close: '20:00' })}
                  className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', h ? 'bg-gold-500' : 'bg-ink-600')}
                >
                  <span className={cx('absolute top-1 size-4 rounded-full bg-white transition-all', h ? 'start-5' : 'start-1')} />
                </button>
                <span className={cx('w-10 shrink-0 text-sm sm:w-24', h ? 'text-cream' : 'text-ink-400')}>
                  <span className="sm:hidden">{weekdayName(day, 'short')}</span>
                  <span className="hidden sm:inline">{weekdayName(day)}</span>
                </span>
                {h ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                    <TimeSelect value={h.open} onChange={(v) => setDay(day, { ...h, open: v })} />
                    <span className="text-ink-500">–</span>
                    <TimeSelect value={h.close} onChange={(v) => setDay(day, { ...h, close: v })} />
                  </div>
                ) : (
                  <span className="flex-1 text-sm text-ink-500">{t('client.closed')}</span>
                )}
              </li>
            );
          })}
        </ul>
        {badDay !== undefined && <p className="text-sm text-rose-300">{t('settings.errHours', { day: weekdayName(badDay) })}</p>}
      </Section>

      {/* Booking rules */}
      <Section icon={CalendarClock} title={t('settings.rules')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.interval')} hint={t('settings.intervalHint')}>
            <Select value={draft.slot_interval} onChange={(e) => set({ slot_interval: Number(e.target.value) })}>
              {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {t('time.durMin', { n: m })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.window')} hint={t('settings.windowHint')}>
            <Select value={draft.booking_window_days} onChange={(e) => set({ booking_window_days: Number(e.target.value) })}>
              {[7, 14, 21, 30, 45, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {t('settings.days', { n: d })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('settings.maxUpcoming')} hint={t('settings.maxUpcomingHint')}>
          <Select value={draft.max_upcoming} onChange={(e) => set({ max_upcoming: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {t('settings.bookingsN', { n })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('settings.notice')} hint={t('settings.noticeHint')}>
          <Select value={draft.min_notice_min} onChange={(e) => set({ min_notice_min: Number(e.target.value) })}>
            {[0, 15, 30, 60, 120, 240, 720, 1440].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? t('settings.noticeNone') : t('settings.noticeBefore', { time: formatDuration(m) })}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Toggle
            checked={draft.auto_confirm}
            onChange={(v) => set({ auto_confirm: v })}
            label={t('settings.autoConfirm')}
            description={t('settings.autoConfirmText')}
          />
        </div>
      </Section>

      <PasswordCard user={user} />

      {DEMO_MODE && <ResetDemoCard onDone={() => setDraft(getSettings())} />}

      {/* Save bar */}
      <div className={cx('sticky z-20 transition-all duration-300', dirty ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0')} style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3 rounded-2xl border border-gold-400/25 bg-ink-850/95 p-3 ps-4 shadow-2xl backdrop-blur-xl">
          <span className="flex-1 text-sm text-ink-200">{t('settings.unsaved')}</span>
          <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>
            {t('settings.discard')}
          </Button>
          <Button size="sm" variant="gold" loading={saving} onClick={save}>
            {t('common.save')}
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
      aria-label={t('booking.time')}
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
      title: t('settings.resetTitle'),
      message:
        t('settings.resetText'),
      confirmText: t('settings.resetYes'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await resetDemo();
      onDone();
      toast(t('settings.resetDone'));
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 border-rose-400/20 p-5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200/80">
        <RotateCcw className="size-4" /> {t('settings.demo')}
      </p>
      <p className="text-sm text-ink-300">
        {t('settings.resetInfo')}
      </p>
      <Button variant="danger" className="w-full" loading={busy} icon={<RotateCcw className="size-4" />} onClick={reset}>
        {t('settings.reset')}
      </Button>
    </Card>
  );
}

function PasswordCard({ user }: { user: User }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const update = async () => {
    if (pw.length < 3) return toast(t('team.errPassword'), 'error');
    if (pw !== pw2) return toast(t('settings.pwMismatch'), 'error');
    setBusy(true);
    try {
      await adminSetPassword(user.id, pw);
      setPw('');
      setPw2('');
      toast(t('settings.pwUpdated'));
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Demo safety: a tester changing this would lock everyone out of "Try as Admin"
  if (DEMO_MODE) {
    return (
      <Section icon={KeyRound} title={t('settings.adminPassword')}>
        <p className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-ink-300">
          <KeyRound className="size-4 text-ink-400" /> {t('demo.disabled')}
        </p>
      </Section>
    );
  }

  return (
    <Section icon={KeyRound} title={t('settings.adminPassword')}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('team.newPassword')}>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t('settings.repeat')}>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Button variant="subtle" className="w-full" disabled={!pw} loading={busy} onClick={update}>
        {t('settings.updatePassword')}
      </Button>
      <p className="text-xs text-ink-500">{t('settings.barberPwHint')}</p>
    </Section>
  );
}
