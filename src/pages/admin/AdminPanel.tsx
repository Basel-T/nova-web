// ============================================================
// AdminPanel.tsx — The shop owner's app
// ============================================================
//   Bookings  — every booking, filters, search, all actions
//   Analytics — revenue, trends and the full activity log
//   Team      — barbers: photos, bios, logins, passwords
//   Services  — menu, prices and exact durations
//   Settings  — shop profile, opening hours, booking rules
// ============================================================

import { useState } from 'react';
import { BarChart3, CalendarDays, LogOut, Scissors, Settings2, Users } from 'lucide-react';
import type { User } from '../../types';
import { getAppointments, getSettings, useStoreVersion } from '../../store';
import { AppHeader, BottomNav, IconButton, Wordmark, confirmDialog } from '../../ui';
import { todayStr } from '../../lib/time';
import Analytics from '../Analytics';
import AdminBookings from './AdminBookings';
import AdminTeam from './AdminTeam';
import AdminServices from './AdminServices';
import AdminSettings from './AdminSettings';

type Tab = 'bookings' | 'analytics' | 'team' | 'services' | 'settings';

const TITLES: Record<Tab, { title: string; sub: string }> = {
  bookings: { title: 'Bookings', sub: 'Every appointment across the shop' },
  analytics: { title: 'Analytics', sub: 'Revenue, trends and everything that happened' },
  team: { title: 'Team', sub: 'Barbers, photos and logins' },
  services: { title: 'Services', sub: 'Your menu, prices and timings' },
  settings: { title: 'Settings', sub: 'Shop profile, hours and booking rules' },
};

export default function AdminPanel({ user, onLogout }: { user: User; onLogout: () => void }) {
  useStoreVersion();
  const [tab, setTab] = useState<Tab>('bookings');
  const settings = getSettings();
  const today = todayStr();
  const pending = getAppointments().filter((a) => a.status === 'pending' && a.date >= today).length;

  const signOut = async () => {
    if (await confirmDialog({ title: 'Sign out?', confirmText: 'Sign out', cancelText: 'Stay' })) onLogout();
  };

  return (
    <div className="page-glow min-h-dvh pb-28">
      <AppHeader
        wide
        left={
          <div className="flex items-center gap-3">
            <Wordmark name={settings.shop_name} className="truncate text-[24px]" />
            <span className="rounded-full border border-gold-400/30 bg-gold-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-200">
              Admin
            </span>
          </div>
        }
        right={
          <IconButton label="Sign out" onClick={signOut}>
            <LogOut className="size-5" />
          </IconButton>
        }
      />

      <main key={tab} className="animate-rise mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-6">
          <h1 className="font-display text-[44px] leading-none text-cream">{TITLES[tab].title}</h1>
          <p className="mt-2 text-sm text-ink-400">{TITLES[tab].sub}</p>
        </div>
        {tab === 'bookings' && <AdminBookings />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'team' && <AdminTeam />}
        {tab === 'services' && <AdminServices />}
        {tab === 'settings' && <AdminSettings user={user} />}
      </main>

      <BottomNav
        value={tab}
        onChange={(t) => {
          setTab(t);
          window.scrollTo(0, 0);
        }}
        items={[
          { key: 'bookings', label: 'Bookings', icon: CalendarDays, badge: pending },
          { key: 'analytics', label: 'Analytics', icon: BarChart3 },
          { key: 'team', label: 'Team', icon: Users },
          { key: 'services', label: 'Services', icon: Scissors },
          { key: 'settings', label: 'Settings', icon: Settings2 },
        ]}
      />
    </div>
  );
}
