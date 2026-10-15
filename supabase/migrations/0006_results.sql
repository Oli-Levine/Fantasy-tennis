-- =============================================================================
-- Fantasy Tennis — 0006: results entry, publishing and points
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- The points themselves are worked out by the app's scoring function
-- (src/lib/scoring.ts), which has the unit tests. These functions only let an
-- admin save the raw results and store the calculated points.
-- =============================================================================

begin;

-- Checks the gameweek is past its deadline (so squads are locked) and not blank.
create or replace function private.assert_scorable_gameweek(p_gameweek_id bigint)
returns public.gameweeks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gw public.gameweeks;
begin
  perform private.lock_due_gameweeks();
  select * into v_gw from public.gameweeks where id = p_gameweek_id;
  if not found then
    raise exception 'That gameweek no longer exists' using errcode = '22023';
  end if;
  if v_gw.is_blank then
    raise exception 'Gameweek % is a blank week, so it has no results', v_gw.number using errcode = '22023';
  end if;
  if v_gw.status = 'open' then
    raise exception 'Gameweek % hasn''t reached its deadline yet, so results can''t be entered', v_gw.number
      using errcode = '22023';
  end if;
  return v_gw;
end;
$$;

-- Parse admin_save_results' input: one row per player, and one per (player, rule).
create or replace function private.results_players(p_results jsonb)
returns table (player_id uuid, did_not_play boolean)
language sql
immutable
set search_path = ''
as $$
  select x.player_id, coalesce(x.did_not_play, false)
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as x(player_id uuid, did_not_play boolean);
$$;

create or replace function private.results_counts(p_results jsonb)
returns table (player_id uuid, rule_id uuid, count integer)
language sql
immutable
set search_path = ''
as $$
  select x.player_id, c.key::uuid, round((c.value #>> '{}')::numeric)::integer
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as x(player_id uuid, counts jsonb)
  cross join lateral jsonb_each(coalesce(x.counts, '{}'::jsonb)) c;
$$;

-- -----------------------------------------------------------------------------
-- Admin: save the raw results for a gameweek (replaces what was there)
--   p_results: [{ "player_id": uuid, "did_not_play": bool,
--                 "counts": { "<rule id>": count, ... } }, ...]
-- Players left out (or with no ticks and "did not play" off) have no results.
-- -----------------------------------------------------------------------------
create or replace function public.admin_save_results(p_gameweek_id bigint, p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad text;
  v_rows integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  perform private.assert_scorable_gameweek(p_gameweek_id);
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'Results must be a list' using errcode = '22023';
  end if;

  if exists (select player_id from private.results_players(p_results) group by player_id having count(*) > 1) then
    raise exception 'A player appears twice in the results' using errcode = '22023';
  end if;

  select coalesce(pl.name, i.player_id::text) into v_bad
  from private.results_players(p_results) i left join public.players pl on pl.id = i.player_id
  where pl.id is null limit 1;
  if v_bad is not null then
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

  -- Replace the gameweek's raw results.
  delete from public.rule_results where gameweek_id = p_gameweek_id;
  insert into public.rule_results (gameweek_id, player_id, rule_id, count)
  select p_gameweek_id, player_id, rule_id, count from private.results_counts(p_results) where count > 0;

  -- One appearance row per player with any result or "did not play".
  delete from public.player_gameweeks pg
  where pg.gameweek_id = p_gameweek_id
    and not exists (
      select 1 from private.results_players(p_results) i
      where i.player_id = pg.player_id
        and (i.did_not_play or exists (
          select 1 from private.results_counts(p_results) r where r.player_id = i.player_id and r.count > 0
        ))
    );
  insert into public.player_gameweeks (gameweek_id, player_id, did_not_play)
  select p_gameweek_id, i.player_id, i.did_not_play
  from private.results_players(p_results) i
  where i.did_not_play or exists (
    select 1 from private.results_counts(p_results) r where r.player_id = i.player_id and r.count > 0
  )
  on conflict (gameweek_id, player_id) do update set did_not_play = excluded.did_not_play;

  select count(*) into v_rows from public.player_gameweeks where gameweek_id = p_gameweek_id;
  return v_rows;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: store the points the scoring function worked out, and optionally
-- publish the gameweek
--   p_players: [{ "player_id": uuid, "points": int }, ...]
--   p_entries: [{ "user_id": uuid, "points": int }, ...]
-- -----------------------------------------------------------------------------
create or replace function public.admin_store_points(
  p_gameweek_id bigint, p_players jsonb, p_entries jsonb, p_publish boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  perform private.assert_scorable_gameweek(p_gameweek_id);

  update public.player_gameweeks pg
  set points = coalesce((
    select x.points
    from jsonb_to_recordset(coalesce(p_players, '[]'::jsonb)) as x(player_id uuid, points integer)
    where x.player_id = pg.player_id
    limit 1
  ), 0)
  where pg.gameweek_id = p_gameweek_id;

  update public.gameweek_entries e
  set points = coalesce((
    select x.points
    from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as x(user_id uuid, points integer)
    where x.user_id = e.user_id
    limit 1
  ), 0)
  where e.gameweek_id = p_gameweek_id;

  if p_publish then
    update public.gameweeks
    set status = 'published', published_at = coalesce(published_at, now()), locked_at = coalesce(locked_at, now())
    where id = p_gameweek_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on function
  private.assert_scorable_gameweek(bigint), private.results_players(jsonb), private.results_counts(jsonb)
  from public, anon, authenticated;
revoke execute on function
  public.admin_save_results(bigint, jsonb), public.admin_store_points(bigint, jsonb, jsonb, boolean)
  from public, anon;
grant execute on function
  public.admin_save_results(bigint, jsonb), public.admin_store_points(bigint, jsonb, jsonb, boolean)
  to authenticated;

commit;
