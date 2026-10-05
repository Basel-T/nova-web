-- ============================================================
-- Blade & Fade — Update 2
-- Staff passwords, any service duration, barber photos,
-- shop settings, activity log (analytics), no-show status.
-- ============================================================
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Supabase may warn about "destructive operations" (it drops and
-- re-creates a few constraints/policies) — that is expected, click Run.
-- Safe to run more than once.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ---------- Services: any duration from 5 minutes to 10 hours ----------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.services'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%duration_min%'
  loop
    execute format('alter table public.services drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.services
  add constraint services_duration_min_check check (duration_min between 5 and 600);

-- ---------- Barbers: bio, display order, "taking bookings" switch ----------
alter table public.stylists add column if not exists bio    text    not null default '';
alter table public.stylists add column if not exists sort   int     not null default 0;
alter table public.stylists add column if not exists active boolean not null default true;

-- ---------- Appointments: no-show status, client note, audit fields ----------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.appointments'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.appointments drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('pending', 'booked', 'completed', 'cancelled', 'no_show'));
alter table public.appointments add column if not exists client_note  text not null default '';
alter table public.appointments add column if not exists cancelled_by text;          -- client | barber | admin
alter table public.appointments add column if not exists updated_at   timestamptz;

-- ---------- Blocked time: real ranges (13:00–14:00) with a note ----------
alter table public.blocked_slots add column if not exists end_time   text;            -- HH:MM, null = 30 min (old rows)
alter table public.blocked_slots add column if not exists note       text not null default '';
alter table public.blocked_slots add column if not exists created_at timestamptz not null default now();

-- ---------- Shop settings (a single row, edited by the admin) ----------
create table if not exists public.settings (
  id                  text primary key default 'shop',
  shop_name           text not null default 'Blade & Fade',
  tagline             text not null default 'Barbershop',
  address             text not null default '12 Main Street',
  phone               text not null default '',
  currency            text not null default '$',
  hours               jsonb not null default '{
    "0": {"open": "10:00", "close": "20:00"},
    "1": {"open": "10:00", "close": "20:00"},
    "2": {"open": "10:00", "close": "20:00"},
    "3": {"open": "10:00", "close": "20:00"},
    "4": {"open": "10:00", "close": "20:00"},
    "5": {"open": "10:00", "close": "20:00"},
    "6": {"open": "10:00", "close": "20:00"}
  }'::jsonb,                                          -- key = weekday (0 = Sunday), null = closed
  slot_interval       int not null default 15 check (slot_interval between 5 and 120),
  booking_window_days int not null default 30 check (booking_window_days between 1 and 365),
  min_notice_min      int not null default 0  check (min_notice_min between 0 and 2880),
  auto_confirm        boolean not null default false,
  updated_at          timestamptz not null default now()
);
insert into public.settings (id) values ('shop') on conflict (id) do nothing;

-- ---------- Activity log: everything that happens in the shop ----------
create table if not exists public.activity_log (
  id             text primary key default gen_random_uuid()::text,
  created_at     timestamptz not null default now(),
  type           text not null,
  message        text not null,
  actor_id       text,
  actor_name     text,
  actor_role     text,
  stylist_id     text,
  appointment_id text,
  amount         numeric(10,2)
);
create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);

-- ---------- Open prototype access + realtime for the new tables ----------
do $$
declare t text;
begin
  foreach t in array array['settings', 'activity_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "prototype open access" on public.%I', t);
    execute format('create policy "prototype open access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Staff passwords (hidden: the public key cannot read these) ----------
create table if not exists public.staff_credentials (
  user_id       text primary key references public.users(id) on delete cascade,
  password_hash text not null,
  updated_at    timestamptz not null default now()
);
create table if not exists public.staff_sessions (
  token      text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.staff_credentials enable row level security;
alter table public.staff_sessions    enable row level security;
revoke all on public.staff_credentials from anon, authenticated;
revoke all on public.staff_sessions    from anon, authenticated;

-- Check a staff member's password; returns {token, user} or null
create or replace function public.staff_login(p_mobile text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user  public.users;
  v_token text;
begin
  select u.* into v_user
  from public.users u
  join public.staff_credentials c on c.user_id = u.id
  where u.mobile_number = p_mobile
    and u.role in ('admin', 'stylist')
    and c.password_hash = crypt(p_password, c.password_hash);

  if not found then
    perform pg_sleep(0.4);  -- slows down password guessing
    return null;
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.staff_sessions (token, user_id) values (v_token, v_user.id);
  return json_build_object('token', v_token, 'user', row_to_json(v_user));
end $$;

-- Which staff user does this session token belong to? (null = invalid/expired)
create or replace function public.staff_session_user(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id
  from public.staff_sessions s
  join public.users u on u.id = s.user_id
  where s.token = p_token
    and u.role in ('admin', 'stylist')
    and s.created_at > now() - interval '90 days'
$$;

create or replace function public.staff_logout(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.staff_sessions where token = p_token
$$;

-- Admin sets (or resets) any staff member's password
create or replace function public.admin_set_staff_password(p_token text, p_user_id text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1
    from public.staff_sessions s
    join public.users u on u.id = s.user_id
    where s.token = p_token
      and u.role = 'admin'
      and s.created_at > now() - interval '90 days'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if length(coalesce(p_password, '')) < 3 then
    raise exception 'Password must be at least 3 characters';
  end if;

  insert into public.staff_credentials (user_id, password_hash, updated_at)
  values (p_user_id, crypt(p_password, gen_salt('bf')), now())
  on conflict (user_id) do update
    set password_hash = excluded.password_hash, updated_at = now();

  -- Sign that person out on other devices so the new password applies
  delete from public.staff_sessions where user_id = p_user_id and token <> p_token;
  return true;
end $$;

revoke all on function public.staff_login(text, text)                     from public;
revoke all on function public.staff_session_user(text)                    from public;
revoke all on function public.staff_logout(text)                          from public;
revoke all on function public.admin_set_staff_password(text, text, text)  from public;
grant execute on function public.staff_login(text, text)                    to anon, authenticated;
grant execute on function public.staff_session_user(text)                   to anon, authenticated;
grant execute on function public.staff_logout(text)                         to anon, authenticated;
grant execute on function public.admin_set_staff_password(text, text, text) to anon, authenticated;

-- Default passwords: admin 000, Marcus 111, Leo 222, Omar 333
insert into public.staff_credentials (user_id, password_hash)
select v.user_id, crypt(v.pw, gen_salt('bf'))
from (values ('u-admin', '000'), ('u-s1', '111'), ('u-s2', '222'), ('u-s3', '333')) as v(user_id, pw)
where exists (select 1 from public.users u where u.id = v.user_id)
on conflict (user_id) do nothing;

-- ---------- Race-safe double-booking guard (works for any duration) ----------
create or replace function public.appointments_prevent_overlap()
returns trigger
language plpgsql
as $$
declare
  v_start int;
  v_end   int;
begin
  if new.status not in ('pending', 'booked') then
    return new;
  end if;

  v_start := split_part(new.time, ':', 1)::int * 60 + split_part(new.time, ':', 2)::int;
  v_end   := v_start + new.duration_min;

  -- One booking at a time per barber per day, so two phones can't both win
  perform pg_advisory_xact_lock(hashtext(new.stylist_id || '|' || new.date));

  if exists (
    select 1 from public.appointments a
    where a.stylist_id = new.stylist_id
      and a.date = new.date
      and a.id <> new.id
      and a.status in ('pending', 'booked')
      and (split_part(a.time, ':', 1)::int * 60 + split_part(a.time, ':', 2)::int) < v_end
      and (split_part(a.time, ':', 1)::int * 60 + split_part(a.time, ':', 2)::int) + a.duration_min > v_start
  ) then
    raise exception 'SLOT_TAKEN' using errcode = '23505';
  end if;

  return new;
end $$;

drop trigger if exists appointments_prevent_overlap on public.appointments;
create trigger appointments_prevent_overlap
  before insert on public.appointments
  for each row execute function public.appointments_prevent_overlap();

-- ---------- Barber photo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('barber-photos', 'barber-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "barber photos read" on storage.objects;
create policy "barber photos read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'barber-photos');

drop policy if exists "barber photos upload" on storage.objects;
create policy "barber photos upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'barber-photos');

drop policy if exists "barber photos update" on storage.objects;
create policy "barber photos update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'barber-photos') with check (bucket_id = 'barber-photos');

drop policy if exists "barber photos delete" on storage.objects;
create policy "barber photos delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'barber-photos');

-- ---------- Demo content refresh (only touches untouched demo rows) ----------
update public.stylists set sort = 1, bio = 'Fifteen years behind the chair. Classic cuts, sharp tapers and old-school service.'
  where id = 's1' and bio = '';
update public.stylists set sort = 2, bio = 'Skin fades, burst fades and modern textured crops.'
  where id = 's2' and bio = '';
update public.stylists set sort = 3, bio = 'Hot-towel shaves, beard sculpting and razor-sharp line-ups.'
  where id = 's3' and bio = '';

update public.services set duration_min = 45 where id = 'svc-fade'  and duration_min = 30;
update public.services set duration_min = 20 where id = 'svc-beard' and duration_min = 30;
update public.services set duration_min = 25 where id = 'svc-kids'  and duration_min = 30;
insert into public.services (id, name, description, price, duration_min, icon, sort) values
  ('svc-full', 'The Full Experience', 'Haircut, beard sculpt, hot-towel shave and a scalp massage', 65, 90, '👑', 7)
on conflict (id) do nothing;

insert into public.activity_log (type, message, actor_name, actor_role)
select 'system', 'Shop system upgraded — staff passwords, barber photos and analytics enabled', 'System', 'system'
where not exists (select 1 from public.activity_log where type = 'system');
