-- =============================================================================
-- Fantasy Tennis — 0003: admin tools (gameweek generator, user list, safety)
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Gameweeks are always numbered 1, 2, 3… in deadline order
-- -----------------------------------------------------------------------------
create or replace function private.renumber_gameweeks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  -- Two steps so the unique "number" never clashes mid-update.
  -- Supabase's API blocks UPDATE/DELETE without a WHERE clause (pg-safeupdate),
  -- even inside functions, hence the explicit "where true".
  update public.gameweeks set number = number + 100000 where true;
  update public.gameweeks g
  set number = r.rn
  from (select id, row_number() over (order by deadline, id) as rn from public.gameweeks) r
  where g.id = r.id;
  return null;
end;
$$;

drop trigger if exists renumber_after_insert on public.gameweeks;
create trigger renumber_after_insert
  after insert or delete on public.gameweeks
  for each statement execute function private.renumber_gameweeks();

drop trigger if exists renumber_after_deadline_change on public.gameweeks;
create trigger renumber_after_deadline_change
  after update of deadline on public.gameweeks
  for each statement execute function private.renumber_gameweeks();

-- -----------------------------------------------------------------------------
-- A gameweek can only be deleted while it's unused (open, no history/results)
-- -----------------------------------------------------------------------------
create or replace function private.guard_gameweek_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'open'
     or exists (select 1 from public.gameweek_entries where gameweek_id = old.id)
     or exists (select 1 from public.rule_results where gameweek_id = old.id)
     or exists (select 1 from public.player_gameweeks where gameweek_id = old.id)
     or exists (select 1 from public.chip_plays where gameweek_id = old.id)
     or exists (select 1 from public.transfers where gameweek_id = old.id) then
    raise exception 'Gameweek % is in use and can''t be deleted. Mark it as a blank week instead.', old.number
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_gameweek_delete on public.gameweeks;
create trigger guard_gameweek_delete
  before delete on public.gameweeks
  for each row execute function private.guard_gameweek_delete();

-- -----------------------------------------------------------------------------
-- Admin: create weekly deadlines (Tuesday 21:00 UK time, BST/GMT-aware)
-- -----------------------------------------------------------------------------
create or replace function public.admin_generate_gameweeks(p_first_date date, p_weeks integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
  v_deadline timestamptz;
  i integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 52 then
    raise exception 'Choose between 1 and 52 weeks' using errcode = '22023';
  end if;

  for i in 0 .. p_weeks - 1 loop
    -- 21:00 on that date in UK local time, whether that's GMT or BST.
    v_deadline := ((p_first_date + i * 7) + time '21:00') at time zone 'Europe/London';
    if not exists (select 1 from public.gameweeks where deadline = v_deadline) then
      insert into public.gameweeks (number, deadline)
      values (1000000 + i, v_deadline); -- temporary; renumbered by the trigger
      v_created := v_created + 1;
    end if;
  end loop;
  return v_created;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: list everyone who has signed in, with their email
-- -----------------------------------------------------------------------------
-- Dropped first so this file can be re-run after 0008 changed the columns.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  team_name text,
  role text,
  joined_at timestamptz,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_test_data boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.team_name, p.role, p.joined_at,
           p.created_at, u.last_sign_in_at, p.is_test_data
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.is_test_data, p.joined_at nulls first, lower(p.display_name);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: how much fake test data is left (for the Admin page)
-- -----------------------------------------------------------------------------
create or replace function public.admin_test_data_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'players', (select count(*) from public.players where is_test_data),
    'scoring_rules', (select count(*) from public.scoring_rules where is_test_data),
    'managers', (select count(*) from public.profiles where is_test_data)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on function private.renumber_gameweeks(), private.guard_gameweek_delete()
  from public, anon, authenticated;
revoke execute on function
  public.admin_generate_gameweeks(date, integer), public.admin_list_users(),
  public.admin_test_data_counts()
  from public, anon;
grant execute on function
  public.admin_generate_gameweeks(date, integer), public.admin_list_users(),
  public.admin_test_data_counts()
  to authenticated;

commit;
