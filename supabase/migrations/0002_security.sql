-- =============================================================================
-- Fantasy Tennis — 0002: Row Level Security, permissions and photo storage
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- Principles:
--   * Signed-out visitors (anon) can read nothing.
--   * Only club members (joined with the code) can read game data.
--   * Only admins can change players, rules, gameweeks and results.
--   * Squads, transfers, chips and snapshots are changed only by server-side
--     functions (added in later phases) that enforce budget and deadlines.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Table permissions (what each role may attempt; RLS then filters rows)
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- Read access for signed-in users (RLS narrows it to members / own rows).
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Profiles: users may only change their own display and team name.
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, team_name) on public.profiles to authenticated;

-- Admin-managed tables.
revoke insert, update, delete on public.club_settings from authenticated;
grant update (season_name, budget, free_transfers_per_gameweek, transfer_hit_points)
  on public.club_settings to authenticated;
grant insert, update, delete on
  public.players, public.scoring_rules, public.gameweeks,
  public.player_gameweeks, public.rule_results
  to authenticated;

-- System-managed tables: no direct writes from the app.
revoke insert, update, delete on
  public.squad_picks, public.chip_plays, public.transfers,
  public.gameweek_entries, public.gameweek_picks
  from authenticated;

-- Functions: signed-in users only (each one checks membership/admin itself).
revoke execute on function
  public.join_club(text), public.get_join_code(), public.set_join_code(text),
  public.set_user_role(uuid, text), public.remove_user(uuid),
  public.admin_delete_test_data()
  from public, anon;
grant execute on function
  public.join_club(text), public.get_join_code(), public.set_join_code(text),
  public.set_user_role(uuid, text), public.remove_user(uuid),
  public.admin_delete_test_data(),
  public.is_member(), public.is_admin(),
  public.gameweek_is_visible(bigint), public.gameweek_is_published(bigint)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security: on for every table
-- -----------------------------------------------------------------------------

alter table public.club_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.gameweeks enable row level security;
alter table public.squad_picks enable row level security;
alter table public.chip_plays enable row level security;
alter table public.transfers enable row level security;
alter table public.gameweek_entries enable row level security;
alter table public.gameweek_picks enable row level security;
alter table public.player_gameweeks enable row level security;
alter table public.rule_results enable row level security;
alter table private.club_secrets enable row level security; -- no policies: API can't touch it

-- Helper: drop every existing policy on a table so this file can be re-run.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

-- club_settings ----------------------------------------------------------------
create policy "members read settings" on public.club_settings
  for select to authenticated using (public.is_member());
create policy "admins update settings" on public.club_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles ---------------------------------------------------------------------
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "members read members" on public.profiles
  for select to authenticated using (public.is_member() and joined_at is not null);
create policy "admins read everyone" on public.profiles
  for select to authenticated using (public.is_admin());
-- Only members (joined with the code) can set their names / team name.
create policy "members update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid() and joined_at is not null)
  with check (id = auth.uid() and joined_at is not null);

-- players, scoring_rules, gameweeks: members read, admins write ------------------
create policy "members read players" on public.players
  for select to authenticated using (public.is_member());
create policy "admins insert players" on public.players
  for insert to authenticated with check (public.is_admin());
create policy "admins update players" on public.players
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete players" on public.players
  for delete to authenticated using (public.is_admin());

create policy "members read rules" on public.scoring_rules
  for select to authenticated using (public.is_member());
create policy "admins insert rules" on public.scoring_rules
  for insert to authenticated with check (public.is_admin());
create policy "admins update rules" on public.scoring_rules
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete rules" on public.scoring_rules
  for delete to authenticated using (public.is_admin());

create policy "members read gameweeks" on public.gameweeks
  for select to authenticated using (public.is_member());
create policy "admins insert gameweeks" on public.gameweeks
  for insert to authenticated with check (public.is_admin());
create policy "admins update gameweeks" on public.gameweeks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete gameweeks" on public.gameweeks
  for delete to authenticated using (public.is_admin());

-- Current squads: only your own (others are visible via locked snapshots) ------
create policy "read own squad" on public.squad_picks
  for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "admins read squads" on public.squad_picks
  for select to authenticated using (public.is_admin());

-- Chips and transfers: your own any time; others' once that gameweek is locked --
create policy "read own chips" on public.chip_plays
  for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "read locked chips" on public.chip_plays
  for select to authenticated
  using (public.is_member() and public.gameweek_is_visible(gameweek_id));

create policy "read own transfers" on public.transfers
  for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "read locked transfers" on public.transfers
  for select to authenticated
  using (public.is_member() and public.gameweek_is_visible(gameweek_id));

-- Snapshots: your own any time; everyone's once the deadline has passed --------
create policy "read own entries" on public.gameweek_entries
  for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "read locked entries" on public.gameweek_entries
  for select to authenticated
  using (public.is_member() and public.gameweek_is_visible(gameweek_id));

create policy "read own snapshot picks" on public.gameweek_picks
  for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy "read locked snapshot picks" on public.gameweek_picks
  for select to authenticated
  using (public.is_member() and public.gameweek_is_visible(gameweek_id));

-- Results: members see published gameweeks; admins see and edit drafts ---------
create policy "members read published appearances" on public.player_gameweeks
  for select to authenticated
  using (public.is_member() and public.gameweek_is_published(gameweek_id));
create policy "admins read appearances" on public.player_gameweeks
  for select to authenticated using (public.is_admin());
create policy "admins insert appearances" on public.player_gameweeks
  for insert to authenticated with check (public.is_admin());
create policy "admins update appearances" on public.player_gameweeks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete appearances" on public.player_gameweeks
  for delete to authenticated using (public.is_admin());

create policy "members read published results" on public.rule_results
  for select to authenticated
  using (public.is_member() and public.gameweek_is_published(gameweek_id));
create policy "admins read results" on public.rule_results
  for select to authenticated using (public.is_admin());
create policy "admins insert results" on public.rule_results
  for insert to authenticated with check (public.is_admin());
create policy "admins update results" on public.rule_results
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete results" on public.rule_results
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Player photos: public bucket (anyone can view a photo), admins upload/change
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins read player photos" on storage.objects;
drop policy if exists "admins upload player photos" on storage.objects;
drop policy if exists "admins update player photos" on storage.objects;
drop policy if exists "admins delete player photos" on storage.objects;

-- Viewing photos uses the public URL; this lets admins list/replace files.
create policy "admins read player photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'player-photos' and public.is_admin());
create policy "admins upload player photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-photos' and public.is_admin());
create policy "admins update player photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'player-photos' and public.is_admin())
  with check (bucket_id = 'player-photos' and public.is_admin());
create policy "admins delete player photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'player-photos' and public.is_admin());

commit;
