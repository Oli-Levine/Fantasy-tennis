-- =============================================================================
-- Fantasy Tennis — 0009: team captains
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- Adds a "captain" role between user and admin. Captains can enter results for
-- any player and save drafts, but only an admin can publish (admin_store_points
-- stays admins-only) or change a gameweek once it's published.
--
-- Saving results now only touches the players that were sent, so several
-- captains can each save their part of a gameweek without wiping each other's.
-- Each player's row records who last entered their results.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- The new role
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'captain', 'admin'));

-- Captains and admins (both must have joined the club).
create or replace function public.can_enter_results()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('captain', 'admin') and joined_at is not null
  );
$$;

-- Admin: set someone's role. Can't remove the last admin.
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
  if p_role is null or p_role not in ('user', 'captain', 'admin') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin' and id <> p_user_id) = 0 then
    raise exception 'The club needs at least one admin' using errcode = '22023';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Who entered each player's results
-- -----------------------------------------------------------------------------
alter table public.player_gameweeks
  add column if not exists entered_by uuid references public.profiles (id) on delete set null,
  add column if not exists entered_at timestamptz;

-- Captains read draft results (members already see published ones).
drop policy if exists "captains read appearances" on public.player_gameweeks;
create policy "captains read appearances" on public.player_gameweeks
  for select to authenticated using (public.can_enter_results());
drop policy if exists "captains read results" on public.rule_results;
create policy "captains read results" on public.rule_results
  for select to authenticated using (public.can_enter_results());

-- -----------------------------------------------------------------------------
-- Save results for some players in a gameweek (captains and admins)
--   p_results: [{ "player_id": uuid, "did_not_play": bool,
--                 "counts": { "<rule id>": count, ... } }, ...]
-- Only the players listed are changed; a listed player with no ticks and
-- "did not play" off has their results cleared. Captains can only save drafts
-- (gameweeks that are locked, not yet published).
-- -----------------------------------------------------------------------------
create or replace function public.save_results(p_gameweek_id bigint, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gw public.gameweeks;
  v_bad text;
  v_rows integer;
begin
  if not public.can_enter_results() then
    raise exception 'Only team captains and admins can enter results' using errcode = '42501';
  end if;
  v_gw := private.assert_scorable_gameweek(p_gameweek_id);
  if v_gw.status = 'published' and not public.is_admin() then
    raise exception 'Gameweek % is already published, so only an admin can change it', v_gw.number
      using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'Results must be a list' using errcode = '22023';
  end if;

  if exists (select player_id from private.results_players(p_results) group by player_id having count(*) > 1) then
    raise exception 'A player appears twice in the results' using errcode = '22023';
  end if;

  if exists (
    select 1 from private.results_players(p_results) i
    left join public.players pl on pl.id = i.player_id
    where pl.id is null
  ) then
    raise exception 'One of those players no longer exists' using errcode = '22023';
  end if;

  if exists (
    select 1 from private.results_counts(p_results) r
    left join public.scoring_rules sr on sr.id = r.rule_id
    where sr.id is null
  ) then
    raise exception 'One of those scoring rules no longer exists. Reload the page and try again.' using errcode = '22023';
  end if;

  select pl.name || ' (' || sr.name || ')' into v_bad
  from private.results_counts(p_results) r
  join public.scoring_rules sr on sr.id = r.rule_id
  join public.players pl on pl.id = r.player_id
  where r.count < 0 or r.count > 99 or (sr.type = 'tick' and r.count > 1)
  limit 1;
  if v_bad is not null then
    raise exception 'Check the number for %: ticks are 0 or 1 and counts 0–99', v_bad using errcode = '22023';
  end if;

  -- Replace the listed players' raw results.
  delete from public.rule_results rr
  where rr.gameweek_id = p_gameweek_id
    and rr.player_id in (select player_id from private.results_players(p_results));
  insert into public.rule_results (gameweek_id, player_id, rule_id, count)
  select p_gameweek_id, player_id, rule_id, count from private.results_counts(p_results) where count > 0;

  -- Listed players with nothing left lose their appearance row; the rest get one.
  delete from public.player_gameweeks pg
  where pg.gameweek_id = p_gameweek_id
    and pg.player_id in (
      select i.player_id from private.results_players(p_results) i
      where not i.did_not_play
        and not exists (select 1 from private.results_counts(p_results) r where r.player_id = i.player_id and r.count > 0)
    );
  insert into public.player_gameweeks (gameweek_id, player_id, did_not_play, entered_by, entered_at)
  select p_gameweek_id, i.player_id, i.did_not_play, auth.uid(), now()
  from private.results_players(p_results) i
  where i.did_not_play or exists (
    select 1 from private.results_counts(p_results) r where r.player_id = i.player_id and r.count > 0
  )
  on conflict (gameweek_id, player_id) do update
    set did_not_play = excluded.did_not_play, entered_by = excluded.entered_by, entered_at = excluded.entered_at;

  select count(*) into v_rows from public.player_gameweeks where gameweek_id = p_gameweek_id;
  return v_rows;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.can_enter_results(), public.save_results(bigint, jsonb) from public, anon;
grant execute on function public.can_enter_results(), public.save_results(bigint, jsonb) to authenticated;

commit;
