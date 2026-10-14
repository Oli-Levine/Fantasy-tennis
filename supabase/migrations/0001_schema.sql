-- =============================================================================
-- Fantasy Tennis — 0001: tables, constraints and core functions
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
-- =============================================================================

begin;

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Club settings
-- -----------------------------------------------------------------------------

-- Game settings everyone in the club can read (single row).
create table if not exists public.club_settings (
  id boolean primary key default true check (id),
  season_name text not null default '2026/27',
  budget numeric(4, 1) not null default 35.0 check (budget > 0),
  free_transfers_per_gameweek smallint not null default 1 check (free_transfers_per_gameweek >= 0),
  transfer_hit_points smallint not null default 5 check (transfer_hit_points >= 0),
  updated_at timestamptz not null default now()
);
insert into public.club_settings (id) values (true) on conflict (id) do nothing;

-- Secret settings. The `private` schema is not exposed through the API, so
-- only the security-definer functions below can read or change these.
create table if not exists private.club_secrets (
  id boolean primary key default true check (id),
  join_code text not null check (char_length(join_code) between 4 and 40),
  updated_at timestamptz not null default now()
);
insert into private.club_secrets (id, join_code)
values (true, upper(substr(md5(random()::text), 1, 6)))
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- People
-- -----------------------------------------------------------------------------

-- One row per signed-in Google account. A user becomes a club member once they
-- enter the join code (joined_at is set), then picks a team name.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  team_name text check (team_name is null or char_length(btrim(team_name)) between 2 and 30),
  role text not null default 'user' check (role in ('user', 'admin')),
  joined_at timestamptz,
  is_test_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Team names are unique ignoring case and surrounding spaces.
create unique index if not exists profiles_team_name_unique
  on public.profiles (lower(btrim(team_name))) where team_name is not null;

-- -----------------------------------------------------------------------------
-- Game data
-- -----------------------------------------------------------------------------

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  club_team smallint not null check (club_team between 1 and 6), -- 1 = 1s … 6 = 6s
  price numeric(4, 1) not null check (price > 0 and price <= 99.9), -- £ millions
  photo_path text, -- path inside the `player-photos` storage bucket
  is_active boolean not null default true, -- false = unavailable
  is_test_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists players_club_team_idx on public.players (club_team);

create table if not exists public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  points integer not null check (points between -100 and 100),
  type text not null check (type in ('tick', 'count')),
  category text not null check (category in ('match', 'other')),
  sort_order integer not null default 0,
  -- Rules are archived rather than deleted once results use them, so the raw
  -- results (and the future stats page) never lose data.
  archived_at timestamptz,
  is_test_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gameweeks (
  id bigint generated always as identity primary key,
  number integer not null unique check (number > 0),
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('open', 'locked', 'published')),
  is_blank boolean not null default false, -- holiday / no fixtures: no deadline or scoring
  locked_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gameweeks_deadline_unique on public.gameweeks (deadline);

-- -----------------------------------------------------------------------------
-- Squads
-- -----------------------------------------------------------------------------

-- Each manager's current (editable) squad: positions 1–4 are starters, 5 is the bench.
create table if not exists public.squad_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  player_id uuid not null references public.players (id) on delete restrict,
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, player_id),
  check (not (is_captain and is_vice_captain)),
  check (position <= 4 or not (is_captain or is_vice_captain)) -- bench can't captain
);
create unique index if not exists squad_picks_one_captain
  on public.squad_picks (user_id) where is_captain;
create unique index if not exists squad_picks_one_vice_captain
  on public.squad_picks (user_id) where is_vice_captain;

-- Chips: each at most once per season, at most one per gameweek.
create table if not exists public.chip_plays (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chip text not null check (chip in ('triple_captain', 'free_hit', 'wildcard')),
  gameweek_id bigint not null references public.gameweeks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chip),
  unique (user_id, gameweek_id)
);

-- Transfer log (one row per player swapped).
create table if not exists public.transfers (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks (id) on delete cascade,
  player_out_id uuid not null references public.players (id) on delete restrict,
  player_in_id uuid not null references public.players (id) on delete restrict,
  is_free boolean not null, -- false = cost a points hit
  created_at timestamptz not null default now()
);
create index if not exists transfers_user_gameweek_idx on public.transfers (user_id, gameweek_id);

-- Snapshot of each manager's squad at a gameweek deadline (the locked team).
create table if not exists public.gameweek_entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks (id) on delete cascade,
  chip text check (chip in ('triple_captain', 'free_hit', 'wildcard')),
  transfers_made smallint not null default 0,
  transfer_hit integer not null default 0, -- points deducted, as a positive number
  points integer, -- manager total for the gameweek, set when results are published
  created_at timestamptz not null default now(),
  primary key (user_id, gameweek_id)
);
create index if not exists gameweek_entries_gameweek_idx on public.gameweek_entries (gameweek_id);

create table if not exists public.gameweek_picks (
  user_id uuid not null,
  gameweek_id bigint not null,
  position smallint not null check (position between 1 and 5),
  player_id uuid not null references public.players (id) on delete restrict,
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  primary key (user_id, gameweek_id, position),
  unique (user_id, gameweek_id, player_id),
  foreign key (user_id, gameweek_id)
    references public.gameweek_entries (user_id, gameweek_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Results
-- -----------------------------------------------------------------------------

-- Per player per gameweek: did they play, and their computed points.
create table if not exists public.player_gameweeks (
  gameweek_id bigint not null references public.gameweeks (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  did_not_play boolean not null default false,
  points integer, -- computed from rule_results when published
  updated_at timestamptz not null default now(),
  primary key (gameweek_id, player_id)
);

-- Raw results: one row per player per rule per gameweek. Kept forever for stats.
create table if not exists public.rule_results (
  gameweek_id bigint not null references public.gameweeks (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  rule_id uuid not null references public.scoring_rules (id) on delete restrict,
  count integer not null check (count >= 0), -- tick rules: 0 or 1
  updated_at timestamptz not null default now(),
  primary key (gameweek_id, player_id, rule_id)
);
create index if not exists rule_results_player_idx on public.rule_results (player_id);

-- -----------------------------------------------------------------------------
-- Helper functions (used by RLS policies)
-- -----------------------------------------------------------------------------

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and joined_at is not null
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and joined_at is not null
  );
$$;

-- Squads of other managers become visible once a gameweek's deadline passes.
create or replace function public.gameweek_is_visible(p_gameweek_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gameweeks
    where id = p_gameweek_id and (status in ('locked', 'published') or deadline <= now())
  );
$$;

create or replace function public.gameweek_is_published(p_gameweek_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gameweeks where id = p_gameweek_id and status = 'published'
  );
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'club_settings', 'profiles', 'players', 'scoring_rules', 'gameweeks',
    'squad_picks', 'player_gameweeks', 'rule_results'
  ] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format(
      'create trigger touch_updated_at before update on public.%I
       for each row execute function private.touch_updated_at()', t);
  end loop;
end;
$$;

-- Create a profile for every new Google sign-in.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Player'
    ), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Profiles for anyone who signed in before this script was run.
insert into public.profiles (id, display_name)
select
  u.id,
  left(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Player'
  ), 40)
from auth.users u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Functions the app calls (RPC)
-- -----------------------------------------------------------------------------

-- Step 1 of onboarding: enter the club join code.
create or replace function public.join_club(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select join_code into v_code from private.club_secrets where id;
  if v_code is null or upper(btrim(coalesce(p_code, ''))) <> upper(btrim(v_code)) then
    return false;
  end if;

  insert into public.profiles (id, display_name, joined_at)
  select v_uid, 'Player', now()
  on conflict (id) do update
    set joined_at = coalesce(public.profiles.joined_at, now());
  return true;
end;
$$;

-- Admin: read or change the join code.
create or replace function public.get_join_code()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return (select join_code from private.club_secrets where id);
end;
$$;

create or replace function public.set_join_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if char_length(v_code) < 4 or char_length(v_code) > 40 then
    raise exception 'Join code must be 4–40 characters' using errcode = '22023';
  end if;
  update private.club_secrets set join_code = v_code, updated_at = now() where id;
  return v_code;
end;
$$;

-- Admin: promote/demote a user. Can't remove the last admin.
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_role not in ('user', 'admin') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if p_role = 'user'
     and (select count(*) from public.profiles where role = 'admin' and id <> p_user_id) = 0 then
    raise exception 'The club needs at least one admin' using errcode = '22023';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

-- Admin: remove a user entirely (their sign-in, profile, squad and history).
create or replace function public.remove_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You can''t remove yourself' using errcode = '22023';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Test data
-- -----------------------------------------------------------------------------

-- Deletes every fake player, scoring rule and manager (is_test_data = true),
-- plus anything that points at them (e.g. a real manager who picked a fake
-- player loses that pick). Real data is untouched.
create or replace function private.delete_test_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_players uuid[];
  v_rules uuid[];
  v_users uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_players from public.players where is_test_data;
  select coalesce(array_agg(id), '{}') into v_rules from public.scoring_rules where is_test_data;
  select coalesce(array_agg(id), '{}') into v_users from public.profiles where is_test_data;

  delete from public.rule_results where player_id = any (v_players) or rule_id = any (v_rules);
  delete from public.player_gameweeks where player_id = any (v_players);
  delete from public.transfers
    where player_out_id = any (v_players) or player_in_id = any (v_players);
  delete from public.gameweek_picks where player_id = any (v_players);
  delete from public.squad_picks where player_id = any (v_players);
  delete from auth.users where id = any (v_users); -- cascades to their profile, squad, history
  delete from public.profiles where id = any (v_users);
  delete from public.players where id = any (v_players);
  delete from public.scoring_rules where id = any (v_rules);

  return jsonb_build_object(
    'players', cardinality(v_players),
    'scoring_rules', cardinality(v_rules),
    'managers', cardinality(v_users)
  );
end;
$$;

create or replace function public.admin_delete_test_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return private.delete_test_data();
end;
$$;

commit;
