-- =============================================================================
-- Fantasy Tennis — 0008: non-playing accounts, and a per-club-team limit
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- * profiles.is_playing: an admin can switch an account to "not playing"
--   (e.g. the organiser). Non-playing accounts keep full access but are left
--   out of the league and never get a locked team at the deadline.
-- * club_settings.max_per_club_team (default 2): a squad can hold at most this
--   many players from any one club team (1s–6s).
-- =============================================================================

begin;

alter table public.profiles add column if not exists is_playing boolean not null default true;

alter table public.club_settings
  add column if not exists max_per_club_team smallint not null default 2;
alter table public.club_settings drop constraint if exists club_settings_max_per_club_team_check;
alter table public.club_settings
  add constraint club_settings_max_per_club_team_check check (max_per_club_team between 1 and 5);

grant update (season_name, budget, free_transfers_per_gameweek, transfer_hit_points, max_per_club_team)
  on public.club_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Admin: switch an account between playing and not playing
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_playing(p_user_id uuid, p_playing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.profiles set is_playing = coalesce(p_playing, true) where id = p_user_id;
  if not found then
    raise exception 'That user no longer exists' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: user list, now with is_playing (return type changed, so drop first)
-- -----------------------------------------------------------------------------
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
  is_test_data boolean,
  is_playing boolean
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
           p.created_at, u.last_sign_in_at, p.is_test_data, p.is_playing
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.is_test_data, p.joined_at nulls first, lower(p.display_name);
end;
$$;

-- -----------------------------------------------------------------------------
-- Deadline lock: as 0005, but non-playing accounts get no locked team
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
    -- One entry per playing member with a complete squad (5 players and both armbands).
    with inserted as (
      insert into public.gameweek_entries (user_id, gameweek_id, chip)
      select s.user_id, v_gameweek.id, c.chip
      from (
        select user_id
        from public.squad_picks
        group by user_id
        having count(*) = 5 and bool_or(is_captain) and bool_or(is_vice_captain)
      ) s
      join public.profiles p on p.id = s.user_id and p.joined_at is not null and p.is_playing
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
-- Save squad: as 0005, plus the per-club-team limit when players change
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
  v_max_per_team integer;
  v_team integer;
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

    -- At most N players from any one club team (e.g. no more than 2 from the 1s).
    select max_per_club_team into v_max_per_team from public.club_settings where id;
    select pl.club_team into v_team
    from jsonb_to_recordset(p_picks) as x(player_id uuid)
    join public.players pl on pl.id = x.player_id
    group by pl.club_team
    having count(*) > v_max_per_team
    order by pl.club_team
    limit 1;
    if v_team is not null then
      raise exception 'You can have at most % players from the %s', v_max_per_team, v_team
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
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on function private.lock_due_gameweeks() from public, anon, authenticated;
revoke execute on function
  public.admin_set_playing(uuid, boolean), public.admin_list_users(), public.save_squad(jsonb)
  from public, anon;
grant execute on function
  public.admin_set_playing(uuid, boolean), public.admin_list_users(), public.save_squad(jsonb)
  to authenticated;

commit;
