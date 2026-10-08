-- ============================================================
-- Blade & Fade — Update 3 (demo version)
-- • "Max upcoming bookings per client" setting
-- • A demo client account for the "Try as Client" button
-- • reset_demo(): one-tap "Reset demo" for the admin
-- ============================================================
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once. Requires update-2.sql to have been run.
-- ============================================================

set search_path = public, extensions;

-- ---------- Max upcoming bookings per client (1–3, default 2) ----------
alter table public.settings add column if not exists max_upcoming int not null default 2;
alter table public.settings drop constraint if exists settings_max_upcoming_check;
alter table public.settings add constraint settings_max_upcoming_check check (max_upcoming between 1 and 3);

-- Walk-ins must be able to book a slot that starts in a few minutes
update public.settings set min_notice_min = 0 where id = 'shop';

-- ---------- Demo client (used by "Try as Client") ----------
insert into public.users (id, full_name, mobile_number, role)
values ('u-demo-client', 'Demo Client', '0500000000', 'client')
on conflict (id) do nothing;

-- ---------- Reset demo (admin only) ----------
create or replace function public.reset_demo(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Only a signed-in admin may reset
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

  -- 1. Wipe bookings, blocked time and the activity log
  delete from public.appointments where true;
  delete from public.blocked_slots where true;
  delete from public.activity_log where true;

  -- 2. Remove extra barbers and every account except the demo ones
  delete from public.stylists where id not in ('s1', 's2', 's3');
  delete from public.users where id not in ('u-admin', 'u-s1', 'u-s2', 'u-s3', 'u-demo-client');

  -- 3. Restore the demo accounts (temporary numbers first, so swaps can't clash)
  update public.users set mobile_number = 'tmp-' || id
    where id in ('u-admin', 'u-s1', 'u-s2', 'u-s3', 'u-demo-client');
  update public.stylists set mobile_number = 'tmp-' || id where id in ('s1', 's2', 's3');

  insert into public.users (id, full_name, mobile_number, role) values
    ('u-admin',       'Shop Admin',  '000',        'admin'),
    ('u-s1',          'Marcus Cole', '111',        'stylist'),
    ('u-s2',          'Leo Vargas',  '222',        'stylist'),
    ('u-s3',          'Omar Haddad', '333',        'stylist'),
    ('u-demo-client', 'Demo Client', '0500000000', 'client')
  on conflict (id) do update
    set full_name = excluded.full_name, mobile_number = excluded.mobile_number, role = excluded.role;

  -- Barbers keep any photo the admin uploaded
  insert into public.stylists (id, name, mobile_number, title, bio, sort, active) values
    ('s1', 'Marcus Cole', '111', 'Master Barber',        'Fifteen years behind the chair. Classic cuts, sharp tapers and old-school service.', 1, true),
    ('s2', 'Leo Vargas',  '222', 'Fade Specialist',      'Skin fades, burst fades and modern textured crops.', 2, true),
    ('s3', 'Omar Haddad', '333', 'Beard & Shave Expert', 'Hot-towel shaves, beard sculpting and razor-sharp line-ups.', 3, true)
  on conflict (id) do update
    set name = excluded.name, mobile_number = excluded.mobile_number, title = excluded.title,
        bio = excluded.bio, sort = excluded.sort, active = true;

  -- Staff passwords back to 12345
  insert into public.staff_credentials (user_id, password_hash, updated_at)
  select v.id, crypt('12345', gen_salt('bf')), now()
  from (values ('u-admin'), ('u-s1'), ('u-s2'), ('u-s3')) as v(id)
  on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now();

  -- 4. Restore the service menu
  delete from public.services where true;
  insert into public.services (id, name, description, price, duration_min, icon, active, sort) values
    ('svc-haircut', 'Classic Haircut',     'Scissor or clipper cut, styled to finish',                    25, 30, '✂️', true, 1),
    ('svc-fade',    'Skin Fade',           'Clean skin/low/mid/high fade with sharp lineup',               30, 45, '💈', true, 2),
    ('svc-beard',   'Beard Trim & Shape',  'Beard sculpt, line-up and hot towel finish',                   15, 20, '🧔', true, 3),
    ('svc-combo',   'Haircut + Beard',     'Full haircut plus beard trim and shape',                       40, 60, '🔥', true, 4),
    ('svc-shave',   'Hot Towel Shave',     'Traditional straight-razor shave with hot towels',             30, 30, '🪒', true, 5),
    ('svc-kids',    'Kids Cut (under 12)', 'Haircut for the young gentlemen',                              18, 25, '👦', true, 6),
    ('svc-full',    'The Full Experience', 'Haircut, beard sculpt, hot-towel shave and a scalp massage',   65, 90, '👑', true, 7);

  -- 5. Restore shop settings and opening hours
  insert into public.settings (id) values ('shop') on conflict (id) do nothing;
  update public.settings set
    shop_name = 'Blade & Fade',
    tagline = 'Barbershop',
    address = '12 Main Street',
    phone = '',
    currency = '$',
    hours = '{
      "0": {"open": "10:00", "close": "20:00"},
      "1": {"open": "10:00", "close": "20:00"},
      "2": {"open": "10:00", "close": "20:00"},
      "3": {"open": "10:00", "close": "20:00"},
      "4": {"open": "10:00", "close": "20:00"},
      "5": {"open": "10:00", "close": "20:00"},
      "6": {"open": "10:00", "close": "20:00"}
    }'::jsonb,
    slot_interval = 15,
    booking_window_days = 30,
    min_notice_min = 0,
    auto_confirm = false,
    max_upcoming = 2,
    updated_at = now()
  where id = 'shop';

  insert into public.activity_log (type, message, actor_name, actor_role)
  values ('system', 'Demo data was reset', 'System', 'system');
end $$;

revoke all on function public.reset_demo(text) from public;
grant execute on function public.reset_demo(text) to anon, authenticated;
