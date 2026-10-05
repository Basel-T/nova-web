// ============================================================
// Dashboard.tsx — Client Home Page
// ============================================================
// What the client sees after logging in:
//   1. "Welcome, [First Name]" + days since last cut
//   2. Upcoming appointment card (with cancel) OR big "Book" button
//   3. Their visit history
//   4. Shop info (hours, location)
// ============================================================

import { useState } from 'react';
import { User } from '../types';
import {
  getDaysSinceLastAppointment,
  getUserActiveFutureBooking,
  getUserAppointments,
  updateAppointmentStatus,
  getStylistById,
  formatLongDate,
  formatShortDate,
  formatPrice,
  todayStr,
  logout,
  useStoreVersion,
} from '../store';
import { Avatar, LogoutButton, StatusBadge, TopBar, btnGold } from '../components';

interface Props {
  user: User;
  onBook: () => void;
  onLogout: () => void;
}

export default function Dashboard({ user, onBook, onLogout }: Props) {
  useStoreVersion(); // live updates (e.g. barber accepts the booking)
  const [cancelling, setCancelling] = useState(false);

  const activeBooking = getUserActiveFutureBooking(user.id);
  const daysSince = getDaysSinceLastAppointment(user.id);
  const today = todayStr();
  const history = getUserAppointments(user.id).filter(
    (a) => a.id !== activeBooking?.id && (a.date < today || a.status === 'completed' || a.status === 'cancelled')
  );
  const firstName = user.full_name.split(' ')[0];
  const barber = activeBooking ? getStylistById(activeBooking.stylist_id) : undefined;

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    setCancelling(true);
    try {
      await updateAppointmentStatus(id, 'cancelled');
    } catch {
      alert('Could not cancel. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const handleLogout = () => {
    logout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-stone-100">
      <TopBar title="Blade & Fade" subtitle="Barbershop" right={<LogoutButton onClick={handleLogout} />} />

      <div className="max-w-lg mx-auto px-4 py-7">
        {/* Welcome */}
        <div className="mb-7">
          <h2 className="font-display text-3xl font-semibold text-neutral-900 uppercase tracking-wide">
            Welcome, {firstName}
          </h2>
          <p className="text-neutral-500 mt-1">
            {daysSince !== null
              ? `${daysSince} day${daysSince !== 1 ? 's' : ''} since your last cut${daysSince >= 21 ? ' — time for a fresh one? 💈' : ''}`
              : 'Ready for your first fresh cut? 💈'}
          </p>
        </div>

        {/* Upcoming appointment */}
        {activeBooking ? (
          <div className="bg-white rounded-3xl shadow-md p-5 mb-4 border border-stone-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-800">Upcoming Appointment</h3>
              <StatusBadge status={activeBooking.status} />
            </div>

            <div className="flex items-center gap-3 mb-4">
              <Avatar stylist={barber} size="md" />
              <div>
                <p className="font-semibold text-neutral-900">{barber?.name || 'Your barber'}</p>
                <p className="text-xs text-neutral-500">{barber?.title}</p>
              </div>
            </div>

            <div className="bg-stone-50 rounded-2xl p-4 space-y-2 text-sm text-neutral-700">
              <p>✂️ <span className="font-semibold">{activeBooking.service_name}</span> · {formatPrice(activeBooking.price)}</p>
              <p>📅 <span className="font-semibold">{formatLongDate(activeBooking.date)}</span></p>
              <p>🕐 <span className="font-semibold">{activeBooking.time}</span> · {activeBooking.duration_min} min</p>
            </div>

            {activeBooking.status === 'pending' && (
              <p className="text-xs text-amber-700 mt-3">Waiting for your barber to confirm. This page updates automatically.</p>
            )}

            <button
              onClick={() => handleCancel(activeBooking.id)}
              disabled={cancelling}
              className="mt-4 w-full py-3 border-2 border-red-200 text-red-500 rounded-2xl
                         hover:bg-red-50 transition-all text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel Appointment'}
            </button>
            <p className="text-center text-xs text-neutral-400 mt-3">
              You can hold one upcoming booking at a time.
            </p>
          </div>
        ) : (
          <button onClick={onBook} className={`${btnGold} w-full py-6 text-xl font-display uppercase tracking-wider rounded-3xl`}>
            Book an Appointment ✂️
          </button>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">Your visits</h3>
            <div className="space-y-2">
              {history.slice(0, 8).map((a) => (
                <div key={a.id} className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between border border-stone-200">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-800 text-sm truncate">{a.service_name}</p>
                    <p className="text-xs text-neutral-400">
                      {formatShortDate(a.date)} · {getStylistById(a.stylist_id)?.name || 'Barber'}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shop info */}
        <div className="mt-10 grid grid-cols-2 gap-3">
          <div className="bg-neutral-900 text-white rounded-2xl p-4 text-center">
            <p className="text-2xl mb-1">⏰</p>
            <p className="text-xs text-neutral-400 font-medium">Open Daily</p>
            <p className="text-sm font-semibold mt-0.5">10:00 – 20:00</p>
          </div>
          <div className="bg-neutral-900 text-white rounded-2xl p-4 text-center">
            <p className="text-2xl mb-1">📍</p>
            <p className="text-xs text-neutral-400 font-medium">Location</p>
            <p className="text-sm font-semibold mt-0.5">12 Main Street</p>
          </div>
        </div>
      </div>
    </div>
  );
}
