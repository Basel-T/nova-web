// ============================================================
// types.ts — All TypeScript interfaces for the Barbershop App
// ============================================================
// Field names match the Supabase table columns
// (supabase/schema.sql + supabase/update-2.sql).

export type Role = 'client' | 'stylist' | 'admin';

/**
 * User — anyone who logs in.
 * - 'client': customer who books appointments (no password)
 * - 'stylist': barber who manages their own schedule (password)
 * - 'admin': shop owner/manager who controls everything (password)
 */
export interface User {
  id: string;
  full_name: string;
  mobile_number: string;
  role: Role;
  created_at?: string;
}

/** A barber. Each barber also has a matching User with role 'stylist'. */
export interface Stylist {
  id: string;
  name: string;
  mobile_number: string;
  title: string;          // e.g. "Fade Specialist"
  image: string | null;   // Public photo URL (uploaded by the admin)
  bio: string;
  sort: number;           // Display order
  active: boolean;        // false = paused, hidden from clients
  created_at?: string;
}

/** Something a client can book. duration_min can be any length (5–600). */
export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_min: number;
  icon: string;
  active: boolean;        // false = hidden from clients
  sort: number;
}

export type AppointmentStatus = 'pending' | 'booked' | 'completed' | 'cancelled' | 'no_show';

/**
 * Appointment status flow:
 *   pending → booked (barber confirmed) → completed / no_show
 *   pending → cancelled (declined)   booked → cancelled (cancelled)
 */
export interface Appointment {
  id: string;
  user_id: string;
  stylist_id: string;
  service_id: string;
  service_name: string;   // Snapshot so history survives service edits
  price: number;          // Snapshot of the price at booking time
  duration_min: number;   // Snapshot of the duration at booking time
  date: string;           // YYYY-MM-DD (local)
  time: string;           // HH:MM (24h)
  status: AppointmentStatus;
  client_note: string;
  cancelled_by: 'client' | 'barber' | 'admin' | null;
  created_at?: string;
  updated_at?: string | null;
}

/**
 * Blocked time for a barber.
 *   time = null              → whole day off
 *   time + end_time          → blocked range, e.g. 13:00–14:00
 *   time without end_time    → 30 minutes (older rows)
 */
export interface BlockedSlot {
  id: string;
  stylist_id: string;
  date: string;
  time: string | null;
  end_time: string | null;
  note: string;
}

export interface DayHours {
  open: string;   // HH:MM
  close: string;  // HH:MM
}

/** Shop-wide settings (single row, edited by the admin) */
export interface Settings {
  id: string;
  shop_name: string;
  tagline: string;
  address: string;
  phone: string;
  currency: string;
  hours: Record<string, DayHours | null>;  // key = weekday (0 = Sunday), null = closed
  slot_interval: number;                   // minutes between offered start times
  booking_window_days: number;             // how far ahead clients can book
  min_notice_min: number;                  // minimum notice before a booking
  auto_confirm: boolean;                   // true = skip the barber's approval
}

/** One entry in the shop's activity log */
export interface ActivityEvent {
  id: string;
  created_at: string;
  type: string;
  message: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  stylist_id: string | null;
  appointment_id: string | null;
  amount: number | null;
}
