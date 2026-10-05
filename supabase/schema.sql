-- ============================================================
-- Blade & Fade Barbershop — Supabase database setup
-- ============================================================
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only creates what is missing.
--
-- PROTOTYPE NOTE: login is by mobile number only (no passwords), so the
-- policies below let the public (anon) key read and write every table.
-- That is fine for a demo, but not for real customer data.
-- ============================================================

create table if not exists public.users (
  id            text primary key,
  full_name     text not null,
  mobile_number text not null unique,
  role          text not null default 'client' check (role in ('client','stylist','admin')),
  created_at    timestamptz not null default now()
);

create table if not exists public.stylists (
  id            text primary key,
  name          text not null,
  mobile_number text not null unique,
  title         text not null default 'Barber',
  image         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.services (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  price        numeric(10,2) not null default 0,
  duration_min int not null default 30 check (duration_min > 0 and duration_min % 30 = 0),
  icon         text not null default '✂️',
  active       boolean not null default true,
  sort         int not null default 0
);

create table if not exists public.appointments (
  id           text primary key,
  user_id      text not null,
  stylist_id   text not null,
  service_id   text not null,
  service_name text not null,
  price        numeric(10,2) not null default 0,
  duration_min int not null default 30,
  date         text not null,  -- YYYY-MM-DD
  time         text not null,  -- HH:MM
  status       text not null default 'pending' check (status in ('pending','booked','completed','cancelled')),
  created_at   timestamptz not null default now()
);

-- Two active bookings can never start at the same time with the same barber
create unique index if not exists appointments_no_double_booking
  on public.appointments (stylist_id, date, time)
  where status in ('pending','booked');

create table if not exists public.blocked_slots (
  id         text primary key,
  stylist_id text not null,
  date       text not null,
  time       text  -- null = whole day
);

-- ---------- Row Level Security (open for the prototype) ----------
do $$
declare t text;
begin
  foreach t in array array['users','stylists','services','appointments','blocked_slots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "prototype open access" on public.%I', t);
    execute format('create policy "prototype open access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Realtime: push changes to every open phone ----------
do $$
declare t text;
begin
  foreach t in array array['users','stylists','services','appointments','blocked_slots'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Demo data ----------
insert into public.users (id, full_name, mobile_number, role) values
  ('u-admin', 'Shop Admin',  '0000000000', 'admin'),
  ('u-s1',    'Marcus Cole', '1111111111', 'stylist'),
  ('u-s2',    'Leo Vargas',  '2222222222', 'stylist'),
  ('u-s3',    'Omar Haddad', '3333333333', 'stylist')
on conflict (id) do nothing;

insert into public.stylists (id, name, mobile_number, title) values
  ('s1', 'Marcus Cole', '1111111111', 'Master Barber'),
  ('s2', 'Leo Vargas',  '2222222222', 'Fade Specialist'),
  ('s3', 'Omar Haddad', '3333333333', 'Beard & Shave Expert')
on conflict (id) do nothing;

insert into public.services (id, name, description, price, duration_min, icon, sort) values
  ('svc-haircut', 'Classic Haircut',    'Scissor or clipper cut, styled to finish',        25, 30, '✂️', 1),
  ('svc-fade',    'Skin Fade',          'Clean skin/low/mid/high fade with sharp lineup',   30, 30, '💈', 2),
  ('svc-beard',   'Beard Trim & Shape', 'Beard sculpt, line-up and hot towel finish',       15, 30, '🧔', 3),
  ('svc-combo',   'Haircut + Beard',    'Full haircut plus beard trim and shape',           40, 60, '🔥', 4),
  ('svc-shave',   'Hot Towel Shave',    'Traditional straight-razor shave with hot towels', 30, 30, '🪒', 5),
  ('svc-kids',    'Kids Cut (under 12)','Haircut for the young gentlemen',                 18, 30, '👦', 6)
on conflict (id) do nothing;
