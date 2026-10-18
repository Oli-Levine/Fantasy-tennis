-- =============================================================================
-- Fantasy Tennis — 0007: restart the season, and delete players safely
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Admin: restart the season
--   Clears all gameweek history (locked teams, transfers, chips, results and
--   points) and deletes every gameweek whose deadline has passed. Future
--   gameweeks stay, reset to open. Players, scoring rules, managers and the
--   join code are kept. p_clear_squads also empties everyone's current squad.
--   Afterwards every manager is "new" again: unlimited free changes until the
--   first deadline.
-- -----------------------------------------------------------------------------
create or replace function public.admin_reset_season(p_clear_squads boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entries integer;
  v_gameweeks integer;
  v_squads integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  -- Wait for anyone saving a squad right now, so nothing half-finished survives.
  lock table public.gameweeks in exclusive mode;

  select count(*) into v_entries from public.gameweek_entries;

  delete from public.transfers where true;
  delete from public.chip_plays where true;
  delete from public.gameweek_picks where true;
  delete from public.gameweek_entries where true;
  delete from public.rule_results where true;
  delete from public.player_gameweeks where true;

  -- Every gameweek back to open (the delete guard only allows unused, open weeks).
  update public.gameweeks
  set status = 'open', locked_at = null, published_at = null
  where true;

  with removed as (
    delete from public.gameweeks where deadline <= now() returning id
  )
  select count(*) into v_gameweeks from removed;

  if p_clear_squads then
    select count(distinct user_id) into v_squads from public.squad_picks;
    delete from public.squad_picks where true;
  end if;

  return jsonb_build_object('entries', v_entries, 'gameweeks', v_gameweeks, 'squads', v_squads);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: delete a player
--   Refused while the player is in any gameweek history (they scored or were
--   in a locked team); restart the season or mark them unavailable instead.
--   If they're only in current squads, they're removed from those squads
--   (those managers pick a replacement) and the player is deleted.
--   Returns the player's name, photo path and how many squads lost them.
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_player(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
  v_squads integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    raise exception 'That player no longer exists' using errcode = '22023';
  end if;

  if exists (select 1 from public.gameweek_picks where player_id = p_player_id)
     or exists (select 1 from public.rule_results where player_id = p_player_id)
     or exists (select 1 from public.player_gameweeks where player_id = p_player_id)
     or exists (select 1 from public.transfers where player_out_id = p_player_id or player_in_id = p_player_id) then
    raise exception '% has played or been in a locked team this season, so deleting them would change past scores. Mark them as unavailable instead, or restart the season first.', v_player.name
      using errcode = '22023';
  end if;

  with removed as (
    delete from public.squad_picks where player_id = p_player_id returning user_id
  )
  select count(*) into v_squads from removed;

  delete from public.players where id = p_player_id;

  return jsonb_build_object('name', v_player.name, 'photo_path', v_player.photo_path, 'squads', v_squads);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.admin_reset_season(boolean), public.admin_delete_player(uuid) from public, anon;
grant execute on function public.admin_reset_season(boolean), public.admin_delete_player(uuid) to authenticated;

commit;
