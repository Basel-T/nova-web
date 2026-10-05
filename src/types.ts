// ============================================================
// types.ts — All TypeScript interfaces for the Barbershop App
// ============================================================
// Field names match the Supabase table columns (see supabase/schema.sql).

/**
 * User — Represents any person who logs in.
 * - role 'client': regular customer who books appointments
 * - role 'stylist': barber who manages their own schedule
 * - role 'admin': shop owner/manager who sees everything
 */
export interface User {
  id: string;
  full_name: string;
  mobile_number: string;
  role: 'client' | 'stylist' | 'admin';
}

/**
 * Stylist — A barber available for booking.
 * Separate from User so we can store barber-specific data like a title.
 * Each barber also has a matching User record with role='stylist'.
 */
export interface Stylist {
  id: string;
  name: string;
  mobile_number: string;
  title: string;         // e.g. "Master Barber", "Fade Specialist"
  image: string | null;  // Optional photo URL — initials avatar is shown if empty
}

/**
 * Service — Something a client can book (haircut, beard trim...).
 * duration_min must be a multiple of 30 (one time slot = 30 minutes).
 */
export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_min: number;
  icon: string;          // Emoji shown on the service card
  active: boolean;       // Inactive services are hidden from clients
  sort: number;          // Display order
}

/**
 * Appointment — A booking linking a client to a barber, a service and a time.
 * Status flow:
 *   pending → booked (barber accepted) → completed (after the visit)
 *   pending → cancelled (barber rejected or client cancelled)
 */
export interface Appointment {
  id: string;
  user_id: string;       // References User.id (the client)
  stylist_id: string;    // References Stylist.id
  service_id: string;    // References Service.id
  service_name: string;  // Snapshot so history survives service edits
  price: number;         // Snapshot of the price at booking time
  duration_min: number;  // Snapshot of the duration at booking time
  date: string;          // YYYY-MM-DD format (local date)
  time: string;          // HH:MM format (24-hour)
  status: 'pending' | 'booked' | 'completed' | 'cancelled';
  created_at?: string;
}

/**
 * BlockedSlot — A time slot or entire day blocked by a barber.
 * If time is null, the entire day is blocked.
 * If time is a specific HH:MM, only that 30-min slot is blocked.
 */
export interface BlockedSlot {
  id: string;
  stylist_id: string;    // References Stylist.id
  date: string;          // YYYY-MM-DD format
  time: string | null;   // HH:MM or null (null = whole day blocked)
}
