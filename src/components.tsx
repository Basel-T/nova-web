// ============================================================
// components.tsx — Small shared UI pieces used across pages
// ============================================================

import { ReactNode } from 'react';
import { Appointment, Stylist } from './types';

/** Barber photo, or a dark initials badge when no photo is set */
export function Avatar({ stylist, size = 'md' }: { stylist?: Stylist; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'md' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm';
  if (stylist?.image) {
    return <img src={stylist.image} alt={stylist.name} className={`${dims} rounded-2xl object-cover shrink-0`} />;
  }
  const initials = (stylist?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className={`${dims} rounded-2xl shrink-0 bg-gradient-to-br from-neutral-800 to-neutral-950
                  text-amber-400 font-display font-semibold flex items-center justify-center
                  ring-1 ring-amber-500/30`}
    >
      {initials}
    </div>
  );
}

/** Dark sticky top bar used on every signed-in page */
export function TopBar({
  title,
  subtitle,
  onBack,
  right,
  wide = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="bg-neutral-950 text-white sticky top-0 z-20 shadow-lg">
      <div className={`${wide ? 'max-w-2xl' : 'max-w-lg'} mx-auto px-4 py-3.5 flex items-center gap-3`}>
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back"
            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-neutral-300
                       hover:bg-white/10 transition-colors text-xl"
          >
            ←
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-semibold tracking-wide uppercase truncate">{title}</h1>
          {subtitle && <p className="text-xs text-neutral-400 truncate">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="barber-stripe h-1 opacity-90" />
    </div>
  );
}

export function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-neutral-400 hover:text-white text-sm font-medium transition-colors px-2 py-1"
    >
      Logout
    </button>
  );
}

const STATUS_STYLES: Record<Appointment['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  booked: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-sky-100 text-sky-700',
  cancelled: 'bg-red-100 text-red-600',
};

const STATUS_LABELS: Record<Appointment['status'], string> = {
  pending: '⏳ Pending',
  booked: '✓ Confirmed',
  completed: '✔ Completed',
  cancelled: '✕ Cancelled',
};

export function StatusBadge({ status }: { status: Appointment['status'] }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Full-screen loading state */
export function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-4 text-white">
      <div className="text-5xl animate-bounce">💈</div>
      <p className="text-neutral-400 text-sm">{message}</p>
    </div>
  );
}

/** Primary dark button */
export const btnPrimary =
  'bg-neutral-900 text-white font-semibold rounded-2xl shadow-lg hover:bg-neutral-800 ' +
  'transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

/** Gold accent button */
export const btnGold =
  'bg-amber-500 text-neutral-950 font-semibold rounded-2xl shadow-lg hover:bg-amber-400 ' +
  'transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

export const inputClass =
  'w-full px-4 py-3.5 rounded-2xl border border-stone-300 bg-stone-50 text-neutral-800 ' +
  'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 ' +
  'focus:border-transparent transition-all';
