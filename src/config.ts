// ============================================================
// config.ts — Supabase connection settings
// ============================================================
// Find both values in Supabase → Project Settings → API.
// The anon/publishable key is designed to be public (it ships to the browser).
// ============================================================

export const SUPABASE_URL = 'https://ajesobcqtlpuvtuziqsd.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Y7NleEL8TUOZF6RDdhJYCw_7MNw6Fx6';

/**
 * DEMO_MODE — true while the app is shown to barbers as a demo.
 * Shows the one-tap "Try as Admin / Barber / Client" buttons on the login
 * screen and the "Reset demo" button in Admin → Settings.
 * Set to false before a real shop uses the app.
 */
export const DEMO_MODE = true;

/** Demo accounts used by the "Try as…" buttons (see supabase/update-3.sql) */
export const DEMO_ACCOUNTS = {
  admin: { mobile: '000', password: '12345' },
  barber: { mobile: '111', password: '12345' },
  client: { mobile: '0500000000', name: 'Demo Client' },
};
