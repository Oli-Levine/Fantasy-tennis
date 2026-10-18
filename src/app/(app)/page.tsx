import Link from "next/link";
import { ChevronRight, Sparkles, Trophy, Users } from "lucide-react";
import { DeadlineCountdown } from "@/components/app/deadline-countdown";
import { EmptyState } from "@/components/app/empty-state";
import { InstallPrompt } from "@/components/app/install-prompt";
import { BenchCard, PlayerCard, type PlayerCardData } from "@/components/app/player-card";
import { StatsHeader } from "@/components/app/stats-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import { chipInfo } from "@/lib/chips";
import { formatPrice, shortName } from "@/lib/format";
import { loadLastScore } from "@/lib/last-score";
import { clubTeamLabel, playerPhotoUrl } from "@/lib/players";
import { BENCH_INDEX, fromPicks, isFull, round1, squadCost } from "@/lib/squad";
import { ordinal } from "@/lib/format";
import { loadLeague } from "@/lib/league-data";
import { loadTeamData } from "@/lib/team-data";
import { formatLondonDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const { user, profile } = await requireMember();
  const [{ players, picks, budget, nextGameweek, stats, activeChip }, league] = await Promise.all([
    loadTeamData(user.id),
    loadLeague(),
  ]);
  const me = league.standings.find((r) => r.userId === user.id);
  const ranked = league.latest != null && me != null;
  const last = await loadLastScore(user.id, league.latest);
  // What each player scored for this manager last gameweek (captain doubled, bench only if subbed on).
  const lastBreakdown = new Map(last?.score.picks.map((p) => [p.playerId, p]));

  const byId = new Map(players.map((p) => [p.id, p]));
  const squad = fromPicks(picks);
  const left = round1(budget - squadCost(squad, (id) => byId.get(id)?.price ?? 0));

  const card = (index: number): PlayerCardData | null => {
    const slot = squad[index];
    const player = slot && byId.get(slot.playerId);
    if (!player) return null;
    return {
      name: player.name,
      clubTeam: clubTeamLabel(player.club_team),
      price: player.price,
      photoUrl: playerPhotoUrl(player.photo_path),
      lastPoints: lastBreakdown.get(player.id)?.points ?? stats[player.id]?.last ?? null,
      badge: slot.isCaptain ? (activeChip === "triple_captain" ? "TC" : "C") : slot.isViceCaptain ? "VC" : null,
      unavailable: !player.is_active,
      tag: lastTag(player.id),
    };
  };
  function lastTag(playerId: string) {
    const b = lastBreakdown.get(playerId);
    if (!b) return null;
    if (b.autoSubbedIn) return "Subbed on";
    if (b.didNotPlay) return "Didn't play";
    if (b.multiplier > 1) return `${b.multiplier}×`;
    return null;
  }
  const bench = card(BENCH_INDEX);
  const benchPlayer = last?.score.picks.find((p) => p.autoSubbedIn);
  const armbandPlayer = last?.score.picks.find((p) => p.playerId === last.score.multiplierPlayerId);
  const lastCaptain = last?.picks.find((p) => p.isCaptain);
  const captainMissed = last != null && lastCaptain != null && last.score.multiplierPlayerId !== lastCaptain.playerId;

  return (
    <div className="space-y-4">
      {profile.is_playing === false && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <strong className="text-foreground">You&apos;re not playing this season.</strong> You can still pick a team to
          try things out, but it won&apos;t be locked in at deadlines and you won&apos;t appear in the league. Change this
          in Admin → Users.
        </p>
      )}
      {activeChip && (
        <Link
          href="/team"
          className="flex items-center gap-3 rounded-panel bg-gold p-4 text-ink shadow-soft transition-transform active:scale-[0.99]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-gold">
            <Sparkles className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-heading font-semibold">
              {chipInfo(activeChip).name} active{nextGameweek ? ` for GW${nextGameweek.number}` : ""}
            </span>
            <span className="block text-sm leading-snug">{chipInfo(activeChip).summary}</span>
          </span>
        </Link>
      )}
      <section className="on-dark rounded-glass bg-navy-glass p-4 shadow-soft sm:p-5">
        <StatsHeader
          eyebrow={
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">
              {nextGameweek ? `Gameweek ${nextGameweek.number}` : "Pre-season"}
            </span>
          }
          title={profile.team_name}
          stats={[
            { label: "Budget left", value: formatPrice(left) },
            { label: "Deadline", value: <DeadlineCountdown deadline={nextGameweek?.deadline ?? null} /> },
            {
              label: league.latest ? `GW${league.latest.number} pts` : "GW points",
              value: ranked ? (me.gameweekPoints ?? "–") : "–",
            },
            { label: "Rank", value: ranked ? ordinal(me.rank) : "–" },
          ]}
        />

        {nextGameweek && (
          <p className="mt-3 text-xs text-muted-foreground">
            GW{nextGameweek.number} deadline:{" "}
            <strong className="font-semibold text-foreground">{formatLondonDateTime(new Date(nextGameweek.deadline))}</strong>
          </p>
        )}

        {last && (
          <Link
            href={`/league/${user.id}?gw=${last.gameweekId}`}
            className="mt-4 flex items-center gap-3 rounded-xl bg-muted/70 px-3 py-2.5 text-sm transition-colors hover:bg-muted"
          >
            <span className="min-w-0 flex-1 leading-snug">
              <strong className="font-heading">
                GW{last.number}: {last.score.total} pts
              </strong>
              <span className="text-muted-foreground">
                {captainMissed &&
                  ` · Captain didn't play${armbandPlayer ? `, so ${shortName(byId.get(armbandPlayer.playerId)?.name ?? "the vice-captain")} got ×${armbandPlayer.multiplier}` : ""}`}
                {!captainMissed &&
                  armbandPlayer &&
                  ` · ${shortName(byId.get(armbandPlayer.playerId)?.name ?? "Captain")} ×${armbandPlayer.multiplier}`}
                {benchPlayer && ` · ${shortName(byId.get(benchPlayer.playerId)?.name ?? "Bench")} subbed on`}
                {last.score.hit > 0 && ` · −${last.score.hit} hit`}
              </span>
            </span>
            <span className="flex shrink-0 items-center text-xs font-medium text-primary">
              Breakdown
              <ChevronRight className="size-4" />
            </span>
          </Link>
        )}
      </section>

      <section className="rounded-panel bg-card p-4 shadow-soft sm:p-5">
        {isFull(squad) ? (
          <>
            <h2 className="mb-3 w-fit rounded-full bg-navy px-3 py-1 text-[14px] text-white">Starters</h2>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
              {[0, 1, 2, 3].map((i) => {
                const data = card(i);
                return data && <PlayerCard key={i} player={data} />;
              })}
            </div>
            {bench && (
              <>
                <h2 className="mt-6 mb-3 w-fit rounded-full bg-navy px-3 py-1 text-[14px] text-white">Bench</h2>
                <BenchCard player={bench} />
              </>
            )}
            <Button asChild variant="soft" className="mt-5 w-full">
              <Link href="/team">Edit team</Link>
            </Button>
          </>
        ) : (
          <EmptyState
            className="shadow-none"
            icon={Users}
            title={picks.length ? "Finish picking your team" : "Pick your team"}
            description={`Choose 4 starters and 1 bench player within ${formatPrice(budget)}, then pick a captain.`}
            action={
              <Button asChild>
                <Link href="/team">Go to Team</Link>
              </Button>
            }
          />
        )}
      </section>

      {league.latest && league.standings.length > 0 && (
        <LeagueSnapshot rows={league.standings} userId={user.id} gameweekNumber={league.latest.number} />
      )}

      <InstallPrompt />
    </div>
  );
}

/** Top 3, plus your own position if you're not in it. */
function LeagueSnapshot({
  rows,
  userId,
  gameweekNumber,
}: {
  rows: Awaited<ReturnType<typeof loadLeague>>["standings"];
  userId: string;
  gameweekNumber: number;
}) {
  const top = rows.slice(0, 3);
  const mine = rows.find((r) => r.userId === userId);
  const shown = mine && !top.includes(mine) ? [...top, mine] : top;
  return (
    <section className="rounded-panel bg-card p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-gold" />
          League
        </h2>
        <span className="text-xs text-muted-foreground">After GW{gameweekNumber}</span>
      </div>
      <ol>
        {shown.map((row, i) => (
          <li key={row.userId}>
            {i === 3 && <div className="my-1 text-center text-xs leading-none text-muted-foreground">⋯</div>}
            <Link
              href={`/league/${row.userId}`}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60",
                row.userId === userId && "bg-primary-soft/50",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold",
                  row.rank <= 3 && row.total > 0 ? "bg-gold text-ink" : "bg-muted",
                )}
              >
                {row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.teamName}</span>
              <span className="font-heading text-sm font-semibold tabular-nums">{row.total}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Button asChild variant="soft" size="sm" className="mt-2 w-full">
        <Link href="/league">Full table</Link>
      </Button>
    </section>
  );
}
