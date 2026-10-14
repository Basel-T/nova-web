// ============================================================
// AdminTeam.tsx — Barbers: photos, profiles, logins & passwords
// ============================================================

import { useEffect, useState } from 'react';
import { Camera, ImageOff, KeyRound, Lock, Plus, Trash2, UserPlus } from 'lucide-react';
import type { Stylist } from '../../types';
import {
  errorText,
  addStylist,
  getAppointments,
  getStylists,
  removeStylist,
  updateStylist,
  useStoreVersion,
  type PhotoChange,
} from '../../store';
import { Button, Card, EmptyState, Field, Portrait, Sheet, Toggle, confirmDialog, cx, inputCls, textareaCls, toast } from '../../ui';
import { todayStr } from '../../lib/time';
import { cleanNumber, digitCount } from '../../lib/util';
import { DEMO_ACCOUNTS, DEMO_MODE } from '../../config';
import { t } from '../../i18n';

export default function AdminTeam() {
  useStoreVersion();
  const team = getStylists(true);
  const today = todayStr();
  const [editing, setEditing] = useState<Stylist | 'new' | null>(null);

  return (
    <div className="space-y-4">
      {team.length === 0 ? (
        <Card>
          <EmptyState icon={UserPlus} title={t('team.empty')} text={t('team.emptyText')} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {team.map((s) => {
            const upcoming = getAppointments().filter(
              (a) => a.stylist_id === s.id && a.date >= today && (a.status === 'pending' || a.status === 'booked')
            ).length;
            return (
              <Card key={s.id} onClick={() => setEditing(s)} className="flex gap-4 p-3">
                <Portrait name={s.name} src={s.image} className="w-[84px] shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1 py-1">
                  <div className="flex items-start justify-between gap-2">
                    <p dir="auto" className="truncate text-[17px] font-medium text-cream [text-align:match-parent]">{s.name}</p>
                    <span
                      className={cx(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                        s.active ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.06] text-ink-300'
                      )}
                    >
                      {s.active ? t('team.booking') : t('team.paused')}
                    </span>
                  </div>
                  <p className="text-[13px] text-gold-300/90"><bdi>{s.title}</bdi></p>
                  <p className="tnum mt-2 text-xs text-ink-400">{t('team.login')} <span dir="ltr">{s.mobile_number}</span></p>
                  <p className="text-xs text-ink-500">
                    {t('team.upcoming', { n: upcoming })}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Button variant="gold" size="lg" className="w-full" icon={<Plus className="size-[18px]" />} onClick={() => setEditing('new')}>
        {t('team.add')}
      </Button>

      {editing && <BarberForm stylist={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BarberForm({ stylist, onClose }: { stylist: Stylist | null; onClose: () => void }) {
  const isNew = !stylist;
  // Demo safety: the "Try as Barber" account is locked, and passwords can't be changed
  const locked = DEMO_MODE && stylist?.mobile_number === DEMO_ACCOUNTS.barber.mobile;
  const pwLocked = DEMO_MODE && !isNew;
  const [name, setName] = useState(stylist?.name ?? '');
  const [title, setTitle] = useState(stylist?.title ?? t('client.barber'));
  const [bio, setBio] = useState(stylist?.bio ?? '');
  const [mobile, setMobile] = useState(stylist?.mobile_number ?? '');
  const [active, setActive] = useState(stylist?.active ?? true);
  const [password, setPassword] = useState('');
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const shownPhoto = photo.kind === 'upload' ? preview : photo.kind === 'remove' ? null : stylist?.image ?? null;

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast(t('team.chooseImage'), 'error');
    setPhoto({ kind: 'upload', file });
    setPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    if (locked) return;
    const number = cleanNumber(mobile);
    if (name.trim().length < 2) return setError(t('team.errName'));
    if (digitCount(number) < 3) return setError(t('team.errNumber'));
    if (isNew && password.length < 3) return setError(t('team.errPassword'));
    if (!isNew && password && password.length < 3) return setError(t('team.errPassword'));
    setError('');
    setSaving(true);
    const input = { name: name.trim(), title: title.trim() || t('client.barber'), bio: bio.trim(), mobile_number: number, active };
    try {
      if (isNew) await addStylist(input, password, photo);
      else await updateStylist(stylist.id, input, password, photo);
      toast(isNew ? t('team.added', { name: input.name }) : t('team.saved'));
      onClose();
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!stylist || locked) return;
    const ok = await confirmDialog({
      title: t('team.removeTitle', { name: stylist.name }),
      message: t('team.removeText'),
      confirmText: t('barber.remove'),
      cancelText: t('common.keep'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeStylist(stylist.id);
      toast(t('team.removed', { name: stylist.name }));
      onClose();
    } catch {
      toast(t('team.removeFailed'), 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? t('team.newTitle') : t('team.editTitle')}
      footer={
        locked ? (
          <p className="py-2 text-center text-sm text-ink-300">{t('team.lockedFooter')}</p>
        ) : (
        <div className="flex gap-2.5">
          {!isNew && (
            <Button variant="danger" onClick={remove} icon={<Trash2 className="size-4" />}>
              {t('barber.remove')}
            </Button>
          )}
          <Button variant="gold" className="flex-1" loading={saving} onClick={save}>
            {isNew ? t('team.addBarber') : t('team.saveChanges')}
          </Button>
        </div>
        )
      }
    >
      {locked && (
        <p className="mb-5 flex gap-2.5 rounded-2xl border border-gold-400/25 bg-gold-400/[0.07] px-4 py-3 text-sm text-gold-100">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-gold-300" />
          {t('team.lockedText', { name: stylist?.name ?? '' })}
        </p>
      )}
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-60">
        {/* Photo */}
        <div className="flex items-end gap-4">
          <Portrait name={name || t('team.newTitle')} src={shownPhoto} className="w-[120px] shrink-0 rounded-3xl border border-white/[0.08]" />
          <div className="flex-1 space-y-2">
            {/* A <label> isn't styled by the fieldset's disabled state, so the locked look is set here */}
            <label
              aria-disabled={locked || undefined}
              title={locked ? t('demo.disabled') : undefined}
              className={cx(
                'inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition',
                locked ? 'cursor-not-allowed border border-dashed border-white/10 bg-transparent text-ink-500' : 'cursor-pointer bg-white/[0.06] text-cream hover:bg-white/[0.1]'
              )}
            >
              {locked ? <Lock className="size-4" /> : <Camera className="size-4" />}
              {shownPhoto ? t('team.changePhoto') : t('team.uploadPhoto')}
              <input type="file" accept="image/*" disabled={locked} className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
            {shownPhoto && (
              <button
                type="button"
                onClick={() => {
                  setPhoto({ kind: 'remove' });
                  setPreview(null);
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm text-ink-400 transition enabled:hover:bg-white/[0.04] enabled:hover:text-cream disabled:cursor-not-allowed"
              >
                <ImageOff className="size-4" /> {t('team.removePhoto')}
              </button>
            )}
            <p className="text-[11px] leading-snug text-ink-500">{t('team.photoHint')}</p>
          </div>
        </div>

        <Field label={t('login.fullName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('team.namePlaceholder')} className={inputCls} />
        </Field>
        <Field label={t('team.title')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('team.titlePlaceholder')} className={inputCls} />
        </Field>
        <Field label={t('team.bio')} hint={t('team.bioHint')}>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} placeholder={t('team.bioPlaceholder')} className={textareaCls} />
        </Field>
        <Field label={t('team.loginNumber')}>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" dir="ltr" placeholder={t('team.loginPlaceholder')} className={cx(inputCls, 'tnum text-start')} />
        </Field>
        {pwLocked ? (
          <Field label={t('login.password')}>
            <p className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-ink-300">
              <KeyRound className="size-4 text-ink-400" /> {t('demo.disabled')}
            </p>
          </Field>
        ) : (
          <Field label={isNew ? t('login.password') : t('team.newPassword')} hint={isNew ? t('team.passwordHint') : t('team.passwordKeep')}>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? t('team.passwordMin') : '••••'} className={cx(inputCls, 'ps-10')} />
            </div>
          </Field>
        )}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Toggle checked={active} onChange={setActive} label={t('team.takingBookings')} description={t('team.takingBookingsText')} />
        </div>
      </fieldset>
      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
    </Sheet>
  );
}
