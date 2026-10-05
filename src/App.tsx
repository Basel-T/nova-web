// ============================================================
// App.tsx — Main Application Entry Point & Router
// ============================================================
// This is the "brain" of the app. It handles:
//   1. Connecting to the cloud database on first load
//   2. Checking if a user is already logged in on this phone
//   3. Routing between pages based on state (no URL-based router needed)
//   4. Role-based routing: client → dashboard, barber → panel, admin → admin
// ============================================================

import { useState, useEffect } from 'react';
import { User } from './types';
import { initializeStore, getCurrentUser, getUserById, setCurrentUser, logout, isConfigured } from './store';
import { LoadingScreen } from './components';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ServiceSelect from './pages/ServiceSelect';
import StylistSelect from './pages/StylistSelect';
import Booking from './pages/Booking';
import StylistPanel from './pages/StylistPanel';
import AdminPanel from './pages/AdminPanel';

type Page = 'login' | 'dashboard' | 'service-select' | 'stylist-select' | 'booking' | 'stylist-panel' | 'admin-panel';

const pageForRole = (user: User): Page =>
  user.role === 'admin' ? 'admin-panel' : user.role === 'stylist' ? 'stylist-panel' : 'dashboard';

function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('login');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedStylistId, setSelectedStylistId] = useState('');

  // --- Initialization: connect to the cloud and restore the session ---
  const connect = () => {
    setStatus('loading');
    initializeStore()
      .then(() => {
        const saved = getCurrentUser();
        // Use the fresh cloud copy (role may have changed, e.g. promoted to barber)
        const fresh = saved ? getUserById(saved.id) : undefined;
        if (fresh) {
          setCurrentUser(fresh);
          setCurrentUserState(fresh);
          setPage(pageForRole(fresh));
        } else if (saved) {
          logout();
        }
        setStatus('ready');
      })
      .catch((e) => {
        console.error(e);
        setStatus('error');
      });
  };

  useEffect(() => {
    if (isConfigured) connect();
  }, []);

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">💈</div>
          <h1 className="font-display text-2xl uppercase">Database not connected</h1>
          <p className="text-neutral-400 text-sm mt-2">Add the Supabase URL and anon key in src/config.ts.</p>
        </div>
      </div>
    );
  }

  if (status === 'loading') return <LoadingScreen message="Connecting to the shop…" />;

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">📡</div>
          <h1 className="font-display text-2xl uppercase">Can't reach the shop</h1>
          <p className="text-neutral-400 text-sm mt-2 mb-6">Check your internet connection and try again.</p>
          <button onClick={connect} className="bg-amber-500 text-neutral-950 font-semibold rounded-2xl px-6 py-3">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const handleLogin = (user: User) => {
    setCurrentUserState(user);
    setPage(pageForRole(user));
  };

  const handleLogout = () => {
    setCurrentUserState(null);
    setPage('login');
  };

  if (!currentUser || page === 'login') return <Login onLogin={handleLogin} />;

  switch (page) {
    // CLIENT FLOW: dashboard → service → barber → date/time
    case 'dashboard':
      return <Dashboard user={currentUser} onBook={() => setPage('service-select')} onLogout={handleLogout} />;

    case 'service-select':
      return (
        <ServiceSelect
          onSelect={(id) => {
            setSelectedServiceId(id);
            setPage('stylist-select');
          }}
          onBack={() => setPage('dashboard')}
        />
      );

    case 'stylist-select':
      return (
        <StylistSelect
          serviceId={selectedServiceId}
          onSelect={(id) => {
            setSelectedStylistId(id);
            setPage('booking');
          }}
          onBack={() => setPage('service-select')}
        />
      );

    case 'booking':
      return (
        <Booking
          user={currentUser}
          serviceId={selectedServiceId}
          stylistId={selectedStylistId}
          onBack={() => setPage('stylist-select')}
          onBooked={() => setPage('dashboard')}
        />
      );

    // BARBER PANEL — manage appointments and schedule
    case 'stylist-panel':
      return <StylistPanel user={currentUser} onLogout={handleLogout} />;

    // ADMIN PANEL — bookings, barbers, services
    case 'admin-panel':
      return <AdminPanel onLogout={handleLogout} />;

    default:
      return <Login onLogin={handleLogin} />;
  }
}

export default App;
