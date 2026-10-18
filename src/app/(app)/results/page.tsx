import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { AdminHeader } from "@/components/app/admin-header";
import { EmptyState } from "@/components/app/empty-state";
import { requireResultsEntry } from "@/lib/auth";
import type { Gameweek, Player, ScoringRule } from "@/lib/database.types";
import { DEMO_GAMEWEEKS, DEMO_PLAYERS, DEMO_RULES } from "@/lib/dev-fixtures";
import { devAuthBypass } from "@/lib/env";
import type { PlayerResult } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { ResultsGrid } from "./results-grid";

export const metadata: Metadata = { title: "Results" };

export type ResultsData = {
  /** Gameweeks past their deadline (newest first). */
  gameweeks: Pick<Gameweek, "id" | "number" | "deadline" | "status">[];
  gameweek: Pick<Gameweek, "id" | "number" | "deadline" | "status"> | null;
  players: Player[];
  rules: ScoringRule[];
  results: Record<string, PlayerResult>;
  /** How many managers have each player in their locked team this gameweek. */
  pickedBy: Record<string, number>;
  managers: number;
  /** Display name of whoever last saved each player's results. */
  enteredBy: Record<string, string>;
};

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  const { isAdmin } = await requireResultsEntry();
  const { gw } = await searchParams;
  const requested = Number(Array.isArray(gw) ? gw[0] : gw);
  const data = devAuthBypass() ? demoResults() : await loadResults(Number.isInteger(requested) ? requested : null);

  return (
    <>
      <AdminHeader
        title="Results"
        subtitle={
          isAdmin
            ? "Tick what each player did, save a draft, then publish."
            : "Tick what each player did and save a draft. An admin publishes the points."
        }
        backToAdmin={isAdmin}
      />
      {data.gameweek ? (
        <ResultsGrid key={data.gameweek.id} {...data} gameweek={data.gameweek} isAdmin={isAdmin} />
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Nothing to score yet"
          description="Results can be entered once a gameweek's deadline has passed and teams are locked."
        />
      )}
    </>
  );
}

async function loadResults(requestedId: number | null): Promise<ResultsData> {
  const supabase = await createClient();
  await supabase.rpc("sync_gameweeks"); // lock anything past its deadline first

  const { data: gameweeks, error } = await supabase
    .from("gameweeks")
    .select("id, number, deadline, status")
    .eq("is_blank", false)
    .neq("status", "open")
    .order("deadline", { ascending: false });
  if (error) throw new Error(`Couldn't load gameweeks: ${error.message}`);

  // Default: the oldest gameweek still waiting to be published, else the latest.
  const gameweek =
    gameweeks.find((g) => g.id === requestedId) ??
    gameweeks.findLast((g) => g.status === "locked") ??
    gameweeks[0] ??
    null;
  if (!gameweek) {
    return { gameweeks: [], gameweek: null, players: [], rules: [], results: {}, pickedBy: {}, managers: 0, enteredBy: {} };
  }

  const [players, rules, ruleResults, appearances, picks, entries] = await Promise.all([
    supabase.from("players").select("*").order("club_team").order("name"),
    supabase.from("scoring_rules").select("*").order("sort_order").order("name"),
    supabase.from("rule_results").select("player_id, rule_id, count").eq("gameweek_id", gameweek.id),
    supabase.from("player_gameweeks").select("player_id, did_not_play, entered_by").eq("gameweek_id", gameweek.id),
    supabase.from("gameweek_picks").select("player_id").eq("gameweek_id", gameweek.id),
    supabase.from("gameweek_entries").select("user_id", { count: "exact", head: true }).eq("gameweek_id", gameweek.id),
  ]);
  const failed = [players, rules, ruleResults, appearances, picks, entries].find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't load results: ${failed.error.message}`);

  const results: Record<string, PlayerResult> = {};
  for (const a of appearances.data!) results[a.player_id] = { didNotPlay: a.did_not_play, counts: {} };
  for (const r of ruleResults.data!) (results[r.player_id] ??= { didNotPlay: false, counts: {} }).counts[r.rule_id] = r.count;

  const enterers = [...new Set(appearances.data!.flatMap((a) => (a.entered_by ? [a.entered_by] : [])))];
  const names = new Map<string, string>();
  if (enterers.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, display_name").in("id", enterers);
    if (profilesError) throw new Error(`Couldn't load results: ${profilesError.message}`);
    for (const p of profiles) names.set(p.id, p.display_name);
  }
  const enteredBy: Record<string, string> = {};
  for (const a of appearances.data!) {
    const name = a.entered_by && names.get(a.entered_by);
    if (name) enteredBy[a.player_id] = name;
  }

  const pickedBy: Record<string, number> = {};
  for (const p of picks.data!) pickedBy[p.player_id] = (pickedBy[p.player_id] ?? 0) + 1;

  // Archived rules only appear if this gameweek already uses them.
  const used = new Set(ruleResults.data!.map((r) => r.rule_id));
  return {
    gameweeks,
    gameweek,
    players: players.data!,
    rules: rules.data!.filter((r) => !r.archived_at || used.has(r.id)),
    results,
    pickedBy,
    managers: entries.count ?? 0,
    enteredBy,
  };
}

function demoResults(): ResultsData {
  const gameweeks = DEMO_GAMEWEEKS.filter((g) => g.status !== "open" && !g.is_blank).reverse();
  const [p0, p1, p2, p3] = DEMO_PLAYERS;
  return {
    gameweeks,
    gameweek: gameweeks.find((g) => g.status === "locked") ?? gameweeks[0],
    players: [...DEMO_PLAYERS].sort((a, b) => a.club_team - b.club_team || a.name.localeCompare(b.name)),
    rules: DEMO_RULES.filter((r) => !r.archived_at),
    results: {
      [p0.id]: { didNotPlay: false, counts: { r0: 1, r1: 1, r2: 2 } },
      [p1.id]: { didNotPlay: false, counts: { r0: 1, r2: 1, r4: 1 } },
      [p2.id]: { didNotPlay: true, counts: { r5: 1 } },
      [p3.id]: { didNotPlay: false, counts: { r0: 1, r1: 1, r2: 2, r3: 1 } },
    },
    pickedBy: { p1: 6, p3: 4, p4: 3, p7: 2, p12: 5 },
    managers: 10,
    enteredBy: { [p0.id]: "Priya Shah", [p1.id]: "Priya Shah", [p2.id]: "Dev Player", [p3.id]: "Dev Player" },
  };
}
