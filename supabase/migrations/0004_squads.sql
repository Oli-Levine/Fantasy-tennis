-- =============================================================================
-- Fantasy Tennis — 0004: squad picking and the deadline lock
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- How the lock works: every squad change goes through public.save_squad(),
-- which first calls private.lock_due_gameweeks(). That snapshots every
-- complete squad for any gameweek whose deadline has passed and marks it
-- locked. Because nothing can change a squad without running the lock first,
-- the snapshot always equals the squad as it was at the deadline, even if
-- nobody opens the app exactly at 21:00. Pages also call public.sync_gameweeks().
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Lock every gameweek whose deadline has passed and snapshot squads
-- -----------------------------------------------------------------------------
create or replace function private.lock_due_gameweeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gameweek record;
  v_locked integer := 0;
begin
  -- FOR UPDATE makes concurrent callers wait, then skip weeks already locked.
  for v_gameweek in
    select id from public.gameweeks
    where status = 'open' and not is_blank and deadline <= now()
    order by deadline
    for update
  loop
    -- One entry per member with a complete squad (5 players and a captain).
    insert into public.gameweek_entries (user_id, gameweek_id, chip)
    select s.user_id, v_gameweek.id, c.chip
    from (
      select user_id
      from public.squad_picks
      group by user_id
      having count(*) = 5 and bool_or(is_captain) and bool_or(is_vice_captain)
    ) s
    join public.profiles p on p.id = s.user_id and p.joined_at is not null
    left join public.chip_plays c on c.user_id = s.user_id and c.gameweek_id = v_gameweek.id
    on conflict (user_id, gameweek_id) do nothing;

    insert into public.gameweek_picks (user_id, gameweek_id, position, player_id, is_captain, is_vice_captain)
    select sp.user_id, v_gameweek.id, sp.position, sp.player_id, sp.is_captain, sp.is_vice_captain
    from public.squad_picks sp
    join public.gameweek_entries e on e.user_id = sp.user_id and e.gameweek_id = v_gameweek.id
    on conflict (user_id, gameweek_id, position) do nothing;

    update public.gameweeks
    set status = 'locked', locked_at = coalesce(locked_at, now())
    where id = v_gameweek.id;

    v_locked := v_locked + 1;
  end loop;
  return v_locked;
end;
$$;

-- Pages call this so the current gameweek is always up to date.
create or replace function public.sync_gameweeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return private.lock_due_gameweeks();
end;
$$;

-- -----------------------------------------------------------------------------
-- Save the signed-in manager's squad
--   p_picks: [{ "position": 1-5, "player_id": uuid,
--               "is_captain": bool, "is_vice_captain": bool }, ...]
--   Positions 1-4 are starters, 5 is the bench.
-- -----------------------------------------------------------------------------
create or replace function public.save_squad(p_picks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_budget numeric;
  v_total numeric;
  v_changed boolean;
  v_bad text;
begin
  if not public.is_member() then
    raise exception 'Join the club before picking a team' using errcode = '42501';
  end if;

  -- Deadlines first: anything saved after this counts for the next gameweek.
  perform private.lock_due_gameweeks();

  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) <> 5 then
    raise exception 'Pick exactly 5 players: 4 starters and 1 on the bench' using errcode = '22023';
  end if;

  -- Shape: positions 1–5 once each, 5 different players.
  if (
    select count(distinct position) <> 5 or min(position) <> 1 or max(position) <> 5
        or count(distinct player_id) <> 5 or count(player_id) <> 5
    from jsonb_to_recordset(p_picks) as x(position smallint, player_id uuid)
  ) then
    raise exception 'Each player can only be picked once' using errcode = '22023';
  end if;

  if (
    select count(*) from jsonb_to_recordset(p_picks) as x(player_id uuid)
    join public.players pl on pl.id = x.player_id
  ) <> 5 then
    raise exception 'One of those players no longer exists' using errcode = '22023';
  end if;

  -- Armbands: one captain and one vice-captain, both starters, different players.
  if (
    select count(*) filter (where is_captain) <> 1
        or count(*) filter (where is_vice_captain) <> 1
        or count(*) filter (where (is_captain or is_vice_captain) and position = 5) > 0
        or count(*) filter (where is_captain and is_vice_captain) > 0
    from jsonb_to_recordset(p_picks) as x(position smallint, is_captain boolean, is_vice_captain boolean)
  ) then
    raise exception 'Choose a captain and a different vice-captain from your 4 starters' using errcode = '22023';
  end if;

  -- Has the set of players changed (rather than just the line-up)?
  select exists (
    select player_id from jsonb_to_recordset(p_picks) as x(player_id uuid)
    except
    select player_id from public.squad_picks where user_id = v_uid
  ) or (select count(*) from public.squad_picks where user_id = v_uid) <> 5
  into v_changed;

  if v_changed then
    -- Newly added players must be available.
    select pl.name into v_bad
    from jsonb_to_recordset(p_picks) as x(player_id uuid)
    join public.players pl on pl.id = x.player_id
    where not pl.is_active
      and not exists (select 1 from public.squad_picks sp where sp.user_id = v_uid and sp.player_id = pl.id)
    limit 1;
    if v_bad is not null then
      raise exception '% is unavailable', v_bad using errcode = '22023';
    end if;

    -- Budget at current prices.
    select budget into v_budget from public.club_settings where id;
    select sum(pl.price) into v_total
    from jsonb_to_recordset(p_picks) as x(player_id uuid)
    join public.players pl on pl.id = x.player_id;
    if v_total > v_budget then
      raise exception 'That squad costs £%m, which is £%m over the £%m budget',
        to_char(v_total, 'FM990.0'), to_char(v_total - v_budget, 'FM990.0'), to_char(v_budget, 'FM990.0')
        using errcode = '22023';
    end if;

    -- Once a manager's team has been locked in for a gameweek, player changes
    -- are transfers (with free-transfer limits and points hits).
    if exists (select 1 from public.gameweek_entries where user_id = v_uid) then
      raise exception 'Your team has been locked in for a gameweek, so player changes now count as transfers. Transfers are coming in the next update; you can still change your captain, vice-captain and bench.'
        using errcode = '22023';
    end if;
  end if;

  delete from public.squad_picks where user_id = v_uid;
  insert into public.squad_picks (user_id, position, player_id, is_captain, is_vice_captain)
  select v_uid, x.position, x.player_id, coalesce(x.is_captain, false), coalesce(x.is_vice_captain, false)
  from jsonb_to_recordset(p_picks) as x(position smallint, player_id uuid, is_captain boolean, is_vice_captain boolean);

  return jsonb_build_object('changed_players', v_changed);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on function private.lock_due_gameweeks() from public, anon, authenticated;
revoke execute on function public.sync_gameweeks(), public.save_squad(jsonb) from public, anon;
grant execute on function public.sync_gameweeks(), public.save_squad(jsonb) to authenticated;

commit;
