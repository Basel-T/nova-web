// ============================================================
// store.ts — Cloud Database Layer (Supabase)
// ============================================================
// All shared data lives in Supabase (Postgres) in the cloud, so every
// phone sees the same bookings — no matter whose PC is on.
//
//   1. On load we download every table into an in-memory cache.
//   2. Pages read from the cache synchronously (fast, simple code).
//   3. Writes update the cache instantly, then save to Supabase.
//   4. Supabase Realtime pushes other people's changes to us; we also
//      re-sync every 45 s and whenever the phone wakes up.
//   5. useStoreVersion() lets React pages re-render on any change.
//   6. Every action is written to the activity log (admin analytics).
//
// Staff passwords are checked by database functions (supabase/update-2.sql);
// the hashes themselves are never readable from the browser.
// ============================================================

import { useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import type {
  ActivityEvent,
  Appointment,
  AppointmentStatus,
  BlockedSlot,
  DayHours,
  Service,
  Settings,
  Stylist,
  User,
} from './types';
import { addDays, daysBetween, formatShortDate, fromMin, toDateStr, toMin, todayStr, weekdayOf } from './lib/time';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const SESSION_KEY = 'bf_session_v2';
const PHOTO_BUCKET = 'barber-photos';

// ============================================================
// CACHE
// ============================================================

const DEFAULT_HOURS: Record<string, DayHours | null> = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { open: '10:00', close: '20:00' }])
);

export const DEFAULT_SETTINGS: Settings = {
  id: 'shop',
  shop_name: 'Blade & Fade',
  tagline: 'Barbershop',
  address: '12 Main Street',
  phone: '',
  currency: '$',
  hours: DEFAULT_HOURS,
  slot_interval: 15,
  booking_window_days: 30,
  min_notice_min: 0,
  auto_confirm: false,
  max_upcoming: 2,
};

interface Cache {
  users: User[];
  stylists: Stylist[];
  services: Service[];
  appointments: Appointment[];
  blocked_slots: BlockedSlot[];
  settings: Settings[];
}
type TableName = keyof Cache;
const TABLES: TableName[] = ['users', 'stylists', 'services', 'appointments', 'blocked_slots', 'settings'];

const cache: Cache = {
  users: [],
  stylists: [],
  services: [],
  appointments: [],
  blocked_slots: [],
  settings: [],
};

// The activity log is only downloaded when someone opens analytics
let activity: ActivityEvent[] = [];
let activityEnabled = false;

// ============================================================
// CHANGE NOTIFICATIONS — lets React re-render when data changes
// ============================================================

let version = 0;
const listeners = new Set<() => void>();

function emitChange(): void {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: returns a number that increases whenever any data changes */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

// ============================================================
// SYNC
// ============================================================

function db() {
  if (!supabase) throw new Error('Supabase is not configured (see src/config.ts)');
  return supabase;
}

/** Postgres numeric columns arrive as strings — convert, and fill defaults */
function normalize(table: TableName, rows: any[]): any[] {
  switch (table) {
    case 'services':
      return rows.map((r) => ({ ...r, price: Number(r.price), duration_min: Number(r.duration_min) }));
    case 'appointments':
      return rows.map((r) => ({
        ...r,
        price: Number(r.price),
        duration_min: Number(r.duration_min),
        client_note: r.client_note ?? '',
        cancelled_by: r.cancelled_by ?? null,
      }));
    case 'stylists':
      return rows.map((r) => ({ ...r, bio: r.bio ?? '', sort: r.sort ?? 0, active: r.active ?? true }));
    case 'blocked_slots':
      return rows.map((r) => ({ ...r, end_time: r.end_time ?? null, note: r.note ?? '' }));
    case 'settings':
      return rows.map((r) => ({ ...DEFAULT_SETTINGS, ...r, hours: { ...DEFAULT_HOURS, ...(r.hours || {}) } }));
    default:
      return rows;
  }
}

async function fetchTable(table: TableName): Promise<void> {
  const { data, error } = await db().from(table).select('*');
  if (error) throw new Error(error.message);
  (cache as any)[table] = normalize(table, data ?? []);
}

async function fetchActivity(): Promise<void> {
  const { data, error } = await db()
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) throw new Error(error.message);
  activity = (data ?? []).map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) }));
}

/** Re-download every table from the cloud */
export async function refreshAll(): Promise<void> {
  await Promise.all([...TABLES.map(fetchTable), ...(activityEnabled ? [fetchActivity()] : [])]);
  emitChange();
  autoCompletePastBookings().catch(console.error);
}

let initialized = false;

/** Call once when the app loads: downloads data and starts live updates */
export async function initializeStore(): Promise<void> {
  await refreshAll();
  if (initialized) return;
  initialized = true;

  db()
    .channel('barbershop-db')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      const table = payload.table;
      if (table === 'activity_log') {
        if (activityEnabled) fetchActivity().then(emitChange).catch(console.error);
      } else if ((TABLES as string[]).includes(table)) {
        fetchTable(table as TableName).then(emitChange).catch(console.error);
      }
    })
    .subscribe();

  setInterval(() => refreshAll().catch(console.error), 45000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll().catch(console.error);
  });
}

type DbError = { message: string; code?: string };

/** Run a Supabase write; on failure re-sync the cache and throw */
async function write(op: PromiseLike<{ error: DbError | null }>): Promise<void> {
  const { error } = await op;
  if (error) {
    await refreshAll().catch(console.error);
    const err = new Error(error.message) as Error & { code?: string };
    err.code = error.code;
    throw err;
  }
}

function newId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// SESSION — who is logged in on this phone
// ============================================================

export interface Session {
  user: User;
  token?: string; // staff only: proves the password was entered
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode — session just won't persist */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function currentUser(): User | null {
  return getSession()?.user ?? null;
}

export function logout(): void {
  const token = getSession()?.token;
  if (token && supabase) {
    Promise.resolve(supabase.rpc('staff_logout', { p_token: token })).catch(() => undefined);
  }
  clearSession();
}

/** Staff sign-in. Returns the user, or null when the password is wrong. */
export async function staffLogin(mobile: string, password: string): Promise<User | null> {
  const { data, error } = await db().rpc('staff_login', { p_mobile: mobile, p_password: password });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { token, user } = data as { token: string; user: User };
  saveSession({ user, token });
  logActivity('staff_login', `${user.full_name} signed in`, {
    stylist_id: user.role === 'stylist' ? getStylistByMobile(user.mobile_number)?.id : undefined,
  });
  autoCompletePastBookings().catch(console.error);
  return user;
}

/** Is this saved staff session still valid? (password changed / removed → no) */
export async function verifyStaffSession(session: Session): Promise<boolean> {
  if (!session.token) return false;
  const { data, error } = await db().rpc('staff_session_user', { p_token: session.token });
  if (error) throw new Error(error.message);
  return data === session.user.id;
}

/** Admin: set or reset a staff member's password */
export async function adminSetPassword(userId: string, password: string): Promise<void> {
  const token = getSession()?.token;
  if (!token) throw new Error('Please sign in again');
  const { error } = await db().rpc('admin_set_staff_password', {
    p_token: token,
    p_user_id: userId,
    p_password: password,
  });
  if (error) throw new Error(error.message);
}

/** Admin (demo mode): wipe bookings & activity, restore demo data (supabase/update-3.sql) */
export async function resetDemo(): Promise<void> {
  const token = getSession()?.token;
  if (!token) throw new Error('Please sign in again');
  const { error } = await db().rpc('reset_demo', { p_token: token });
  if (error) throw new Error(error.message);
  await refreshAll();
}

// ============================================================
// ACTIVITY LOG
// ============================================================

/** Record something that happened (fire-and-forget) */
export function logActivity(
  type: string,
  message: string,
  extra: { stylist_id?: string | null; appointment_id?: string | null; amount?: number | null; system?: boolean } = {}
): void {
  if (!supabase) return;
  const actor = extra.system ? null : currentUser();
  const row: ActivityEvent = {
    id: newId('ev'),
    created_at: new Date().toISOString(),
    type,
    message,
    actor_id: actor?.id ?? null,
    actor_name: extra.system ? 'System' : actor?.full_name ?? null,
    actor_role: extra.system ? 'system' : actor?.role ?? null,
    stylist_id: extra.stylist_id ?? null,
    appointment_id: extra.appointment_id ?? null,
    amount: extra.amount ?? null,
  };
  if (activityEnabled) {
    activity = [row, ...activity];
    emitChange();
  }
  Promise.resolve(supabase.from('activity_log').insert(row)).then(
    ({ error }) => error && console.error('activity log:', error.message),
    console.error
  );
}

/** Start downloading the activity log (analytics screens call this) */
export async function enableActivity(): Promise<void> {
  if (activityEnabled) return;
  activityEnabled = true;
  await fetchActivity();
  emitChange();
}

export function getActivity(): ActivityEvent[] {
  return activity;
}

// ============================================================
// SETTINGS
// ============================================================

export function getSettings(): Settings {
  return cache.settings[0] ?? DEFAULT_SETTINGS;
}

/** Opening hours for a date, or null when the shop is closed that day */
export function getHoursFor(date: string): DayHours | null {
  return getSettings().hours[String(weekdayOf(date))] ?? null;
}

const SETTING_LABELS: Partial<Record<keyof Settings, string>> = {
  shop_name: 'shop name',
  tagline: 'tagline',
  address: 'address',
  phone: 'phone',
  currency: 'currency',
  hours: 'opening hours',
  slot_interval: 'time-slot interval',
  booking_window_days: 'booking window',
  min_notice_min: 'minimum notice',
  auto_confirm: 'auto-confirm',
  max_upcoming: 'max upcoming bookings',
};

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const before = getSettings();
  const next: Settings = { ...before, ...patch, id: 'shop' };
  const changed = (Object.keys(patch) as (keyof Settings)[]).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(next[k])
  );
  if (changed.length === 0) return;
  cache.settings = [next];
  emitChange();
  await write(db().from('settings').upsert({ ...next, updated_at: new Date().toISOString() }));
  logActivity(
    'settings_updated',
    `Shop settings updated: ${changed.map((k) => SETTING_LABELS[k] ?? k).join(', ')}`
  );
}

/** "$25", "$1,250", "AED 40" — uses the shop's currency */
export function formatPrice(amount: number): string {
  const cur = getSettings().currency || '$';
  const num = amount.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return /^[A-Za-z]{2,}$/.test(cur) ? `${cur} ${num}` : `${cur}${num}`;
}

// ============================================================
// USERS
// ============================================================

export function getUsers(): User[] {
  return cache.users;
}

export function getUserById(id: string): User | undefined {
  return cache.users.find((u) => u.id === id);
}

/** Look a mobile number up directly in the cloud (always fresh) */
export async function findUserByMobile(mobile: string): Promise<User | undefined> {
  const { data, error } = await db().from('users').select('*').eq('mobile_number', mobile).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? undefined;
}

/** Create a new client account and sign in */
export async function addUser(fullName: string, mobile: string): Promise<User> {
  const newUser: User = { id: newId('u'), full_name: fullName, mobile_number: mobile, role: 'client' };
  try {
    await write(db().from('users').insert(newUser));
  } catch (e) {
    const existing = await findUserByMobile(mobile); // registered a moment ago
    if (existing) return existing;
    throw e;
  }
  cache.users = [...cache.users, { ...newUser, created_at: new Date().toISOString() }];
  saveSession({ user: newUser });
  emitChange();
  logActivity('client_signup', `${fullName} joined as a new client`);
  return newUser;
}

// ============================================================
// BARBERS
// ============================================================

/** Barbers in display order (pass true to include paused ones) */
export function getStylists(includeInactive = false): Stylist[] {
  return cache.stylists
    .filter((s) => includeInactive || s.active)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function getStylistById(id: string): Stylist | undefined {
  return cache.stylists.find((s) => s.id === id);
}

export function getStylistByMobile(mobile: string): Stylist | undefined {
  return cache.stylists.find((s) => s.mobile_number === mobile);
}

/** Crop to a 4:5 portrait and shrink to 640×800 JPEG before uploading */
async function preparePhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file is not a supported image'));
      i.src = url;
    });
    const ratio = 4 / 5;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    let sx = 0;
    let sy = 0;
    if (sw / sh > ratio) {
      sw = Math.round(sh * ratio);
      sx = Math.round((img.naturalWidth - sw) / 2);
    } else {
      sh = Math.round(sw / ratio);
      sy = Math.round((img.naturalHeight - sh) * 0.25); // keep faces (upper part) in frame
    }
    const outW = Math.min(640, sw);
    const outH = Math.round(outW / ratio);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the image');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image'))), 'image/jpeg', 0.86)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadPhoto(stylistId: string, file: File): Promise<string> {
  const blob = await preparePhoto(file);
  const path = `${stylistId}/${Date.now()}.jpg`;
  const { error } = await db().storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return db().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function removePhotoFile(url: string | null): void {
  const marker = `/${PHOTO_BUCKET}/`;
  if (!url || !url.includes(marker)) return;
  const path = url.split(marker)[1];
  Promise.resolve(db().storage.from(PHOTO_BUCKET).remove([path])).catch(() => undefined);
}

export interface StylistInput {
  name: string;
  mobile_number: string;
  title: string;
  bio: string;
  active: boolean;
}

/** Photo change requested in the barber form */
export type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'upload'; file: File };

/**
 * Admin: add a barber. Creates the Stylist, makes sure a User with role
 * 'stylist' exists for that mobile number, sets the password and photo.
 */
export async function addStylist(input: StylistInput, password: string, photo: PhotoChange): Promise<void> {
  const id = newId('s');
  const sort = Math.max(0, ...cache.stylists.map((s) => s.sort)) + 1;
  await write(db().from('stylists').insert({ id, ...input, image: null, sort }));

  const existing = await findUserByMobile(input.mobile_number);
  let userId = existing?.id;
  if (existing) {
    await write(db().from('users').update({ role: 'stylist', full_name: input.name }).eq('id', existing.id));
  } else {
    userId = newId('u');
    await write(
      db().from('users').insert({ id: userId, full_name: input.name, mobile_number: input.mobile_number, role: 'stylist' })
    );
  }
  await adminSetPassword(userId!, password);

  if (photo.kind === 'upload') {
    const url = await uploadPhoto(id, photo.file);
    await write(db().from('stylists').update({ image: url }).eq('id', id));
  }
  await refreshAll();
  logActivity('barber_added', `${input.name} joined the team as ${input.title}`, { stylist_id: id });
}

/** Admin: edit a barber's profile, photo and (optionally) password */
export async function updateStylist(
  id: string,
  input: StylistInput,
  password: string,
  photo: PhotoChange
): Promise<void> {
  const before = getStylistById(id);
  if (!before) throw new Error('Barber not found');

  let image = before.image;
  if (photo.kind === 'upload') image = await uploadPhoto(id, photo.file);
  if (photo.kind === 'remove') image = null;

  await write(db().from('stylists').update({ ...input, image }).eq('id', id));
  if (photo.kind !== 'keep' && before.image !== image) removePhotoFile(before.image);

  // Keep the matching login in sync (name / mobile number)
  const user = cache.users.find((u) => u.mobile_number === before.mobile_number);
  if (user) {
    await write(
      db().from('users').update({ full_name: input.name, mobile_number: input.mobile_number, role: 'stylist' }).eq('id', user.id)
    );
    if (password) await adminSetPassword(user.id, password);
  }
  await refreshAll();

  const changes: string[] = [];
  if (photo.kind === 'upload') changes.push('new photo');
  if (photo.kind === 'remove') changes.push('photo removed');
  if (before.name !== input.name) changes.push(`name → ${input.name}`);
  if (before.title !== input.title) changes.push(`title → ${input.title}`);
  if (before.bio !== input.bio) changes.push('bio');
  if (before.mobile_number !== input.mobile_number) changes.push('login number');
  if (before.active !== input.active) changes.push(input.active ? 'now taking bookings' : 'bookings paused');
  if (password) changes.push('password reset');
  logActivity('barber_updated', `${input.name}'s profile updated${changes.length ? `: ${changes.join(', ')}` : ''}`, {
    stylist_id: id,
  });
}

/** Admin: remove a barber. Their login becomes a normal client account. */
export async function removeStylist(id: string): Promise<void> {
  const stylist = getStylistById(id);
  if (!stylist) return;
  await write(db().from('stylists').delete().eq('id', id));
  await write(db().from('users').update({ role: 'client' }).eq('mobile_number', stylist.mobile_number));
  removePhotoFile(stylist.image);
  await refreshAll();
  logActivity('barber_removed', `${stylist.name} was removed from the team`, { stylist_id: id });
}

// ============================================================
// SERVICES
// ============================================================

/** Services in display order (pass true to include hidden ones) */
export function getServices(includeInactive = false): Service[] {
  return cache.services
    .filter((s) => includeInactive || s.active)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function getServiceById(id: string): Service | undefined {
  return cache.services.find((s) => s.id === id);
}

export async function saveService(service: Omit<Service, 'id'> & { id?: string }): Promise<void> {
  const before = service.id ? getServiceById(service.id) : undefined;
  const row: Service = { ...service, id: service.id || newId('svc') };
  cache.services = [...cache.services.filter((s) => s.id !== row.id), row];
  emitChange();
  await write(db().from('services').upsert(row));

  if (!before) {
    logActivity('service_added', `New service “${row.name}” added · ${formatPrice(row.price)} · ${row.duration_min} min`);
    return;
  }
  const changes: string[] = [];
  if (before.name !== row.name) changes.push(`renamed to “${row.name}”`);
  if (before.price !== row.price) changes.push(`price ${formatPrice(before.price)} → ${formatPrice(row.price)}`);
  if (before.duration_min !== row.duration_min) changes.push(`time ${before.duration_min} → ${row.duration_min} min`);
  if (before.description !== row.description) changes.push('description');
  if (before.active !== row.active) changes.push(row.active ? 'now visible' : 'hidden from clients');
  if (changes.length) logActivity('service_updated', `“${before.name}” updated: ${changes.join(', ')}`);
}

export async function deleteService(id: string): Promise<void> {
  const before = getServiceById(id);
  cache.services = cache.services.filter((s) => s.id !== id);
  emitChange();
  await write(db().from('services').delete().eq('id', id));
  if (before) logActivity('service_deleted', `Service “${before.name}” deleted`);
}

/** Move a service up (-1) or down (+1) in the menu */
export async function moveService(id: string, direction: -1 | 1): Promise<void> {
  const list = getServices(true);
  const i = list.findIndex((s) => s.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return;
  const reordered = [...list];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  const updates = reordered.map((s, idx) => ({ ...s, sort: idx + 1 }));
  cache.services = updates;
  emitChange();
  await write(db().from('services').upsert(updates));
}

// ============================================================
// APPOINTMENTS
// ============================================================

export function getAppointments(): Appointment[] {
  return cache.appointments;
}

export const isActive = (a: Appointment) => a.status === 'pending' || a.status === 'booked';

/** "James Carter's Skin Fade with Leo Vargas · Tue, Oct 6 at 10:00" (barber omitted when they're the one acting) */
function describe(a: Appointment, withBarber = true): string {
  const client = getUserById(a.user_id)?.full_name ?? 'A client';
  const barber = getStylistById(a.stylist_id)?.name ?? 'a barber';
  return `${client}'s ${a.service_name}${withBarber ? ` with ${barber}` : ''} · ${formatShortDate(a.date)} at ${a.time}`;
}

/**
 * Create a booking. Re-checks availability against the cloud first; the
 * database also refuses overlapping bookings. Throws Error('SLOT_TAKEN').
 */
export async function addAppointment(
  userId: string,
  stylistId: string,
  serviceId: string,
  date: string,
  time: string,
  note: string
): Promise<Appointment> {
  const service = getServiceById(serviceId);
  if (!service) throw new Error('Service not found');

  await Promise.all([fetchTable('appointments'), fetchTable('blocked_slots')]);
  if (hasReachedBookingLimit(userId)) {
    emitChange();
    throw new Error('LIMIT');
  }
  // A client can't be in two chairs at once
  const start = toMin(time);
  const clash = getUserUpcoming(userId).some(
    (a) => a.date === date && start < toMin(a.time) + a.duration_min && start + service.duration_min > toMin(a.time)
  );
  if (clash) throw new Error('CLIENT_OVERLAP');
  if (!getAvailableStarts(stylistId, date, service.duration_min).includes(time)) {
    emitChange();
    throw new Error('SLOT_TAKEN');
  }

  const appt: Appointment = {
    id: newId('a'),
    user_id: userId,
    stylist_id: stylistId,
    service_id: service.id,
    service_name: service.name,
    price: service.price,
    duration_min: service.duration_min,
    date,
    time,
    status: getSettings().auto_confirm ? 'booked' : 'pending',
    client_note: note.trim(),
    cancelled_by: null,
  };
  try {
    await write(db().from('appointments').insert(appt));
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new Error('SLOT_TAKEN');
    throw e;
  }
  cache.appointments = [...cache.appointments, { ...appt, created_at: new Date().toISOString() }];
  emitChange();

  const client = getUserById(userId)?.full_name ?? currentUser()?.full_name ?? 'A client';
  const barber = getStylistById(stylistId)?.name ?? 'a barber';
  logActivity(
    'booking_created',
    `${client} booked ${service.name} with ${barber} · ${formatShortDate(date)} at ${time}${
      appt.status === 'booked' ? ' (auto-confirmed)' : ''
    }`,
    { stylist_id: stylistId, appointment_id: appt.id, amount: service.price }
  );
  return appt;
}

/** Change a booking's status — confirm, decline, cancel, complete, no-show */
export async function updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<void> {
  const before = cache.appointments.find((a) => a.id === id);
  if (!before) return;
  const role = currentUser()?.role;
  const by: Appointment['cancelled_by'] =
    status === 'cancelled' ? (role === 'admin' ? 'admin' : role === 'stylist' ? 'barber' : 'client') : null;
  const patch = { status, cancelled_by: by, updated_at: new Date().toISOString() };

  cache.appointments = cache.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a));
  emitChange();
  await write(db().from('appointments').update(patch).eq('id', id));

  const who = currentUser()?.full_name ?? 'Someone';
  const what = describe(before, role !== 'stylist');
  const extra = { stylist_id: before.stylist_id, appointment_id: id };
  if (status === 'booked') logActivity('booking_confirmed', `${who} confirmed ${what}`, extra);
  else if (status === 'completed')
    logActivity('booking_completed', `${who} completed ${what} · ${formatPrice(before.price)}`, { ...extra, amount: before.price });
  else if (status === 'no_show') logActivity('booking_no_show', `No-show: ${what}`, { ...extra, amount: before.price });
  else if (status === 'cancelled')
    logActivity(
      before.status === 'pending' && by !== 'client' ? 'booking_declined' : 'booking_cancelled',
      `${who} ${before.status === 'pending' && by !== 'client' ? 'declined' : 'cancelled'} ${what}`,
      extra
    );
}

/** The client's upcoming (pending/confirmed) bookings, soonest first */
export function getUserUpcoming(userId: string): Appointment[] {
  const today = todayStr();
  return cache.appointments
    .filter((a) => a.user_id === userId && a.date >= today && isActive(a))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** The client's next upcoming booking */
export function getUserActiveFutureBooking(userId: string): Appointment | undefined {
  return getUserUpcoming(userId)[0];
}

/** Has the client reached the shop's "max upcoming bookings" limit? */
export function hasReachedBookingLimit(userId: string): boolean {
  return getUserUpcoming(userId).length >= getSettings().max_upcoming;
}

/**
 * Confirmed bookings whose end time has passed are marked Completed, so the
 * money counts as revenue. Runs whenever a staff member loads/refreshes the
 * app. Barbers can still change a completed visit to No-show afterwards.
 */
let autoCompleting = false;
export async function autoCompletePastBookings(): Promise<number> {
  const role = currentUser()?.role;
  if ((role !== 'admin' && role !== 'stylist') || autoCompleting || !supabase) return 0;
  const now = Date.now();
  const due = cache.appointments.filter(
    (a) => a.status === 'booked' && new Date(`${a.date}T${a.time}:00`).getTime() + a.duration_min * 60000 <= now
  );
  if (due.length === 0) return 0;
  autoCompleting = true;
  try {
    const ids = due.map((a) => a.id);
    const stamp = new Date().toISOString();
    cache.appointments = cache.appointments.map((a) =>
      ids.includes(a.id) ? { ...a, status: 'completed' as const, updated_at: stamp } : a
    );
    emitChange();
    await write(db().from('appointments').update({ status: 'completed', updated_at: stamp }).in('id', ids).eq('status', 'booked'));
    for (const a of due) {
      logActivity('booking_completed', `Completed automatically after it ended: ${describe(a)} · ${formatPrice(a.price)}`, {
        stylist_id: a.stylist_id,
        appointment_id: a.id,
        amount: a.price,
        system: true,
      });
    }
    return due.length;
  } finally {
    autoCompleting = false;
  }
}

/** All of a client's appointments, newest first */
export function getUserAppointments(userId: string): Appointment[] {
  return cache.appointments
    .filter((a) => a.user_id === userId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
}

/** Days since the client's most recent visit (completed or past confirmed) */
export function getDaysSinceLastVisit(userId: string): number | null {
  const today = todayStr();
  const visits = cache.appointments.filter(
    (a) => a.user_id === userId && a.date <= today && (a.status === 'completed' || (a.status === 'booked' && a.date < today))
  );
  if (visits.length === 0) return null;
  const last = visits.reduce((m, a) => (a.date > m ? a.date : m), visits[0].date);
  return daysBetween(last, today);
}

export function getAppointmentsForStylist(stylistId: string, date?: string): Appointment[] {
  return cache.appointments.filter((a) => a.stylist_id === stylistId && (!date || a.date === date));
}

// ============================================================
// BLOCKED TIME (breaks, days off)
// ============================================================

export interface Range {
  start: number; // minutes since midnight
  end: number;
}

export function blockRange(b: BlockedSlot): Range {
  const start = toMin(b.time!);
  return { start, end: b.end_time ? toMin(b.end_time) : start + 30 };
}

/** Time blocks (not whole days) for a barber on a date, earliest first */
export function getBlocks(stylistId: string, date: string): BlockedSlot[] {
  return cache.blocked_slots
    .filter((b) => b.stylist_id === stylistId && b.date === date && b.time !== null)
    .sort((a, b) => toMin(a.time!) - toMin(b.time!));
}

/** Blocked time with touching/overlapping ranges merged (19:00–19:30 + 19:30–20:00 → 19:00–20:00) */
export interface MergedBlock extends Range {
  note: string;
  ids: string[];
}

export function getMergedBlocks(stylistId: string, date: string): MergedBlock[] {
  const out: MergedBlock[] = [];
  for (const b of getBlocks(stylistId, date)) {
    const r = blockRange(b);
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      last.ids.push(b.id);
      if (b.note && !last.note.split(' · ').includes(b.note)) last.note = last.note ? `${last.note} · ${b.note}` : b.note;
    } else {
      out.push({ start: r.start, end: r.end, note: b.note, ids: [b.id] });
    }
  }
  return out;
}

/** Reopen a whole merged block (removes every piece it is made of) */
export async function removeBlocks(ids: string[]): Promise<void> {
  const pieces = cache.blocked_slots.filter((x) => ids.includes(x.id) && x.time !== null);
  if (pieces.length === 0) return;
  cache.blocked_slots = cache.blocked_slots.filter((x) => !ids.includes(x.id));
  emitChange();
  await write(db().from('blocked_slots').delete().in('id', ids));
  const ranges = pieces.map(blockRange);
  const first = pieces[0];
  const name = getStylistById(first.stylist_id)?.name ?? 'A barber';
  logActivity(
    'time_unblocked',
    `${name} reopened ${fromMin(Math.min(...ranges.map((r) => r.start)))}–${fromMin(Math.max(...ranges.map((r) => r.end)))} on ${formatShortDate(first.date)}`,
    { stylist_id: first.stylist_id }
  );
}

export function isDayOff(stylistId: string, date: string): boolean {
  return cache.blocked_slots.some((b) => b.stylist_id === stylistId && b.date === date && b.time === null);
}

export async function addBlock(stylistId: string, date: string, start: string, end: string, note: string): Promise<void> {
  const row: BlockedSlot = { id: newId('b'), stylist_id: stylistId, date, time: start, end_time: end, note: note.trim() };
  cache.blocked_slots = [...cache.blocked_slots, row];
  emitChange();
  await write(db().from('blocked_slots').insert(row));
  const name = getStylistById(stylistId)?.name ?? 'A barber';
  logActivity('time_blocked', `${name} blocked ${start}–${end} on ${formatShortDate(date)}${row.note ? ` (${row.note})` : ''}`, {
    stylist_id: stylistId,
  });
}

export async function removeBlock(id: string): Promise<void> {
  const b = cache.blocked_slots.find((x) => x.id === id);
  cache.blocked_slots = cache.blocked_slots.filter((x) => x.id !== id);
  emitChange();
  await write(db().from('blocked_slots').delete().eq('id', id));
  if (b?.time) {
    const r = blockRange(b);
    const name = getStylistById(b.stylist_id)?.name ?? 'A barber';
    logActivity('time_unblocked', `${name} reopened ${fromMin(r.start)}–${fromMin(r.end)} on ${formatShortDate(b.date)}`, {
      stylist_id: b.stylist_id,
    });
  }
}

export async function setDayOff(stylistId: string, date: string, off: boolean): Promise<void> {
  const name = getStylistById(stylistId)?.name ?? 'A barber';
  if (off) {
    if (isDayOff(stylistId, date)) return;
    const row: BlockedSlot = { id: newId('b'), stylist_id: stylistId, date, time: null, end_time: null, note: '' };
    cache.blocked_slots = [...cache.blocked_slots, row];
    emitChange();
    await write(db().from('blocked_slots').insert(row));
    logActivity('day_off', `${name} took ${formatShortDate(date)} off`, { stylist_id: stylistId });
  } else {
    cache.blocked_slots = cache.blocked_slots.filter(
      (b) => !(b.stylist_id === stylistId && b.date === date && b.time === null)
    );
    emitChange();
    await write(db().from('blocked_slots').delete().eq('stylist_id', stylistId).eq('date', date).is('time', null));
    logActivity('day_on', `${name} is working again on ${formatShortDate(date)}`, { stylist_id: stylistId });
  }
}

// ============================================================
// AVAILABILITY — works for any service length
// ============================================================

/** Busy ranges for a barber on a date (active bookings + blocked time) */
export function getBusyRanges(stylistId: string, date: string): Range[] {
  const appts = cache.appointments
    .filter((a) => a.stylist_id === stylistId && a.date === date && isActive(a))
    .map((a) => ({ start: toMin(a.time), end: toMin(a.time) + a.duration_min }));
  return [...appts, ...getBlocks(stylistId, date).map(blockRange)];
}

/** Last date clients may book (booking window) */
export function lastBookableDate(): string {
  return addDays(todayStr(), getSettings().booking_window_days - 1);
}

/**
 * Every start time where a service of `duration` minutes fits:
 * inside opening hours, not overlapping bookings/breaks, respecting the
 * minimum notice. Start times follow the shop's interval, plus the end of
 * each booking/break so appointments can sit back-to-back.
 */
export function getAvailableStarts(stylistId: string, date: string, duration: number): string[] {
  const settings = getSettings();
  const hours = getHoursFor(date);
  if (!hours || isDayOff(stylistId, date) || date > lastBookableDate()) return [];

  const earliest = new Date(Date.now() + settings.min_notice_min * 60000);
  const earliestDate = toDateStr(earliest);
  if (date < earliestDate) return [];
  const minStart = date === earliestDate ? earliest.getHours() * 60 + earliest.getMinutes() + 1 : 0;

  const open = toMin(hours.open);
  const close = toMin(hours.close);
  const busy = getBusyRanges(stylistId, date);

  const candidates = new Set<number>();
  for (let t = open; t + duration <= close; t += settings.slot_interval) candidates.add(t);
  for (const b of busy) if (b.end >= open && b.end + duration <= close) candidates.add(b.end);
  // Walk-ins: today, also offer the next 5-minute mark (e.g. 10:05 when it's 10:01)
  if (date === toDateStr(new Date()) && settings.min_notice_min === 0) {
    const soon = Math.ceil(minStart / 5) * 5;
    if (soon >= open && soon + duration <= close) candidates.add(soon);
  }

  return [...candidates]
    .filter((t) => t >= minStart && busy.every((b) => t + duration <= b.start || t >= b.end))
    .sort((a, b) => a - b)
    .map(fromMin);
}

/** "Any barber": every start time at which at least one active barber is free */
export function getAnyBarberStarts(date: string, duration: number): string[] {
  const all = new Set<string>();
  for (const s of getStylists()) for (const t of getAvailableStarts(s.id, date, duration)) all.add(t);
  return [...all].sort();
}

/** "Any barber": the first barber (in team order) who is free at that time */
export function firstFreeBarber(date: string, time: string, duration: number): Stylist | undefined {
  return getStylists().find((s) => getAvailableStarts(s.id, date, duration).includes(time));
}

/** First free date & time for a barber (within the booking window) */
export function nextAvailable(stylistId: string, duration: number): { date: string; time: string } | null {
  const today = todayStr();
  const days = getSettings().booking_window_days;
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const starts = getAvailableStarts(stylistId, date, duration);
    if (starts.length) return { date, time: starts[0] };
  }
  return null;
}
