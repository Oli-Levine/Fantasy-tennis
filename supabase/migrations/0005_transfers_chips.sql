-- =============================================================================
-- Fantasy Tennis — 0005: transfers, points hits and chips
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- How transfers are counted: a manager's "baseline" is their most recent
-- locked team (ignoring a Free Hit week, because that squad is thrown away).
-- Transfers for the coming gameweek = players in the squad who aren't in the
-- baseline, so undoing a transfer before the deadline is automatically free.
-- The count, the points hit and the transfer log are written when the
-- gameweek locks. Managers with no locked team yet change players freely.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- The next gameweek still taking changes (open, not blank, deadline ahead).
create or replace function private.upcoming_gameweek()
returns table (id bigint, number integer, deadline timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.number, g.deadline
  from public.gameweeks g
  where g.status = 'open' and not g.is_blank and g.deadline > now()
  order by g.deadline
  limit 1;
$$;

-- The locked team that transfers before p_before are counted against:
-- the latest entry before that deadline, skipping Free Hit weeks.
create or replace function private.baseline_gameweek(p_user uuid, p_before timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select e.gameweek_id
  from public.gameweek_entries e
  join public.gameweeks g on g.id = e.gameweek_id
  where e.user_id = p_user and g.deadline < p_before and e.chip is distinct from 'free_hit'
  order by g.deadline desc
  limit 1;
$$;

-- Points deducted for p_made transfers (as a positive number).
create or replace function private.transfer_hit(p_made integer, p_chip text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_made is null or p_chip in ('wildcard', 'free_hit') then 0
    else greatest(0, p_made - s.free_transfers_per_gameweek) * s.transfer_hit_points
  end
  from public.club_settings s
  where s.id;
$$;

-- Players in (direction 'in') and out ('out') of each listed manager's
-- snapshot for a gameweek, compared with their baseline. Numbered 1, 2, …
-- per manager and direction so ins and outs can be paired up.
create or replace function private.gameweek_moves(p_gameweek_id bigint, p_users uuid[])
returns table (user_id uuid, direction text, player_id uuid, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  with entries as (
    select e.user_id, e.gameweek_id,
           private.baseline_gameweek(e.user_id, g.deadline) as baseline
    from public.gameweek_entries e
    join public.gameweeks g on g.id = e.gameweek_id
    where e.gameweek_id = p_gameweek_id and e.user_id = any (p_users)
  ),
  moves as (
    select e.user_id, 'in'::text as direction, gp.player_id, gp.position
    from entries e
    join public.gameweek_picks gp on gp.user_id = e.user_id and gp.gameweek_id = e.gameweek_id
    where e.baseline is not null
      and not exists (
        select 1 from public.gameweek_picks old
        where old.user_id = e.user_id and old.gameweek_id = e.baseline and old.player_id = gp.player_id
      )
    union all
    select e.user_id, 'out', old.player_id, old.position
    from entries e
    join public.gameweek_picks old on old.user_id = e.user_id and old.gameweek_id = e.baseline
    where not exists (
      select 1 from public.gameweek_picks gp
      where gp.user_id = e.user_id and gp.gameweek_id = e.gameweek_id and gp.player_id = old.player_id
    )
  )
  select m.user_id, m.direction, m.player_id,
         row_number() over (partition by m.user_id, m.direction order by m.position, m.player_id)::integer
  from moves m;
$$;

-- -----------------------------------------------------------------------------
-- Lock every gameweek whose deadline has passed: snapshot squads, record
-- transfers and hits, and revert Free Hit squads
-- -----------------------------------------------------------------------------
create or replace function private.lock_due_gameweeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gameweek record;
  v_new uuid[];
  v_free integer;
  v_locked integer := 0;
begin
  select free_transfers_per_gameweek into v_free from public.club_settings where id;

  -- FOR UPDATE makes concurrent callers wait, then skip weeks already locked.
  for v_gameweek in
    select id, deadline from public.gameweeks
    where status = 'open' and not is_blank and deadline <= now()
    order by deadline
    for update
  loop
    -- One entry per member with a complete squad (5 players and both armbands).
    with inserted as (
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
      on conflict (user_id, gameweek_id) do nothing
      returning user_id
    )
    select coalesce(array_agg(user_id), '{}') into v_new from inserted;

    insert into public.gameweek_picks (user_id, gameweek_id, position, player_id, is_captain, is_vice_captain)
    select sp.user_id, v_gameweek.id, sp.position, sp.player_id, sp.is_captain, sp.is_vice_captain
    from public.squad_picks sp
    where sp.user_id = any (v_new)
    on conflict (user_id, gameweek_id, position) do nothing;

    -- Transfers: who came in and went out since each manager's baseline.
    update public.gameweek_entries e
    set transfers_made = t.made,
        transfer_hit = private.transfer_hit(t.made, e.chip)
    from (
      select m.user_id, count(*)::integer as made
      from private.gameweek_moves(v_gameweek.id, v_new) m
      where m.direction = 'in'
      group by m.user_id
    ) t
    where e.user_id = t.user_id and e.gameweek_id = v_gameweek.id;

    insert into public.transfers (user_id, gameweek_id, player_out_id, player_in_id, is_free)
    select i.user_id, v_gameweek.id, o.player_id, i.player_id,
           coalesce(e.chip in ('wildcard', 'free_hit'), false) or i.n <= v_free
    from private.gameweek_moves(v_gameweek.id, v_new) i
    join private.gameweek_moves(v_gameweek.id, v_new) o
      on o.user_id = i.user_id and o.direction = 'out' and o.n = i.n
    join public.gameweek_entries e on e.user_id = i.user_id and e.gameweek_id = v_gameweek.id
    where i.direction = 'in'
      and not exists (
        select 1 from public.transfers t where t.user_id = i.user_id and t.gameweek_id = v_gameweek.id
      );

    -- Free Hit: the squad goes back to the team before the Free Hit week.
    delete from public.squad_picks sp
    using public.gameweek_entries e
    where e.gameweek_id = v_gameweek.id and e.chip = 'free_hit' and e.user_id = any (v_new)
      and sp.user_id = e.user_id
      and private.baseline_gameweek(e.user_id, v_gameweek.deadline) is not null;

    insert into public.squad_picks (user_id, position, player_id, is_captain, is_vice_captain)
    select gp.user_id, gp.position, gp.player_id, gp.is_captain, gp.is_vice_captain
    from public.gameweek_entries e
    join public.gameweek_picks gp
      on gp.user_id = e.user_id and gp.gameweek_id = private.baseline_gameweek(e.user_id, v_gameweek.deadline)
    where e.gameweek_id = v_gameweek.id and e.chip = 'free_hit' and e.user_id = any (v_new)
    on conflict (user_id, position) do nothing;

    -- A chip played by someone whose team wasn't complete at the deadline did
    -- nothing, so give it back.
    delete from public.chip_plays c
    where c.gameweek_id = v_gameweek.id
      and not exists (
        select 1 from public.gameweek_entries e where e.user_id = c.user_id and e.gameweek_id = c.gameweek_id
      );

    update public.gameweeks
    set status = 'locked', locked_at = coalesce(locked_at, now())
    where id = v_gameweek.id;

    v_locked := v_locked + 1;
  end loop;

  -- Chips on weeks later marked blank never ran, so give those back too.
  delete from public.chip_plays c
  using public.gameweeks g
  where g.id = c.gameweek_id and g.is_blank and g.deadline <= now();

  return v_locked;
end;
$$;

-- -----------------------------------------------------------------------------
-- Transfer state for the coming gameweek (for the Team page)
-- -----------------------------------------------------------------------------
create or replace function private.transfer_state(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gw record;
  v_baseline bigint;
  v_chip text;
  v_made integer;
  v_settings record;
begin
  select * into v_gw from private.upcoming_gameweek();
  select * into v_settings from public.club_settings where id;
  v_baseline := private.baseline_gameweek(p_user, coalesce(v_gw.deadline, 'infinity'::timestamptz));
  select chip into v_chip from public.chip_plays where user_id = p_user and gameweek_id = v_gw.id;

  if v_baseline is not null then
    select count(*)::integer into v_made
    from public.squad_picks sp
    where sp.user_id = p_user
      and not exists (
        select 1 from public.gameweek_picks gp
        where gp.user_id = p_user and gp.gameweek_id = v_baseline and gp.player_id = sp.player_id
      );
  end if;

  return jsonb_build_object(
    'gameweek_id', v_gw.id,
    -- null = no locked team yet, so changes are unlimited and free
    'baseline_player_ids', case when v_baseline is not null then (
      select coalesce(jsonb_agg(gp.player_id order by gp.position), '[]'::jsonb)
      from public.gameweek_picks gp
      where gp.user_id = p_user and gp.gameweek_id = v_baseline
    ) end,
    'chip', v_chip,
    'transfers_made', coalesce(v_made, 0),
    'transfer_hit', private.transfer_hit(v_made, v_chip),
    'free_transfers', v_settings.free_transfers_per_gameweek,
    'hit_points', v_settings.transfer_hit_points
  );
end;
$$;

create or replace function public.get_transfer_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Join the club first' using errcode = '42501';
  end if;
  return private.transfer_state(auth.uid());
end;
$$;

-- -----------------------------------------------------------------------------
-- Save the signed-in manager's squad (as 0004, but player changes after the
-- first lock are now transfers instead of being refused)
--   p_picks: [{ "position": 1-5, "player_id": uuid,
--               "is_captain": bool, "is_vice_captain": bool }, ...]
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
  v_state jsonb;
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
  end if;

  delete from public.squad_picks where user_id = v_uid;
  insert into public.squad_picks (user_id, position, player_id, is_captain, is_vice_captain)
  select v_uid, x.position, x.player_id, coalesce(x.is_captain, false), coalesce(x.is_vice_captain, false)
  from jsonb_to_recordset(p_picks) as x(position smallint, player_id uuid, is_captain boolean, is_vice_captain boolean);

  v_state := private.transfer_state(v_uid);
  return jsonb_build_object(
    'changed_players', v_changed,
    'transfers_made', v_state -> 'transfers_made',
    'transfer_hit', v_state -> 'transfer_hit'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Chips: play or cancel for the coming gameweek, until its deadline
-- -----------------------------------------------------------------------------
create or replace function public.play_chip(p_chip text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_gw record;
  v_used record;
begin
  if not public.is_member() then
    raise exception 'Join the club first' using errcode = '42501';
  end if;
  if p_chip is null or p_chip not in ('triple_captain', 'free_hit', 'wildcard') then
    raise exception 'Unknown chip' using errcode = '22023';
  end if;

  perform private.lock_due_gameweeks();

  select * into v_gw from private.upcoming_gameweek();
  if v_gw.id is null then
    raise exception 'There''s no upcoming gameweek to play a chip in yet' using errcode = '22023';
  end if;

  select c.chip, g.number into v_used
  from public.chip_plays c join public.gameweeks g on g.id = c.gameweek_id
  where c.user_id = v_uid and c.chip = p_chip;
  if found then
    if v_used.number = v_gw.number then
      return jsonb_build_object('chip', p_chip, 'gameweek_id', v_gw.id);
    end if;
    raise exception 'You already used that chip in gameweek %', v_used.number using errcode = '22023';
  end if;

  if exists (select 1 from public.chip_plays where user_id = v_uid and gameweek_id = v_gw.id) then
    raise exception 'You can only play one chip per gameweek. Cancel the other one first.' using errcode = '22023';
  end if;

  if p_chip in ('wildcard', 'free_hit')
     and private.baseline_gameweek(v_uid, v_gw.deadline) is null then
    raise exception 'Your changes are already free until your first deadline, so save this chip for later'
      using errcode = '22023';
  end if;

  insert into public.chip_plays (user_id, chip, gameweek_id) values (v_uid, p_chip, v_gw.id);
  return jsonb_build_object('chip', p_chip, 'gameweek_id', v_gw.id);
end;
$$;

create or replace function public.cancel_chip(p_chip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_member() then
    raise exception 'Join the club first' using errcode = '42501';
  end if;

  perform private.lock_due_gameweeks();

  delete from public.chip_plays c
  using public.gameweeks g
  where c.user_id = v_uid and c.chip = p_chip and g.id = c.gameweek_id
    and g.status = 'open' and g.deadline > now();
  if not found then
    raise exception 'That chip isn''t active, or its deadline has passed' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on function
  private.upcoming_gameweek(), private.baseline_gameweek(uuid, timestamptz),
  private.gameweek_moves(bigint, uuid[]),
  private.transfer_hit(integer, text), private.lock_due_gameweeks(), private.transfer_state(uuid)
  from public, anon, authenticated;
revoke execute on function
  public.get_transfer_state(), public.save_squad(jsonb), public.play_chip(text), public.cancel_chip(text)
  from public, anon;
grant execute on function
  public.get_transfer_state(), public.save_squad(jsonb), public.play_chip(text), public.cancel_chip(text)
  to authenticated;

commit;
