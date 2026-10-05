// ============================================================
// AdminPanel.tsx — Shop Owner Dashboard
// ============================================================
// Three tabs:
//   1. Bookings — stats, revenue, filters, change any booking's status
//   2. Barbers  — add / remove barbers (they log in with their number)
//   3. Services — add, edit prices/durations, hide or delete services
// ============================================================

import { useState } from 'react';
import { Appointment, Service } from '../types';
import {
  getAppointments,
  getStylists,
  getServices,
  getUserById,
  getStylistById,
  getUsers,
  updateAppointmentStatus,
  addStylist,
  removeStylist,
  saveService,
  deleteService,
  formatShortDate,
  formatPrice,
  todayStr,
  logout,
  useStoreVersion,
} from '../store';
import { Avatar, LogoutButton, StatusBadge, TopBar, btnPrimary, inputClass } from '../components';

interface Props {
  onLogout: () => void;
}

type Tab = 'bookings' | 'barbers' | 'services';

export default function AdminPanel({ onLogout }: Props) {
  useStoreVersion(); // live updates
  const [tab, setTab] = useState<Tab>('bookings');
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(msg.includes('duplicate') ? 'That mobile number is already used by another barber.' : 'Could not save — please try again.');
    }
  };

  const handleLogout = () => {
    logout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-stone-100 pb-10">
      <TopBar title="Admin 👑" subtitle="Blade & Fade · Shop overview" wide right={<LogoutButton onClick={handleLogout} />} />

      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-2xl p-1.5 flex shadow-sm mt-4 border border-stone-200">
          {(['bookings', 'barbers', 'services'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all ${
                tab === t ? 'bg-neutral-900 text-white shadow-md' : 'text-neutral-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

        {tab === 'bookings' && <BookingsTab run={run} />}
        {tab === 'barbers' && <BarbersTab run={run} />}
        {tab === 'services' && <ServicesTab run={run} />}
      </div>
    </div>
  );
}

type Run = (fn: () => Promise<void>) => Promise<void>;

// ============================================================
// BOOKINGS TAB
// ============================================================
function BookingsTab({ run }: { run: Run }) {
  const [filterStylist, setFilterStylist] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWhen, setFilterWhen] = useState<'upcoming' | 'today' | 'past' | 'all'>('upcoming');

  const today = todayStr();
  const all = getAppointments();
  const stylists = getStylists();

  const count = (s: Appointment['status']) => all.filter((a) => a.status === s).length;
  const revenue = all.filter((a) => a.status === 'completed').reduce((sum, a) => sum + a.price, 0);
  const todayCount = all.filter((a) => a.date === today && a.status !== 'cancelled').length;
  const clientCount = getUsers().filter((u) => u.role === 'client').length;

  const list = all
    .filter((a) => filterStylist === 'all' || a.stylist_id === filterStylist)
    .filter((a) => filterStatus === 'all' || a.status === filterStatus)
    .filter((a) =>
      filterWhen === 'all' ? true : filterWhen === 'today' ? a.date === today : filterWhen === 'upcoming' ? a.date >= today : a.date < today
    )
    .sort((a, b) =>
      filterWhen === 'past' || filterWhen === 'all'
        ? b.date.localeCompare(a.date) || b.time.localeCompare(a.time)
        : a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
    );

  const selectClass =
    'px-3 py-2.5 rounded-xl border border-stone-300 bg-white text-neutral-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500';

  return (
    <div className="mt-4">
      {/* Headline stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-2.5">
        <Stat label="Revenue" value={formatPrice(revenue)} dark />
        <Stat label="Today" value={todayCount} />
        <Stat label="Clients" value={clientCount} />
      </div>
      <div className="grid grid-cols-4 gap-2.5 mb-5">
        <Stat label="Pending" value={count('pending')} color="text-amber-600" small />
        <Stat label="Confirmed" value={count('booked')} color="text-emerald-600" small />
        <Stat label="Done" value={count('completed')} color="text-sky-600" small />
        <Stat label="Cancelled" value={count('cancelled')} color="text-red-500" small />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <select value={filterWhen} onChange={(e) => setFilterWhen(e.target.value as typeof filterWhen)} className={selectClass}>
          <option value="upcoming">Upcoming</option>
          <option value="today">Today</option>
          <option value="past">Past</option>
          <option value="all">All dates</option>
        </select>
        <select value={filterStylist} onChange={(e) => setFilterStylist(e.target.value)} className={selectClass}>
          <option value="all">All barbers</option>
          {stylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="booked">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-stone-200">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-neutral-500 font-medium">No bookings found</p>
          <p className="text-neutral-400 text-sm mt-1">Try changing the filters above</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((appt) => {
            const client = getUserById(appt.user_id);
            const barber = getStylistById(appt.stylist_id);
            return (
              <div key={appt.id} className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">{client?.full_name || 'Unknown Client'}</p>
                    <p className="text-xs text-neutral-500">
                      with <span className="font-semibold text-neutral-800">{barber?.name || 'Removed barber'}</span>
                    </p>
                  </div>
                  <StatusBadge status={appt.status} />
                </div>
                <div className="text-sm text-neutral-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span>📅 {formatShortDate(appt.date)}</span>
                  <span>🕐 {appt.time}</span>
                  <span>✂️ {appt.service_name}</span>
                  <span className="font-semibold">{formatPrice(appt.price)}</span>
                  {client && (
                    <a href={`tel:${client.mobile_number}`} className="text-sky-600">
                      📱 {client.mobile_number}
                    </a>
                  )}
                </div>
                {(appt.status === 'pending' || appt.status === 'booked') && (
                  <div className="flex gap-2 mt-3">
                    {appt.status === 'pending' && (
                      <button
                        onClick={() => run(() => updateAppointmentStatus(appt.id, 'booked'))}
                        className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold"
                      >
                        Confirm
                      </button>
                    )}
                    {appt.status === 'booked' && (
                      <button
                        onClick={() => run(() => updateAppointmentStatus(appt.id, 'completed'))}
                        className="flex-1 py-2 bg-sky-50 text-sky-700 rounded-xl text-xs font-semibold"
                      >
                        Mark Done
                      </button>
                    )}
                    <button
                      onClick={() => confirm('Cancel this booking?') && run(() => updateAppointmentStatus(appt.id, 'cancelled'))}
                      className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-center text-xs text-neutral-400 mt-5">
        Showing {list.length} booking{list.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  color = 'text-neutral-900',
  dark = false,
  small = false,
}: {
  label: string;
  value: string | number;
  color?: string;
  dark?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-3 text-center ${dark ? 'bg-neutral-900' : 'bg-white border border-stone-200'}`}>
      <p className={`font-display font-semibold ${small ? 'text-xl' : 'text-2xl'} ${dark ? 'text-amber-400' : color}`}>{value}</p>
      <p className="text-[10px] text-neutral-400 mt-0.5 font-semibold uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ============================================================
// BARBERS TAB
// ============================================================
function BarbersTab({ run }: { run: Run }) {
  const stylists = getStylists();
  const today = todayStr();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [title, setTitle] = useState('Barber');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const number = mobile.replace(/\D/g, '');
    if (name.trim().length < 2 || number.length < 7) {
      alert('Please enter a name and a valid mobile number.');
      return;
    }
    setSaving(true);
    await run(async () => {
      await addStylist(name.trim(), number, title.trim() || 'Barber');
      setName('');
      setMobile('');
      setTitle('Barber');
    });
    setSaving(false);
  };

  return (
    <div className="mt-4 space-y-3">
      {stylists.map((s) => {
        const upcoming = getAppointments().filter(
          (a) => a.stylist_id === s.id && a.date >= today && (a.status === 'pending' || a.status === 'booked')
        ).length;
        return (
          <div key={s.id} className="bg-white rounded-2xl p-4 border border-stone-200 flex items-center gap-3">
            <Avatar stylist={s} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-neutral-900 truncate">{s.name}</p>
              <p className="text-xs text-neutral-500">{s.title}</p>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                Login: {s.mobile_number} · {upcoming} upcoming
              </p>
            </div>
            <button
              onClick={() =>
                confirm(`Remove ${s.name}? Their login will become a normal customer account.`) && run(() => removeStylist(s.id))
              }
              className="text-xs text-red-500 font-semibold px-3 py-2 rounded-xl hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        );
      })}

      <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-stone-300">
        <h3 className="font-semibold text-neutral-800 mb-3">➕ Add a barber</h3>
        <div className="space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} />
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="Mobile number (used to log in)"
            type="tel"
            inputMode="tel"
            className={inputClass}
          />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Fade Specialist" className={inputClass} />
          <button onClick={handleAdd} disabled={saving} className={`${btnPrimary} w-full py-3.5`}>
            {saving ? 'Adding…' : 'Add Barber'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SERVICES TAB
// ============================================================
const EMPTY_SERVICE: Omit<Service, 'id'> = {
  name: '',
  description: '',
  price: 20,
  duration_min: 30,
  icon: '✂️',
  active: true,
  sort: 99,
};

function ServicesTab({ run }: { run: Run }) {
  const services = getServices(true);
  const [editing, setEditing] = useState<(Omit<Service, 'id'> & { id?: string }) | null>(null);

  const handleSave = async () => {
    if (!editing || editing.name.trim().length < 2) {
      alert('Please enter a service name.');
      return;
    }
    const toSave = { ...editing, name: editing.name.trim(), price: Number(editing.price) || 0 };
    setEditing(null);
    await run(() => saveService(toSave));
  };

  return (
    <div className="mt-4 space-y-2.5">
      {services.map((s) => (
        <div
          key={s.id}
          className={`bg-white rounded-2xl p-4 border border-stone-200 flex items-center gap-3 ${s.active ? '' : 'opacity-60'}`}
        >
          <div className="w-11 h-11 rounded-xl bg-neutral-900 flex items-center justify-center text-xl shrink-0">{s.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-neutral-900 truncate">
              {s.name} {!s.active && <span className="text-xs text-neutral-400">(hidden)</span>}
            </p>
            <p className="text-xs text-neutral-500">
              {formatPrice(s.price)} · {s.duration_min} min
            </p>
          </div>
          <button onClick={() => setEditing({ ...s })} className="text-xs font-semibold text-neutral-700 px-3 py-2 rounded-xl hover:bg-stone-100">
            Edit
          </button>
        </div>
      ))}

      <button
        onClick={() => setEditing({ ...EMPTY_SERVICE, sort: services.length + 1 })}
        className="w-full py-3.5 rounded-2xl border-2 border-dashed border-stone-300 text-neutral-600 font-semibold text-sm hover:bg-white"
      >
        ➕ Add a service
      </button>

      {/* Edit sheet */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-[slideUp_0.3s_ease-out] max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-neutral-900 mb-4">
              {editing.id ? 'Edit Service' : 'New Service'}
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={editing.icon}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                  className={`${inputClass} w-16 text-center text-xl px-2`}
                  aria-label="Icon"
                />
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Service name"
                  className={inputClass}
                />
              </div>
              <textarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Short description"
                rows={2}
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-neutral-500 font-medium">
                  Price ($)
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={editing.price}
                    onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="text-xs text-neutral-500 font-medium">
                  Duration
                  <select
                    value={editing.duration_min}
                    onChange={(e) => setEditing({ ...editing, duration_min: Number(e.target.value) })}
                    className={`${inputClass} mt-1`}
                  >
                    {[30, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  className="w-4 h-4 accent-amber-500"
                />
                Visible to customers
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              {editing.id && (
                <button
                  onClick={() => {
                    if (confirm('Delete this service?')) {
                      const id = editing.id!;
                      setEditing(null);
                      run(() => deleteService(id));
                    }
                  }}
                  className="py-3 px-4 text-red-500 font-semibold text-sm rounded-2xl hover:bg-red-50"
                >
                  Delete
                </button>
              )}
              <button onClick={() => setEditing(null)} className="flex-1 py-3 border-2 border-stone-200 text-neutral-500 rounded-2xl font-semibold text-sm">
                Cancel
              </button>
              <button onClick={handleSave} className={`${btnPrimary} flex-1 py-3 text-sm`}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
