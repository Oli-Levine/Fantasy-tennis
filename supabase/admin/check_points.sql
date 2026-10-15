-- =============================================================================
-- Read-only check: compares each real manager's stored gameweek points with
-- what the scoring rules say they should be. Changes nothing.
-- Paste into Supabase → SQL Editor → Run, then screenshot the results.
-- =============================================================================
with picks as (
  select gp.user_id, gp.gameweek_id, gp.position, gp.is_captain, gp.is_vice_captain,
         pl.name, coalesce(pg.points, 0) as pts, coalesce(pg.did_not_play, false) as dnp
  from public.gameweek_picks gp
  join public.players pl on pl.id = gp.player_id
  left join public.player_gameweeks pg on pg.gameweek_id = gp.gameweek_id and pg.player_id = gp.player_id
),
per_entry as (
  select user_id, gameweek_id,
    sum(pts) filter (where position <= 4) as starters,
    max(pts) filter (where position = 5) as bench,
    bool_or(dnp) filter (where position <= 4) as starter_missed,
    max(name) filter (where is_captain) as captain,
    max(pts) filter (where is_captain) as captain_pts,
    bool_or(dnp) filter (where is_captain) as captain_dnp,
    max(name) filter (where is_vice_captain) as vice,
    max(pts) filter (where is_vice_captain) as vice_pts,
    bool_or(dnp) filter (where is_vice_captain) as vice_dnp,
    count(*) as picks
  from picks
  group by user_id, gameweek_id
)
select
  pr.team_name as team,
  g.number as gw,
  g.status,
  e.chip,
  e.transfers_made,
  e.transfer_hit,
  x.picks,
  x.captain,
  x.captain_pts,
  x.starters,
  x.bench,
  e.points as stored_points,
  x.starters
    + case when x.starter_missed then coalesce(x.bench, 0) else 0 end
    + (case when e.chip = 'triple_captain' then 2 else 1 end)
      * case when x.captain is not null and not x.captain_dnp then x.captain_pts
             when x.vice is not null and not x.vice_dnp then x.vice_pts else 0 end
    - case when e.chip in ('wildcard', 'free_hit') then 0 else e.transfer_hit end as expected_points
from public.gameweek_entries e
join public.gameweeks g on g.id = e.gameweek_id
join public.profiles pr on pr.id = e.user_id and not pr.is_test_data
left join per_entry x on x.user_id = e.user_id and x.gameweek_id = e.gameweek_id
order by g.number, pr.team_name;
