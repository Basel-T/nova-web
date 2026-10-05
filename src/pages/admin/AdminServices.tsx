// ============================================================
// AdminServices.tsx — Service menu: prices & exact durations
// ============================================================

import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, EyeOff, Minus, Plus, Scissors, Trash2 } from 'lucide-react';
import type { Service } from '../../types';
import { deleteService, formatPrice, getServices, getSettings, moveService, saveService, useStoreVersion } from '../../store';
import { Button, Card, EmptyState, Field, IconButton, Sheet, Toggle, confirmDialog, cx, inputCls, textareaCls, toast } from '../../ui';
import { formatDuration } from '../../lib/time';

type Draft = Omit<Service, 'id'> & { id?: string };

const EMPTY: Draft = { name: '', description: '', price: 25, duration_min: 30, icon: '✂️', active: true, sort: 99 };

export default function AdminServices() {
  useStoreVersion();
  const services = getServices(true);
  const [editing, setEditing] = useState<Draft | null>(null);

  const move = async (id: string, dir: -1 | 1) => {
    try {
      await moveService(id, dir);
    } catch {
      toast('Could not reorder', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {services.length === 0 ? (
        <Card>
          <EmptyState icon={Scissors} title="No services yet" text="Add what you offer so clients can book it." />
        </Card>
      ) : (
        <Card className="divide-y divide-white/[0.05] overflow-hidden">
          {services.map((s, i) => (
            <div key={s.id} className={cx('flex items-center gap-2 py-2 pl-2 pr-4', !s.active && 'opacity-60')}>
              <div className="flex flex-col">
                <IconButton label="Move up" disabled={i === 0} onClick={() => move(s.id, -1)} className="size-8">
                  <ChevronUp className="size-4" />
                </IconButton>
                <IconButton label="Move down" disabled={i === services.length - 1} onClick={() => move(s.id, 1)} className="size-8">
                  <ChevronDown className="size-4" />
                </IconButton>
              </div>
              <button onClick={() => setEditing({ ...s })} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-cream">{s.name}</span>
                    {!s.active && <EyeOff className="size-3.5 shrink-0 text-ink-400" />}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-400">
                    <Clock className="size-3.5" /> {formatDuration(s.duration_min)}
                    {!s.active && <span className="text-ink-500">· hidden</span>}
                  </span>
                </span>
                <span className="tnum font-display text-[22px] text-cream">{formatPrice(s.price)}</span>
              </button>
            </div>
          ))}
        </Card>
      )}

      <Button variant="gold" size="lg" className="w-full" icon={<Plus className="size-[18px]" />} onClick={() => setEditing({ ...EMPTY, sort: services.length + 1 })}>
        Add a service
      </Button>

      {editing && <ServiceForm draft={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceForm({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [priceText, setPriceText] = useState(String(draft.price));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currency = getSettings().currency;
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const save = async () => {
    const price = Number(priceText.replace(',', '.'));
    if (d.name.trim().length < 2) return setError('Give the service a name');
    if (!Number.isFinite(price) || price < 0) return setError('Enter a valid price');
    if (d.duration_min < 5 || d.duration_min > 600) return setError('Duration must be between 5 minutes and 10 hours');
    setSaving(true);
    try {
      await saveService({ ...d, name: d.name.trim(), description: d.description.trim(), price });
      toast(d.id ? 'Service updated' : 'Service added');
      onClose();
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!d.id) return;
    const ok = await confirmDialog({
      title: `Delete “${d.name}”?`,
      message: 'Clients won’t be able to book it any more. Past bookings and analytics keep their records.',
      confirmText: 'Delete',
      cancelText: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteService(d.id);
      toast('Service deleted');
      onClose();
    } catch {
      toast('Could not delete', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={d.id ? 'Edit service' : 'New service'}
      footer={
        <div className="flex gap-2.5">
          {d.id && (
            <Button variant="danger" onClick={remove} icon={<Trash2 className="size-4" />}>
              Delete
            </Button>
          )}
          <Button variant="gold" className="flex-1" loading={saving} onClick={save}>
            {d.id ? 'Save changes' : 'Add service'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Name">
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Skin Fade" className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea value={d.description} onChange={(e) => set({ description: e.target.value })} maxLength={160} placeholder="What's included" className={textareaCls} />
        </Field>
        <Field label="Price">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400">{currency}</span>
            <input
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              inputMode="decimal"
              className={cx(inputCls, 'tnum', currency.length > 1 ? 'pl-14' : 'pl-9')}
            />
          </div>
        </Field>
        <DurationPicker value={d.duration_min} onChange={(m) => set({ duration_min: m })} />
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Toggle checked={d.active} onChange={(v) => set({ active: v })} label="Visible to clients" description="Hidden services stay in your records." />
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>
    </Sheet>
  );
}

const PRESETS = [10, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120];

/** Any duration: exact hours + minutes, ±5 buttons and quick presets */
function DurationPicker({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const clamp = (m: number) => Math.max(5, Math.min(600, Math.round(m)));
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Duration</span>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-3">
          <IconButton label="5 minutes less" onClick={() => onChange(clamp(value - 5))} className="border border-white/10">
            <Minus className="size-4" />
          </IconButton>
          <div className="text-center">
            <p className="tnum font-display text-[40px] leading-none text-cream">{formatDuration(value)}</p>
            <p className="mt-1 text-xs text-ink-500">{value} minutes</p>
          </div>
          <IconButton label="5 minutes more" onClick={() => onChange(clamp(value + 5))} className="border border-white/10">
            <Plus className="size-4" />
          </IconButton>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-500">Hours</span>
            <input
              type="number"
              min={0}
              max={10}
              inputMode="numeric"
              value={hours}
              onChange={(e) => onChange(clamp(Math.max(0, Number(e.target.value) || 0) * 60 + minutes))}
              className={cx(inputCls, 'tnum h-11 text-center')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-500">Minutes</span>
            <input
              type="number"
              min={0}
              max={59}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => onChange(clamp(hours * 60 + Math.min(59, Math.max(0, Number(e.target.value) || 0))))}
              className={cx(inputCls, 'tnum h-11 text-center')}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={cx(
                'tnum h-8 rounded-full border px-3 text-[12.5px] transition',
                value === m ? 'border-gold-400/50 bg-gold-400/10 text-gold-200' : 'border-white/[0.08] text-ink-300 hover:text-cream'
              )}
            >
              {formatDuration(m)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
