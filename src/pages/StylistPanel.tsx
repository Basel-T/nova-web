// ============================================================
// StylistPanel.tsx — Barber Dashboard
// ============================================================
// Features:
//   1. Today's stats: clients, pending requests, expected earnings
//   2. Appointments: Requests (pending) / Today / Upcoming
//   3. Accept or reject requests, mark visits completed
//   4. Schedule tab: block/unblock single slots or whole days
// Everything updates live when clients book or cancel.
// ============================================================

import { useState } from 'react';
import { User, Appointment } from '../types';
import {
  getStylistByMobile,
  getAppointmentsForStylist,
  updateAppointmentStatus,
  getUserById,
  generateDates,
  TIME_SLOTS,
  isSlotBlocked,
  isDayBlocked,
  blockSlot,
  unblockSlot,
  unblockDay,
  logout,
  getBookedSlotsForStylist,
  formatShortDate,
  formatPrice,
  todayStr,
  useStoreVersion,
} from '../store';
import { Avatar, LogoutButton, StatusBadge, TopBar } from '../components';

interface Props {
  user: User;
  onLogout: () => void;
}

type ApptFilter = 'requests' | 'today' | 'upcoming';

export default function StylistPanel({ user, onLogout }: Props) {
  useStoreVersion(); // live updates when clients book/cancel
  const stylist = getStylistByMobile(user.mobile_number);

  const [activeTab, setActiveTab] = useState<'appointments' | 'schedule'>('appointments');
  const [filter, setFilter] = useState<ApptFilter>('today');
  const [dates] = useState(() => generateDates(30));
  const [selectedDate, setSelectedDate] = useState(dates[0].date);
  const [error, setError] = useState('');

  const today = todayStr();

  /** Run a cloud write and show a friendly message if it fails */
  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch {
      setError('Could not save — check your connection and try again.');
    }
  };

  const handleLogout = () => {
    logout();
    onLogout();
  };

  if (!stylist) {
    return (
      <div className="min-h-screen bg-stone-100">
        <TopBar title="Barber Panel" right={<LogoutButton onClick={handleLogout} />} />
        <p className="text-center text-neutral-500 mt-10 px-6">
          Your barber profile was not found. Ask the shop admin to add you.
        </p>
      </div>
    );
  }

  // --- Derived data ---
  const all = getAppointmentsForStylist(stylist.id);
  const byTime = (a: Appointment, b: Appointment) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
  const requests = all.filter((a) => a.status === 'pending' && a.date >= today).sort(byTime);
  const todays = all.filter((a) => a.date === today && a.status !== 'cancelled').sort(byTime);
  const upcoming = all.filter((a) => a.date > today && (a.status === 'pending' || a.status === 'booked')).sort(byTime);
  const shown = filter === 'requests' ? requests : filter === 'today' ? todays : upcoming;

  const todayEarnings = todays
    .filter((a) => a.status === 'booked' || a.status === 'completed')
    .reduce((sum, a) => sum + a.price, 0);

  // --- Schedule actions ---
  const dayBlocked = isDayBlocked(stylist.id, selectedDate);
  const bookedSlots = getBookedSlotsForStylist(stylist.id, selectedDate);

  const toggleSlotBlock = (time: string) =>
    run(() =>
      isSlotBlocked(stylist.id, selectedDate, time)
        ? unblockSlot(stylist.id, selectedDate, time)
        : blockSlot(stylist.id, selectedDate, time)
    );

  const toggleDayBlock = () =>
    run(() => (dayBlocked ? unblockDay(stylist.id, selectedDate) : blockSlot(stylist.id, selectedDate, null)));

  return (
    <div className="min-h-screen bg-stone-100 pb-10">
      <TopBar
        title={`Hi, ${user.full_name.split(' ')[0]} ✂️`}
        subtitle={`Barber Panel · ${stylist.title}`}
        right={<LogoutButton onClick={handleLogout} />}
      />

      <div className="max-w-lg mx-auto px-4">
        {/* Today stats */}
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          <div className="bg-white rounded-2xl p-3 text-center border border-stone-200">
            <p className="font-display text-2xl font-semibold text-neutral-900">{todays.length}</p>
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">Today</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center border border-stone-200">
            <p className="font-display text-2xl font-semibold text-amber-600">{requests.length}</p>
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">Requests</p>
          </div>
          <div className="bg-neutral-900 rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-semibold text-amber-400">{formatPrice(todayEarnings)}</p>
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">Today $</p>
          </div>
        </div>

        {/* Pending banner */}
        {requests.length > 0 && activeTab === 'appointments' && filter !== 'requests' && (
          <button
            onClick={() => setFilter('requests')}
            className="w-full mt-3 bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-center gap-3 text-left"
          >
            <span className="text-2xl">🔔</span>
            <span className="text-amber-800 font-semibold text-sm flex-1">
              {requests.length} booking request{requests.length > 1 ? 's' : ''} waiting for you
            </span>
            <span className="text-amber-700 text-sm">View ›</span>
          </button>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl p-1.5 flex shadow-sm mt-4 border border-stone-200">
          {(['appointments', 'schedule'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab ? 'bg-neutral-900 text-white shadow-md' : 'text-neutral-500'
              }`}
            >
              {tab === 'appointments' ? 'Appointments' : 'My Schedule'}
            </button>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

        {activeTab === 'appointments' ? (
          <div className="mt-4">
            {/* Filter chips */}
            <div className="flex gap-2 mb-4">
              {([
                ['today', `Today (${todays.length})`],
                ['requests', `Requests (${requests.length})`],
                ['upcoming', `Upcoming (${upcoming.length})`],
              ] as [ApptFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                    filter === key ? 'bg-amber-500 text-neutral-950' : 'bg-white text-neutral-500 border border-stone-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-stone-200">
                <div className="text-5xl mb-3">{filter === 'requests' ? '✅' : '☕'}</div>
                <p className="text-neutral-500 font-medium">
                  {filter === 'requests'
                    ? 'No pending requests'
                    : filter === 'today'
                    ? 'No appointments today'
                    : 'No upcoming appointments'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {shown.map((appt) => {
                  const client = getUserById(appt.user_id);
                  return (
                    <div key={appt.id} className="bg-white rounded-2xl shadow-sm p-4 border border-stone-200">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900 truncate">{client?.full_name || 'Unknown Client'}</p>
                          {client && (
                            <a href={`tel:${client.mobile_number}`} className="text-xs text-sky-600">
                              📱 {client.mobile_number}
                            </a>
                          )}
                        </div>
                        <StatusBadge status={appt.status} />
                      </div>

                      <div className="text-sm text-neutral-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="font-semibold text-neutral-900">🕐 {appt.time}</span>
                        {appt.date !== today && <span>📅 {formatShortDate(appt.date)}</span>}
                        <span>✂️ {appt.service_name}</span>
                        <span>
                          {formatPrice(appt.price)} · {appt.duration_min}m
                        </span>
                      </div>

                      {appt.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => run(() => updateAppointmentStatus(appt.id, 'booked'))}
                            className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 active:scale-[0.98]"
                          >
                            ✓ Accept
                          </button>
                          <button
                            onClick={() => run(() => updateAppointmentStatus(appt.id, 'cancelled'))}
                            className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 active:scale-[0.98]"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      )}

                      {appt.status === 'booked' && appt.date <= today && (
                        <button
                          onClick={() => run(() => updateAppointmentStatus(appt.id, 'completed'))}
                          className="w-full mt-3 py-2.5 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 active:scale-[0.98]"
                        >
                          Mark Completed ✓
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ===== Schedule tab ===== */
          <div className="mt-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar stylist={stylist} size="sm" />
              <p className="text-sm text-neutral-500">Tap a time to block it (break, lunch…). Tap again to reopen.</p>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-3 mb-3 scrollbar-hide -mx-4 px-4">
              {dates.map((d) => {
                const isSelected = selectedDate === d.date;
                const off = isDayBlocked(stylist.id, d.date);
                return (
                  <button
                    key={d.date}
                    onClick={() => setSelectedDate(d.date)}
                    className={`flex-shrink-0 w-[60px] py-2 rounded-xl text-center text-xs transition-all ${
                      isSelected
                        ? 'bg-neutral-900 text-white shadow-md scale-105'
                        : off
                        ? 'bg-red-50 text-red-400 border border-red-200'
                        : 'bg-white text-neutral-600 border border-stone-200'
                    }`}
                  >
                    <div className={`font-semibold ${isSelected ? 'text-amber-400' : ''}`}>{d.isToday ? 'Today' : d.dayName}</div>
                    <div className="text-lg font-bold">{d.dayNum}</div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={toggleDayBlock}
              className={`w-full mb-4 py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] ${
                dayBlocked ? 'bg-red-100 text-red-700 ring-2 ring-red-200' : 'bg-white text-neutral-700 border border-stone-300'
              }`}
            >
              {dayBlocked ? '🔓 Reopen This Day' : '🔒 Take This Day Off'}
            </button>

            {!dayBlocked && (
              <div className="grid grid-cols-2 gap-2.5">
                {TIME_SLOTS.map((time) => {
                  const blocked = isSlotBlocked(stylist.id, selectedDate, time);
                  const booked = bookedSlots.includes(time);
                  return (
                    <button
                      key={time}
                      onClick={() => !booked && toggleSlotBlock(time)}
                      disabled={booked}
                      className={`py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] ${
                        booked
                          ? 'bg-sky-100 text-sky-700 cursor-not-allowed'
                          : blocked
                          ? 'bg-red-100 text-red-600 ring-1 ring-red-200'
                          : 'bg-white text-neutral-700 border border-stone-200'
                      }`}
                    >
                      {time} {booked ? '· Booked' : blocked ? '· Blocked' : '· Open'}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex gap-4 justify-center text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-white border border-stone-300 inline-block" /> Open
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-100 inline-block" /> Blocked
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-sky-100 inline-block" /> Booked
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
