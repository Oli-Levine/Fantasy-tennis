-- =============================================================================
-- Fantasy Tennis — FAKE test data
-- 40 fake players, 10 fake managers (with squads) and sample scoring rules.
-- Everything here is marked is_test_data = true. Remove it all with
-- supabase/seed/delete_test_data.sql (or the Admin page, once it exists).
-- Running this again first deletes the previous fake data.
-- =============================================================================

begin;

select private.delete_test_data();

-- -----------------------------------------------------------------------------
-- 40 fake players across the 1s–6s (prices in £m: stronger teams cost more)
-- -----------------------------------------------------------------------------
insert into public.players (name, club_team, price, is_test_data)
values
  -- 1s
  ('Ava Thornton', 1, 12.5, true), ('Ben Achebe', 1, 11.5, true),
  ('Chloe Marsh', 1, 11.0, true), ('Dan Kowalski', 1, 10.5, true),
  ('Ella Fitzgerald', 1, 10.0, true), ('Felix Romero', 1, 9.5, true),
  ('Grace Okoye', 1, 9.0, true),
  -- 2s
  ('Harry Lindqvist', 2, 9.0, true), ('Isla Mensah', 2, 8.5, true),
  ('Jack Pemberton', 2, 8.5, true), ('Kiran Patel', 2, 8.0, true),
  ('Lucy Hargreaves', 2, 8.0, true), ('Max Delacroix', 2, 7.5, true),
  ('Nina Rossi', 2, 7.5, true),
  -- 3s
  ('Oscar Bright', 3, 7.5, true), ('Poppy Adeyemi', 3, 7.0, true),
  ('Quinn Gallagher', 3, 7.0, true), ('Rosa Jimenez', 3, 6.5, true),
  ('Sam Whitaker', 3, 6.5, true), ('Tara Nakamura', 3, 6.0, true),
  ('Umar Siddiqui', 3, 6.0, true),
  -- 4s
  ('Vera Blackwood', 4, 6.0, true), ('Will Carver', 4, 5.5, true),
  ('Xena Morales', 4, 5.5, true), ('Yusuf Demir', 4, 5.0, true),
  ('Zoe Albright', 4, 5.0, true), ('Aaron Fleet', 4, 5.0, true),
  ('Bella Quist', 4, 4.5, true),
  -- 5s
  ('Callum Reid', 5, 5.0, true), ('Daisy Nkemelu', 5, 4.5, true),
  ('Ethan Moss', 5, 4.5, true), ('Freya Lund', 5, 4.0, true),
  ('George Ashby', 5, 4.0, true), ('Hana Sato', 5, 4.0, true),
  -- 6s
  ('Ivan Petrov', 6, 4.0, true), ('Jess Holloway', 6, 3.5, true),
  ('Kai Brennan', 6, 3.5, true), ('Leah Dunmore', 6, 3.5, true),
  ('Milo Tran', 6, 3.0, true), ('Nora Keane', 6, 3.0, true);

-- -----------------------------------------------------------------------------
-- Sample scoring rules (the real ones are set up on the Admin page)
-- -----------------------------------------------------------------------------
insert into public.scoring_rules (name, points, type, category, sort_order, is_test_data)
values
  ('Played a match', 1, 'tick', 'match', 10, true),
  ('Won match', 5, 'tick', 'match', 20, true),
  ('Sets won', 1, 'count', 'match', 30, true),
  ('Bagel (won a set 6–0)', 2, 'count', 'match', 40, true),
  ('Double bagel (won 6–0 6–0)', 5, 'tick', 'match', 50, true),
  ('Got bagelled (lost a set 6–0)', -1, 'count', 'match', 60, true),
  ('Attended social', 2, 'tick', 'other', 70, true),
  ('No-show', -5, 'tick', 'other', 80, true);

-- -----------------------------------------------------------------------------
-- 10 fake managers. They're sign-in accounts that can never actually log in
-- (no password, no Google identity); they exist so the league has rivals.
-- -----------------------------------------------------------------------------
drop table if exists pg_temp.fake_managers;
create temporary table fake_managers (n int, display_name text, team_name text);
insert into fake_managers values
  (1, 'Alex Fern', 'Deuce Bigalow'),
  (2, 'Bea Stone', 'Net Gains'),
  (3, 'Cal Dorsey', 'Grand Slammers'),
  (4, 'Dee Okafor', 'Advantage Me'),
  (5, 'Eli Brook', 'Drop Shot Divas'),
  (6, 'Fran Hale', 'Lob City'),
  (7, 'Gus Patel', 'Ace Ventura'),
  (8, 'Hope Lin', 'Break Point Boys'),
  (9, 'Ian Vale', 'Let It Be'),
  (10, 'Jo Marsh', 'Tie-Break Titans');

-- Creating the sign-in row also creates their profile (via the sign-up trigger).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  ('00000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  'test-manager-' || lpad(n::text, 2, '0') || '@example.invalid',
  '', now(),
  '{"provider": "test", "test_data": true}'::jsonb,
  jsonb_build_object('full_name', display_name),
  now(), now(), '', '', '', ''
from fake_managers;

update public.profiles p
set display_name = f.display_name,
    team_name = f.team_name,
    joined_at = now(),
    is_test_data = true
from fake_managers f
where p.id = ('00000000-0000-4000-a000-' || lpad(f.n::text, 12, '0'))::uuid;

-- -----------------------------------------------------------------------------
-- Give each fake manager a random but valid squad: 5 different players,
-- total £30.0m–£35.0m, captain and vice-captain among the 4 starters.
-- -----------------------------------------------------------------------------
do $$
declare
  v_manager record;
  v_pick uuid[];
  v_total numeric;
  v_budget numeric := (select budget from public.club_settings where id);
  v_attempt int;
begin
  perform setseed(0.42); -- same "random" squads every run

  for v_manager in
    select id from public.profiles where is_test_data order by id
  loop
    v_attempt := 0;
    loop
      v_attempt := v_attempt + 1;
      select array_agg(id), sum(price) into v_pick, v_total
      from (
        select id, price from public.players
        where is_test_data and is_active
        order by random()
        limit 5
      ) s;
      exit when v_total between v_budget - 5 and v_budget;
      if v_attempt > 500 then
        raise exception 'Could not build a squad within budget';
      end if;
    end loop;

    insert into public.squad_picks (user_id, position, player_id, is_captain, is_vice_captain)
    select v_manager.id, ord, pid, ord = 1, ord = 2
    from unnest(v_pick) with ordinality as t(pid, ord);
  end loop;
end;
$$;

drop table fake_managers;

commit;

-- Summary
select
  (select count(*) from public.players where is_test_data) as fake_players,
  (select count(*) from public.scoring_rules where is_test_data) as fake_rules,
  (select count(*) from public.profiles where is_test_data) as fake_managers,
  (select count(*) from public.squad_picks sp
     join public.profiles p on p.id = sp.user_id where p.is_test_data) as fake_squad_picks;
