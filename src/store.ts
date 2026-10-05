// ============================================================
// store.ts — Cloud Database Layer (Supabase)
// ============================================================
// All shared data lives in a Supabase (Postgres) database in the cloud,
// so every phone sees the same bookings — no matter whose PC is on.
//
// How it works:
//   1. On app load we download every table into an in-memory cache.
//   2. Pages read from the cache synchronously (fast, simple code).
//   3. Writes update the cache instantly, then save to Supabase.
//   4. Supabase Realtime pushes other people's changes to us, and we
//      also re-sync every 20 seconds as a safety net.
//   5. useStoreVersion() lets React pages re-render on any change.
//
// Only the "who is logged in on this phone" session stays in LocalStorage.
// ============================================================

import { useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { User, Stylist, Service, Appointment, BlockedSlot } from './types';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const SESSION_KEY = 'barber_current_user';

// --- In-memory cache of every table ---
interface Cache {
  users: User[];
  stylists: Stylist[];
  services: Service[];
  appointments: Appointment[];
  blocked_slots: BlockedSlot[];
}
type TableName = keyof Cache;
const TABLES: TableName[] = ['users', 'stylists', 'services', 'appointments', 'blocked_slots'];

const cache: Cache = {
  users: [],
  stylists: [],
  services: [],
  appointments: [],
  blocked_slots: [],
};

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
// SYNC — download tables and listen for live changes
// ============================================================

function db() {
  if (!supabase) throw new Error('Supabase is not configured (see src/config.ts)');
  return supabase;
}

/** Postgres numeric columns arrive as strings — convert them to numbers */
function normalize(table: TableName, rows: any[]): any[] {
  if (table === 'services' || table === 'appointments') {
    return rows.map((r) => ({ ...r, price: Number(r.price), duration_min: Number(r.duration_min) }));
  }
  return rows;
}

async function fetchTable(table: TableName): Promise<void> {
  const { data, error } = await db().from(table).select('*');
  if (error) throw new Error(error.message);
  (cache as any)[table] = normalize(table, data ?? []);
}

/** Re-download every table from the cloud */
export async function refreshAll(): Promise<void> {
  await Promise.all(TABLES.map(fetchTable));
  emitChange();
}

let initialized = false;

/**
 * Call once when the app loads.
 * Downloads all data and starts listening for live updates.
 */
export async function initializeStore(): Promise<void> {
  await refreshAll();
  if (initialized) return;
  initialized = true;

  // Live updates: whenever anyone changes a table, re-fetch that table
  db()
    .channel('barbershop-db')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      const table = payload.table as TableName;
      if (TABLES.includes(table)) {
        fetchTable(table).then(emitChange).catch(console.error);
      }
    })
    .subscribe();

  // Safety net: periodic re-sync and re-sync when the phone wakes up
  setInterval(() => refreshAll().catch(console.error), 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll().catch(console.error);
  });
}

/** Run a Supabase write; on failure re-sync the cache and throw */
async function write(op: PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<void> {
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
// USER OPERATIONS
// ============================================================

export function getUsers(): User[] {
  return cache.users;
}

export function getUserByMobile(mobile: string): User | undefined {
  return cache.users.find((u) => u.mobile_number === mobile);
}

export function getUserById(id: string): User | undefined {
  return cache.users.find((u) => u.id === id);
}

/** Look up a mobile number directly in the cloud (always fresh, used for login) */
export async function findUserByMobile(mobile: string): Promise<User | undefined> {
  const { data, error } = await db().from('users').select('*').eq('mobile_number', mobile).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? undefined;
}

/** Create a new client account */
export async function addUser(fullName: string, mobile: string): Promise<User> {
  const newUser: User = {
    id: newId('u'),
    full_name: fullName,
    mobile_number: mobile,
    role: 'client',
  };
  try {
    await write(db().from('users').insert(newUser));
  } catch (e) {
    // Someone registered this number a moment ago → just log in as them
    const existing = await findUserByMobile(mobile);
    if (existing) return existing;
    throw e;
  }
  cache.users = [...cache.users, newUser];
  emitChange();
  return newUser;
}

// ============================================================
// SESSION MANAGEMENT — per-phone login (LocalStorage)
// ============================================================

export function getCurrentUser(): User | null {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: User): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* private mode — session just won't persist */
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// ============================================================
// BARBER (STYLIST) OPERATIONS
// ============================================================

export function getStylists(): Stylist[] {
  return [...cache.stylists].sort((a, b) => a.name.localeCompare(b.name));
}

export function getStylistById(id: string): Stylist | undefined {
  return cache.stylists.find((s) => s.id === id);
}

export function getStylistByMobile(mobile: string): Stylist | undefined {
  return cache.stylists.find((s) => s.mobile_number === mobile);
}

/**
 * Admin: add a barber. Creates the Stylist record and makes sure a User
 * with role 'stylist' exists for that mobile number (so they can log in).
 */
export async function addStylist(name: string, mobile: string, title: string): Promise<void> {
  const stylist: Stylist = { id: newId('s'), name, mobile_number: mobile, title, image: null };
  await write(db().from('stylists').insert(stylist));

  const existing = await findUserByMobile(mobile);
  if (existing) {
    await write(db().from('users').update({ role: 'stylist', full_name: name }).eq('id', existing.id));
  } else {
    await write(
      db().from('users').insert({ id: newId('u'), full_name: name, mobile_number: mobile, role: 'stylist' })
    );
  }
  await refreshAll();
}

/** Admin: remove a barber. Their login becomes a normal client account. */
export async function removeStylist(id: string): Promise<void> {
  const stylist = getStylistById(id);
  if (!stylist) return;
  await write(db().from('stylists').delete().eq('id', id));
  await write(db().from('users').update({ role: 'client' }).eq('mobile_number', stylist.mobile_number));
  await refreshAll();
}

// ============================================================
// SERVICE OPERATIONS
// ============================================================

/** All services sorted by display order (pass true to include hidden ones) */
export function getServices(includeInactive = false): Service[] {
  return cache.services
    .filter((s) => includeInactive || s.active)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function getServiceById(id: string): Service | undefined {
  return cache.services.find((s) => s.id === id);
}

export async function saveService(service: Omit<Service, 'id'> & { id?: string }): Promise<void> {
  const row: Service = { ...service, id: service.id || newId('svc') };
  const others = cache.services.filter((s) => s.id !== row.id);
  cache.services = [...others, row];
  emitChange();
  await write(db().from('services').upsert(row));
}

export async function deleteService(id: string): Promise<void> {
  cache.services = cache.services.filter((s) => s.id !== id);
  emitChange();
  await write(db().from('services').delete().eq('id', id));
}

// ============================================================
// APPOINTMENT OPERATIONS
// ============================================================

export function getAppointments(): Appointment[] {
  return cache.appointments;
}

const isActive = (a: Appointment) => a.status === 'pending' || a.status === 'booked';

/**
 * Create a new appointment (status 'pending' until the barber accepts).
 * Re-checks availability against the cloud first, so two people can't
 * grab the same slot. Throws Error('SLOT_TAKEN') if it's gone.
 */
export async function addAppointment(
  userId: string,
  stylistId: string,
  serviceId: string,
  date: string,
  time: string
): Promise<Appointment> {
  const service = getServiceById(serviceId);
  if (!service) throw new Error('Service not found');

  // Fresh data from the cloud before deciding
  await fetchTable('appointments');
  await fetchTable('blocked_slots');
  if (!canStartAt(stylistId, date, time, service.duration_min)) {
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
    status: 'pending',
  };
  try {
    await write(db().from('appointments').insert(appt));
  } catch (e) {
    // Unique index violation = someone booked that exact start time first
    if ((e as { code?: string }).code === '23505') throw new Error('SLOT_TAKEN');
    throw e;
  }
  cache.appointments = [...cache.appointments, appt];
  emitChange();
  return appt;
}

/** Change an appointment's status (accept / reject / cancel / complete) */
export async function updateAppointmentStatus(id: string, status: Appointment['status']): Promise<void> {
  cache.appointments = cache.appointments.map((a) => (a.id === id ? { ...a, status } : a));
  emitChange();
  await write(db().from('appointments').update({ status }).eq('id', id));
}

/** The client's single upcoming (pending/booked, today or later) booking */
export function getUserActiveFutureBooking(userId: string): Appointment | undefined {
  const today = todayStr();
  return cache.appointments.find((a) => a.user_id === userId && a.date >= today && isActive(a));
}

/** All of a client's appointments, newest first */
export function getUserAppointments(userId: string): Appointment[] {
  return cache.appointments
    .filter((a) => a.user_id === userId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
}

/** All appointments for a barber, optionally on one date */
export function getAppointmentsForStylist(stylistId: string, date?: string): Appointment[] {
  return cache.appointments.filter((a) => a.stylist_id === stylistId && (!date || a.date === date));
}

// ============================================================
// TIME SLOTS & AVAILABILITY
// ============================================================

/** 30-minute slots from 10:00 to 19:30 (shop closes at 20:00) */
export const TIME_SLOTS: string[] = [
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30',
];
export const SLOT_MINUTES = 30;

/** Every 30-min slot an appointment occupies (a 60-min cut takes two) */
function slotsCovered(time: string, durationMin: number): string[] {
  const start = TIME_SLOTS.indexOf(time);
  if (start === -1) return [time];
  return TIME_SLOTS.slice(start, start + Math.ceil(durationMin / SLOT_MINUTES));
}

/** Slots already taken by active appointments for a barber on a date */
export function getBookedSlotsForStylist(stylistId: string, date: string): string[] {
  return cache.appointments
    .filter((a) => a.stylist_id === stylistId && a.date === date && isActive(a))
    .flatMap((a) => slotsCovered(a.time, a.duration_min));
}

/** True if this start time is already in the past (only matters for today) */
export function isPastSlot(date: string, time: string): boolean {
  if (date !== todayStr()) return date < todayStr();
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return time <= nowStr;
}

/** Can a service of this length start here? (all covered slots free, inside hours) */
export function canStartAt(stylistId: string, date: string, time: string, durationMin: number): boolean {
  const start = TIME_SLOTS.indexOf(time);
  const needed = Math.ceil(durationMin / SLOT_MINUTES);
  if (start === -1 || start + needed > TIME_SLOTS.length) return false;
  if (isPastSlot(date, time) || isDayBlocked(stylistId, date)) return false;
  const booked = getBookedSlotsForStylist(stylistId, date);
  return TIME_SLOTS.slice(start, start + needed).every(
    (slot) => !booked.includes(slot) && !isSlotBlocked(stylistId, date, slot)
  );
}

// ============================================================
// BLOCKED SLOTS — barber schedule management
// ============================================================

export function getBlockedSlotsForStylist(stylistId: string, date: string): BlockedSlot[] {
  return cache.blocked_slots.filter((b) => b.stylist_id === stylistId && b.date === date);
}

export function isSlotBlocked(stylistId: string, date: string, time: string): boolean {
  return getBlockedSlotsForStylist(stylistId, date).some((b) => b.time === null || b.time === time);
}

export function isDayBlocked(stylistId: string, date: string): boolean {
  return getBlockedSlotsForStylist(stylistId, date).some((b) => b.time === null);
}

/** Block a time slot, or the whole day when time is null */
export async function blockSlot(stylistId: string, date: string, time: string | null): Promise<void> {
  const exists = cache.blocked_slots.some(
    (b) => b.stylist_id === stylistId && b.date === date && b.time === time
  );
  if (exists) return;
  const row: BlockedSlot = { id: newId('b'), stylist_id: stylistId, date, time };
  cache.blocked_slots = [...cache.blocked_slots, row];
  emitChange();
  await write(db().from('blocked_slots').insert(row));
}

/** Unblock one specific time slot */
export async function unblockSlot(stylistId: string, date: string, time: string): Promise<void> {
  cache.blocked_slots = cache.blocked_slots.filter(
    (b) => !(b.stylist_id === stylistId && b.date === date && b.time === time)
  );
  emitChange();
  await write(
    db().from('blocked_slots').delete().eq('stylist_id', stylistId).eq('date', date).eq('time', time)
  );
}

/** Unblock a whole day — removes every block for that barber on that date */
export async function unblockDay(stylistId: string, date: string): Promise<void> {
  cache.blocked_slots = cache.blocked_slots.filter((b) => !(b.stylist_id === stylistId && b.date === date));
  emitChange();
  await write(db().from('blocked_slots').delete().eq('stylist_id', stylistId).eq('date', date));
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/** Local YYYY-MM-DD (not UTC, so the date is right in every timezone) */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

/** "Monday, October 6" */
export function formatLongDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** "Mon, Oct 6" */
export function formatShortDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPrice(price: number): string {
  return '$' + (Number.isInteger(price) ? price : price.toFixed(2));
}

/** Days since the client's most recent past (non-cancelled) visit */
export function getDaysSinceLastAppointment(userId: string): number | null {
  const today = todayStr();
  const past = cache.appointments
    .filter((a) => a.user_id === userId && a.date < today && a.status !== 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date));
  if (past.length === 0) return null;
  const diffMs = new Date(today + 'T00:00:00').getTime() - new Date(past[0].date + 'T00:00:00').getTime();
  return Math.round(diffMs / 86400000);
}

/** The next N days for the date scroller */
export function generateDates(
  count: number = 30
): { date: string; dayName: string; dayNum: number; month: string; isToday: boolean }[] {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    return {
      date: toDateStr(d),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      isToday: i === 0,
    };
  });
}
