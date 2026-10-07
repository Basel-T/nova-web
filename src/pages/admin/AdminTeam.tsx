// ============================================================
// AdminTeam.tsx — Barbers: photos, profiles, logins & passwords
// ============================================================

import { useEffect, useState } from 'react';
import { Camera, ImageOff, KeyRound, Plus, Trash2, UserPlus } from 'lucide-react';
import type { Stylist } from '../../types';
import {
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
import { cleanNumber } from '../../lib/util';

export default function AdminTeam() {
  useStoreVersion();
  const team = getStylists(true);
  const today = todayStr();
  const [editing, setEditing] = useState<Stylist | 'new' | null>(null);

  return (
    <div className="space-y-4">
      {team.length === 0 ? (
        <Card>
          <EmptyState icon={UserPlus} title="No barbers yet" text="Add your first barber to start taking bookings." />
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
                    <p className="truncate text-[17px] font-medium text-cream">{s.name}</p>
                    <span
                      className={cx(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                        s.active ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.06] text-ink-300'
                      )}
                    >
                      {s.active ? 'Booking' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-[13px] text-gold-300/90">{s.title}</p>
                  <p className="tnum mt-2 text-xs text-ink-400">Login {s.mobile_number}</p>
                  <p className="text-xs text-ink-500">
                    {upcoming} upcoming booking{upcoming === 1 ? '' : 's'}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Button variant="gold" size="lg" className="w-full" icon={<Plus className="size-[18px]" />} onClick={() => setEditing('new')}>
        Add a barber
      </Button>

      {editing && <BarberForm stylist={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BarberForm({ stylist, onClose }: { stylist: Stylist | null; onClose: () => void }) {
  const isNew = !stylist;
  const [name, setName] = useState(stylist?.name ?? '');
  const [title, setTitle] = useState(stylist?.title ?? 'Barber');
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
    if (!file.type.startsWith('image/')) return toast('Please choose an image file', 'error');
    setPhoto({ kind: 'upload', file });
    setPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    const number = cleanNumber(mobile);
    if (name.trim().length < 2) return setError('Enter the barber’s name');
    if (number.length < 3) return setError('Enter a login number — the barber uses it to sign in');
    if (isNew && password.length < 3) return setError('Set a password of at least 3 characters');
    if (!isNew && password && password.length < 3) return setError('Password must be at least 3 characters');
    setError('');
    setSaving(true);
    const input = { name: name.trim(), title: title.trim() || 'Barber', bio: bio.trim(), mobile_number: number, active };
    try {
      if (isNew) await addStylist(input, password, photo);
      else await updateStylist(stylist.id, input, password, photo);
      toast(isNew ? `${input.name} added to the team` : 'Changes saved');
      onClose();
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'That mobile number already belongs to another barber'
          : msg.includes('authorized')
            ? 'Your admin session expired — sign out and in again'
            : `Could not save: ${msg}`
      );
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!stylist) return;
    const ok = await confirmDialog({
      title: `Remove ${stylist.name}?`,
      message: 'They will disappear from the booking app and lose barber access. Past bookings and analytics are kept.',
      confirmText: 'Remove',
      cancelText: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeStylist(stylist.id);
      toast(`${stylist.name} removed`);
      onClose();
    } catch {
      toast('Could not remove — please try again', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'New barber' : 'Edit barber'}
      footer={
        <div className="flex gap-2.5">
          {!isNew && (
            <Button variant="danger" onClick={remove} icon={<Trash2 className="size-4" />}>
              Remove
            </Button>
          )}
          <Button variant="gold" className="flex-1" loading={saving} onClick={save}>
            {isNew ? 'Add barber' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Photo */}
        <div className="flex items-end gap-4">
          <Portrait name={name || 'New barber'} src={shownPhoto} className="w-[120px] shrink-0 rounded-3xl border border-white/[0.08]" />
          <div className="flex-1 space-y-2">
            <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/[0.06] text-sm font-medium text-cream transition hover:bg-white/[0.1]">
              <Camera className="size-4" />
              {shownPhoto ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
            {shownPhoto && (
              <button
                type="button"
                onClick={() => {
                  setPhoto({ kind: 'remove' });
                  setPreview(null);
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm text-ink-400 transition hover:bg-white/[0.04] hover:text-cream"
              >
                <ImageOff className="size-4" /> Remove photo
              </button>
            )}
            <p className="text-[11px] leading-snug text-ink-500">Portrait photos work best — it’s cropped to 4:5 automatically.</p>
          </div>
        </div>

        <Field label="Full name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marcus Cole" className={inputCls} />
        </Field>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fade Specialist" className={inputCls} />
        </Field>
        <Field label="Bio" hint="Shown to clients when they choose a barber.">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} placeholder="Specialities, experience…" className={textareaCls} />
        </Field>
        <Field label="Login number">
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" placeholder="e.g. 444" className={cx(inputCls, 'tnum')} />
        </Field>
        <Field label={isNew ? 'Password' : 'New password'} hint={isNew ? 'The barber signs in with their number and this password.' : 'Leave empty to keep the current password.'}>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? 'At least 3 characters' : '••••'} className={cx(inputCls, 'pl-10')} />
          </div>
        </Field>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Toggle checked={active} onChange={setActive} label="Taking bookings" description="Turn off to hide this barber from clients (e.g. holiday)." />
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>
    </Sheet>
  );
}
