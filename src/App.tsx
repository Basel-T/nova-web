// ============================================================
// App.tsx — Entry point & role-based routing
// ============================================================
//   1. Connect to the cloud database
//   2. Restore this phone's session (staff sessions are re-checked
//      against the server, so a copied/forged session can't get in)
//   3. Route: client → booking app, barber → barber panel, admin → admin
// ============================================================

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import type { User } from './types';
import {
  clearSession,
  getSession,
  getUserById,
  initializeStore,
  isConfigured,
  logout,
  saveSession,
  useStoreVersion,
  verifyStaffSession,
} from './store';
import { Button, DialogHost, LoadingScreen, Toaster, closeOverlays, toast } from './ui';
import { t, useLang } from './i18n';

import Login from './pages/Login';
import ClientApp from './pages/client/ClientHome';
import BarberPanel from './pages/barber/BarberPanel';
import AdminPanel from './pages/admin/AdminPanel';

export default function App() {
  useStoreVersion();
  useLang(); // re-render the whole app when the language changes
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [user, setUser] = useState<User | null>(null);

  const connect = async () => {
    setStatus('loading');
    try {
      await initializeStore();
      const session = getSession();
      if (session) {
        const fresh = getUserById(session.user.id);
        if (fresh?.role === 'client') {
          saveSession({ user: fresh });
          setUser(fresh);
        } else if (fresh && (await verifyStaffSession({ ...session, user: fresh }))) {
          saveSession({ user: fresh, token: session.token });
          setUser(fresh);
        } else {
          clearSession();
        }
      }
      setStatus('ready');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  useEffect(() => {
    // A reload mid-booking leaves a stale history entry behind — drop it
    if (history.state && typeof history.state === 'object' && 'booking' in history.state) {
      history.replaceState(null, '');
    }
    if (isConfigured) connect();
  }, []);

  // If the admin changes this person's role (e.g. removes a barber), sign them out
  const live = user ? getUserById(user.id) : undefined;
  useEffect(() => {
    if (user && live && live.role !== user.role) {
      logout();
      setUser(null);
      toast(t('app.accessChanged'), 'info');
    }
  }, [user, live]);

  const handleLogout = () => {
    closeOverlays(); // nothing from the previous role stays on screen
    logout();
    setUser(null);
  };

  // Every screen change (sign in, sign out, switching role) starts at the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [user?.id, user?.role]);

  if (!isConfigured) {
    return (
      <div className="page-glow flex min-h-dvh items-center justify-center p-6 text-center">
        <p className="text-ink-300">{t('app.notConfigured')}</p>
      </div>
    );
  }

  if (status === 'loading') return <LoadingScreen message={t('common.loading')} />;

  if (status === 'error') {
    return (
      <div className="page-glow flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="grid size-14 place-items-center rounded-full border border-white/10 bg-white/[0.03]">
          <WifiOff className="size-6 text-gold-300" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-3xl text-cream">{t('app.offlineTitle')}</h1>
        <p className="max-w-xs text-sm text-ink-400">{t('app.offlineText')}</p>
        <Button variant="gold" onClick={connect} className="mt-2">
          {t('app.tryAgain')}
        </Button>
      </div>
    );
  }

  return (
    <>
      {!user ? (
        <Login onLogin={setUser} />
      ) : user.role === 'admin' ? (
        <AdminPanel user={user} onLogout={handleLogout} />
      ) : user.role === 'stylist' ? (
        <BarberPanel user={user} onLogout={handleLogout} />
      ) : (
        <ClientApp user={user} onLogout={handleLogout} />
      )}
      <Toaster />
      <DialogHost />
    </>
  );
}
