import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { BenchCard, PlayerCard, type PlayerCardData } from "@/components/app/player-card";
import { StatsHeader } from "@/components/app/stats-header";
import { requireMember } from "@/lib/auth";
import { chipInfo } from "@/lib/chips";
import type { Chip, GameweekStatus, Player } from "@/lib/database.types";
import { DEMO_PLAYERS, DEMO_SQUAD_PICKS } from "@/lib/dev-fixtures";
import { devAuthBypass } from "@/lib/env";
import { clubTeamLabel, playerPhotoUrl } from "@/lib/players";
import { BENCH_POSITION, scoreEntry, type EntryPick, type EntryScore, type PlayerScore } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team · League" };

type EntryView = {
  gameweekId: number;
  number: number;
  status: GameweekStatus;
  chip: Chip | null;
  transfersMade: number;
  transferHit: number;
};

type TeamView = {
  teamName: string;
  displayName: string;
  /** Locked/published gameweeks this manager has a team in (newest first). */
  entries: EntryView[];
  selected: EntryView | null;
  picks: EntryPick[];
  players: Map<string, Player>;
  /** Only for published gameweeks. */
  score: EntryScore | null;
};

export default async function LeagueTeamPage({ params, searchParams }: PageProps<"/league/[userId]">) {
  await requireMember();
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId) && !devAuthBypass()) notFound();
  const { gw } = await searchParams;
  const requested = Number(Array.isArray(gw) ? gw[0] : gw);
  const view = devAuthBypass() ? demoTeam() : await loadTeam(userId, Number.isInteger(requested) ? requested : null);
  if (!view) notFound();

  const { selected, score } = view;
  const breakdown = new Map(score?.picks.map((p) => [p.playerId, p]));
  const card = (pick: EntryPick): PlayerCardData | null => {
    const player = view.players.get(pick.playerId);
    if (!player) return null;
    const b = breakdown.get(pick.playerId);
    const tripled = selected?.chip === "triple_captain";
    const gotArmband = score?.multiplierPlayerId === pick.playerId;
    return {
      name: player.name,
      clubTeam: clubTeamLabel(player.club_team),
      price: player.price,
      photoUrl: playerPhotoUrl(player.photo_path),
      lastPoints: b ? (pick.position === BENCH_POSITION ? b.basePoints : b.points) : null,
      badge: pick.isCaptain ? (tripled ? "TC" : "C") : pick.isViceCaptain ? "VC" : null,
      tag: b?.autoSubbedIn
        ? "Subbed on"
        : b?.didNotPlay
          ? "Didn't play"
          : gotArmband && pick.isViceCaptain
            ? `Got ${tripled ? 3 : 2}×`
            : null,
    };
  };
  const starters = view.picks.filter((p) => p.position !== BENCH_POSITION);
  const bench = view.picks.find((p) => p.position === BENCH_POSITION);
  const benchCard = bench ? card(bench) : null;

  return (
    <div className="space-y-4">
      <Link
        href="/league"
        className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        League
      </Link>

      {!selected ? (
        <EmptyState
          icon={Lock}
          title={view.teamName}
          description="Squads appear here once a gameweek's deadline has passed and teams are locked in."
        />
      ) : (
        <section className="rounded-panel bg-card p-4 shadow-soft sm:p-5">
          <StatsHeader
            eyebrow={<span className="text-xs font-semibold tracking-wide text-muted-foreground">{view.displayName}</span>}
            title={view.teamName}
            stats={[
              {
                label: `GW${selected.number} points`,
                value: score ? score.total : <span className="text-muted-foreground">–</span>,
              },
              {
                label: "Transfers",
                value: (
                  <>
                    {selected.transfersMade}
                    {score && score.hit > 0 && <span className="text-primary"> (−{score.hit})</span>}
                  </>
                ),
              },
              {
                label: "Chip",
                value: selected.chip ? <span className="text-gold-ink">{chipInfo(selected.chip).name}</span> : "–",
              },
            ]}
          />

          <nav className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5" aria-label="Gameweek">
            {view.entries.map((e) => (
              <Link
                key={e.gameweekId}
                href={`/league/${userId}?gw=${e.gameweekId}`}
                aria-current={e.gameweekId === selected.gameweekId ? "page" : undefined}
                className={cn(
                  "h-9 shrink-0 rounded-full px-4 text-sm leading-9 font-medium transition-colors",
                  e.gameweekId === selected.gameweekId ? "bg-ink text-white" : "bg-muted text-muted-foreground",
                )}
              >
                GW{e.number}
              </Link>
            ))}
          </nav>

          {!score && (
            <p className="mt-3 rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-muted-foreground">
              Locked in. Points appear when gameweek {selected.number} is published.
            </p>
          )}

          <h2 className="mt-4 mb-3 text-sm font-semibold text-muted-foreground">Starters</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            {starters.map((p) => {
              const data = card(p);
              return data && <PlayerCard key={p.playerId} player={data} />;
            })}
          </div>
          {benchCard && (
            <>
              <h2 className="mt-6 mb-3 text-sm font-semibold text-muted-foreground">Bench</h2>
              <BenchCard player={benchCard} />
            </>
          )}

          {score && (
            <dl className="mt-5 space-y-1 rounded-xl bg-muted/60 p-3 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Players</dt>
                <dd>{score.gross}</dd>
              </div>
              {score.hit > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Transfer hit</dt>
                  <dd className="text-primary">−{score.hit}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <dt>Gameweek total</dt>
                <dd>{score.total}</dd>
              </div>
            </dl>
          )}
        </section>
      )}
    </div>
  );
}

async function loadTeam(userId: string, requestedGameweek: number | null): Promise<TeamView | null> {
  const supabase = await createClient();
  const [profile, entries] = await Promise.all([
    supabase.from("profiles").select("team_name, display_name").eq("id", userId).not("joined_at", "is", null).maybeSingle(),
    // RLS only returns gameweeks whose deadline has passed.
    supabase.from("gameweek_entries").select("gameweek_id, chip, transfers_made, transfer_hit").eq("user_id", userId),
  ]);
  if (profile.error || entries.error) throw new Error(`Couldn't load that team: ${(profile.error ?? entries.error)!.message}`);
  if (!profile.data) return null;

  const ids = entries.data!.map((e) => e.gameweek_id);
  const { data: gameweeks, error: gwError } = ids.length
    ? await supabase.from("gameweeks").select("id, number, status").in("id", ids).neq("status", "open").order("deadline", { ascending: false })
    : { data: [], error: null };
  if (gwError) throw new Error(`Couldn't load that team: ${gwError.message}`);

  const views: EntryView[] = gameweeks!.map((g) => {
    const e = entries.data!.find((x) => x.gameweek_id === g.id)!;
    return { gameweekId: g.id, number: g.number, status: g.status, chip: e.chip, transfersMade: e.transfers_made, transferHit: e.transfer_hit };
  });
  const selected = views.find((v) => v.gameweekId === requestedGameweek) ?? views[0] ?? null;
  const base = { teamName: profile.data.team_name ?? "Unnamed team", displayName: profile.data.display_name, entries: views, selected };
  if (!selected) return { ...base, picks: [], players: new Map(), score: null };

  const published = selected.status === "published";
  const [picks, players, appearances] = await Promise.all([
    supabase
      .from("gameweek_picks")
      .select("position, player_id, is_captain, is_vice_captain")
      .eq("user_id", userId)
      .eq("gameweek_id", selected.gameweekId)
      .order("position"),
    supabase.from("players").select("*"),
    published
      ? supabase.from("player_gameweeks").select("player_id, did_not_play, points").eq("gameweek_id", selected.gameweekId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = [picks, players, appearances].find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't load that team: ${failed.error.message}`);

  const entryPicks: EntryPick[] = picks.data!.map((p) => ({
    position: p.position,
    playerId: p.player_id,
    isCaptain: p.is_captain,
    isViceCaptain: p.is_vice_captain,
  }));
  const scores: Record<string, PlayerScore> = {};
  for (const a of appearances.data!) scores[a.player_id] = { points: a.points ?? 0, didNotPlay: a.did_not_play };

  return {
    ...base,
    picks: entryPicks,
    players: new Map(players.data!.map((p) => [p.id, p])),
    score: published ? scoreEntry({ picks: entryPicks, chip: selected.chip, transferHit: selected.transferHit }, scores) : null,
  };
}

function demoTeam(): TeamView {
  const picks = DEMO_SQUAD_PICKS.map((p) => ({ position: p.position, playerId: p.player_id, isCaptain: p.is_captain, isViceCaptain: p.is_vice_captain }));
  const entries: EntryView[] = [
    { gameweekId: 2, number: 2, status: "published", chip: null, transfersMade: 2, transferHit: 5 },
    { gameweekId: 1, number: 1, status: "published", chip: null, transfersMade: 0, transferHit: 0 },
  ];
  const scores: Record<string, PlayerScore> = {
    p1: { points: 9, didNotPlay: false },
    p3: { points: 6, didNotPlay: false },
    p4: { points: 2, didNotPlay: true },
    p12: { points: 11, didNotPlay: false },
    p7: { points: 4, didNotPlay: false },
  };
  return {
    teamName: "Net Gains",
    displayName: "Priya Shah",
    entries,
    selected: entries[0],
    picks,
    players: new Map(DEMO_PLAYERS.map((p) => [p.id, p])),
    score: scoreEntry({ picks, chip: null, transferHit: 5 }, scores),
  };
}
