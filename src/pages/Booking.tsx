// ============================================================
// Booking.tsx — Step 3 of booking: pick date & time
// ============================================================
// Layout:
//   Top: selected barber + service
//   Middle: horizontally scrollable dates (30 days from today)
//   Bottom: grid of start times
//
// Logic:
//   - A start time is available only if every 30-min slot the service
//     needs is free (60-min services need two in a row)
//   - Past times, booked and blocked slots are greyed out
//   - Live: if someone else books a slot, it greys out here too
// ============================================================

import { useState } from 'react';
import { User } from '../types';
import {
  getStylistById,
  getServiceById,
  generateDates,
  TIME_SLOTS,
  canStartAt,
  isDayBlocked,
  getUserActiveFutureBooking,
  addAppointment,
  formatLongDate,
  formatPrice,
  useStoreVersion,
} from '../store';
import { Avatar, TopBar, btnGold } from '../components';

interface Props {
  user: User;
  stylistId: string;
  serviceId: string;
  onBack: () => void;
  onBooked: () => void;
}

export default function Booking({ user, stylistId, serviceId, onBack, onBooked }: Props) {
  useStoreVersion(); // live availability
  const stylist = getStylistById(stylistId);
  const service = getServiceById(serviceId);
  const [dates] = useState(() => generateDates(30));

  const [selectedDate, setSelectedDate] = useState(dates[0].date);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasActiveBooking = !!getUserActiveFutureBooking(user.id);
  const dayBlocked = isDayBlocked(stylistId, selectedDate);
  const duration = service?.duration_min ?? 30;
  const availableTimes = TIME_SLOTS.filter((t) => canStartAt(stylistId, selectedDate, t, duration));

  const confirmBooking = async () => {
    if (!showConfirm) return;
    setBusy(true);
    setError('');
    try {
      await addAppointment(user.id, stylistId, serviceId, selectedDate, showConfirm);
      setShowConfirm(null);
      onBooked();
    } catch (e) {
      setError(
        (e as Error).message === 'SLOT_TAKEN'
          ? 'Sorry — someone just grabbed that time. Please pick another.'
          : 'Could not book. Check your connection and try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (!stylist || !service) {
    return (
      <div className="min-h-screen bg-stone-100">
        <TopBar title="Booking" onBack={onBack} />
        <p className="text-center text-neutral-500 mt-10">This barber or service is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 pb-10">
      <TopBar title="Pick a Time" subtitle="Step 3 of 3" onBack={onBack} />

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Summary */}
        <div className="bg-white rounded-2xl p-3 flex items-center gap-3 border border-stone-200 mb-6">
          <Avatar stylist={stylist} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-neutral-900 truncate">{stylist.name}</p>
            <p className="text-xs text-neutral-500 truncate">
              {service.name} · {service.duration_min} min
            </p>
          </div>
          <span className="font-display text-lg text-neutral-900">{formatPrice(service.price)}</span>
        </div>

        {/* Date scroller */}
        <h3 className="text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-widest">📅 Select Date</h3>
        <div className="flex gap-2.5 overflow-x-auto pb-3 mb-4 scrollbar-hide -mx-4 px-4">
          {dates.map((d) => {
            const isSelected = selectedDate === d.date;
            const blocked = isDayBlocked(stylistId, d.date);
            return (
              <button
                key={d.date}
                onClick={() => !blocked && setSelectedDate(d.date)}
                disabled={blocked}
                className={`flex-shrink-0 w-[64px] py-2.5 rounded-2xl text-center transition-all duration-200 ${
                  blocked
                    ? 'bg-stone-200 text-neutral-400 cursor-not-allowed opacity-60'
                    : isSelected
                    ? 'bg-neutral-900 text-white shadow-lg scale-105'
                    : 'bg-white text-neutral-700 shadow-sm border border-stone-200'
                }`}
              >
                <div className={`text-[10px] font-semibold uppercase tracking-wider ${isSelected ? 'text-amber-400' : 'opacity-70'}`}>
                  {d.isToday ? 'Today' : d.dayName}
                </div>
                <div className="text-xl font-bold mt-0.5">{d.dayNum}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{d.month}</div>
              </button>
            );
          })}
        </div>

        {/* Time slots */}
        {hasActiveBooking ? (
          <div className="bg-white rounded-3xl shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-neutral-800">You already have an upcoming appointment</h3>
            <p className="text-neutral-500 mt-2 text-sm">Cancel your current booking to make a new one.</p>
          </div>
        ) : dayBlocked ? (
          <div className="bg-white rounded-3xl shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">🚫</div>
            <h3 className="text-lg font-semibold text-neutral-800">Day Unavailable</h3>
            <p className="text-neutral-500 mt-2 text-sm">{stylist.name} is off this day. Please choose another date.</p>
          </div>
        ) : (
          <>
            <h3 className="text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-widest">
              🕐 Select Time {availableTimes.length === 0 && '— fully booked'}
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {TIME_SLOTS.map((time) => {
                const available = availableTimes.includes(time);
                return (
                  <button
                    key={time}
                    onClick={() => available && setShowConfirm(time)}
                    disabled={!available}
                    className={`py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                      available
                        ? 'bg-white text-neutral-800 shadow-sm border border-stone-200 hover:border-amber-500 hover:bg-amber-50 active:scale-95'
                        : 'bg-stone-200/70 text-neutral-400 line-through cursor-not-allowed'
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
            {service.duration_min > 30 && (
              <p className="text-xs text-neutral-400 mt-3">
                This service takes {service.duration_min} min, so only times with enough free space are shown.
              </p>
            )}
          </>
        )}
      </div>

      {/* Confirmation sheet */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-[slideUp_0.3s_ease-out]">
            <h3 className="font-display text-2xl font-semibold text-neutral-900 text-center uppercase tracking-wide">
              Confirm Booking
            </h3>

            <div className="mt-5 space-y-3 bg-stone-100 rounded-2xl p-4 text-neutral-700">
              <p className="flex items-center gap-3">
                <span className="text-xl">💈</span>
                <span className="font-semibold">{stylist.name}</span>
              </p>
              <p className="flex items-center gap-3">
                <span className="text-xl">{service.icon}</span>
                <span className="font-semibold">
                  {service.name} · {formatPrice(service.price)}
                </span>
              </p>
              <p className="flex items-center gap-3">
                <span className="text-xl">📅</span>
                <span className="font-semibold">{formatLongDate(selectedDate)}</span>
              </p>
              <p className="flex items-center gap-3">
                <span className="text-xl">🕐</span>
                <span className="font-semibold">
                  {showConfirm} ({service.duration_min} min)
                </span>
              </p>
            </div>

            {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowConfirm(null);
                  setError('');
                }}
                className="flex-1 py-3.5 border-2 border-stone-200 text-neutral-500 rounded-2xl hover:bg-stone-50 font-semibold text-sm"
              >
                Back
              </button>
              <button onClick={confirmBooking} disabled={busy} className={`${btnGold} flex-1 py-3.5 text-sm`}>
                {busy ? 'Booking…' : 'Confirm ✂️'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
