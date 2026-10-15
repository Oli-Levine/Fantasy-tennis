"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { DeadlineCountdown } from "@/components/app/deadline-countdown";
import { BenchCard, EmptySlotCard, PlayerCard, type PlayerCardData } from "@/components/app/player-card";
import { StatsHeader } from "@/components/app/stats-header";
import { Button } from "@/components/ui/button";
import type { Player } from "@/lib/database.types";
import { formatPrice } from "@/lib/format";
import { clubTeamLabel, playerPhotoUrl } from "@/lib/players";
import {
  BENCH_INDEX,
  addPlayer,
  autoPick,
  emptySquad,
  fromPicks,
  playerIds,
  removePlayer,
  round1,
  setCaptain,
  setViceCaptain,
  squadCost,
  squadProblems,
  swapSlots,
  toPicks,
  type Squad,
} from "@/lib/squad";
import type { TeamData } from "@/lib/team-data";
import { formatLondonDateTime } from "@/lib/time";
import { saveSquadAction } from "./actions";
import { PlayerPool } from "./player-pool";
import { PlayerSheet } from "./player-sheet";

export function TeamBuilder({
  teamName,
  players,
  picks,
  budget,
  nextGameweek,
  canChangePlayers,
  stats,
}: TeamData & { teamName: string }) {
  const router = useRouter();
  const saved = useMemo(() => fromPicks(picks), [picks]);
  const [squad, setSquad] = useState<Squad>(saved);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const poolRef = useRef<HTMLElement>(null);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const priceOf = (id: string) => byId.get(id)?.price ?? 0;
  const cost = squadCost(squad, priceOf);
  const left = round1(budget - cost);
  const problems = squadProblems(squad, cost, budget);
  const dirty = JSON.stringify(toPicks(squad)) !== JSON.stringify(toPicks(saved));
  const count = playerIds(squad).length;

  const cardData = (player: Player, index: number): PlayerCardData => {
    const slot = squad[index]!;
    return {
      name: player.name,
      clubTeam: clubTeamLabel(player.club_team),
      price: player.price,
      photoUrl: playerPhotoUrl(player.photo_path),
      lastPoints: stats[player.id]?.last ?? null,
      badge: slot.isCaptain ? "C" : slot.isViceCaptain ? "VC" : null,
      unavailable: !player.is_active,
    };
  };

  function scrollToPool() {
    poolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function save() {
    startSaving(async () => {
      const result = await saveSquadAction(toPicks(squad));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(nextGameweek ? `Team saved for gameweek ${nextGameweek.number}` : "Team saved");
      router.refresh();
    });
  }

  const selectedIndex = selected ? squad.findIndex((s) => s?.playerId === selected) : -1;

  return (
    <div className="space-y-4">
      <section className="rounded-panel bg-card p-4 shadow-soft sm:p-5">
        <StatsHeader
          title={teamName}
          eyebrow={
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">
              {nextGameweek ? `Gameweek ${nextGameweek.number}` : "Your squad"}
            </span>
          }
          actions={
            canChangePlayers && (
              <>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={count === 5}
                  onClick={() => setSquad((s) => autoPick(s, players, budget))}
                >
                  <Shuffle />
                  Auto-pick
                </Button>
                <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => setSquad(emptySquad())}>
                  <RotateCcw />
                  Clear
                </Button>
              </>
            )
          }
          stats={[
            { label: "Players", value: `${count} / 5` },
            { label: "Budget left", value: <span className={left < 0 ? "text-primary" : ""}>{formatPrice(left)}</span> },
            { label: "Until deadline", value: <DeadlineCountdown deadline={nextGameweek?.deadline ?? null} /> },
          ]}
        />

        <h2 className="mt-4 mb-3 text-sm font-semibold text-muted-foreground">Starters</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          {squad.slice(0, BENCH_INDEX).map((slot, i) => {
            const player = slot && byId.get(slot.playerId);
            return player ? (
              <PlayerCard key={player.id} player={cardData(player, i)} onClick={() => setSelected(player.id)} />
            ) : (
              <EmptySlotCard key={`empty-${i}`} label="Add starter" onClick={canChangePlayers ? scrollToPool : undefined} />
            );
          })}
        </div>

        <h2 className="mt-6 mb-3 text-sm font-semibold text-muted-foreground">Bench</h2>
        {(() => {
          const slot = squad[BENCH_INDEX];
          const player = slot && byId.get(slot.playerId);
          return player ? (
            <BenchCard player={cardData(player, BENCH_INDEX)} onClick={() => setSelected(player.id)} />
          ) : (
            <EmptySlotCard bench label="Add bench player" onClick={canChangePlayers ? scrollToPool : undefined} />
          );
        })()}
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          The bench player only scores if a starter doesn&apos;t play. Tap a player for captain and bench options.
        </p>
      </section>

      <DeadlineNote nextGameweek={nextGameweek} canChangePlayers={canChangePlayers} />

      <PlayerPool
        ref={poolRef}
        players={players}
        squad={squad}
        budgetLeft={left}
        canChangePlayers={canChangePlayers}
        stats={stats}
        onAdd={(id) => setSquad((s) => addPlayer(s, id))}
        onRemove={(id) => setSquad((s) => removePlayer(s, id))}
      />

      {selected && selectedIndex >= 0 && (
        <PlayerSheet
          player={byId.get(selected)!}
          index={selectedIndex}
          squad={squad}
          byId={byId}
          stats={stats[selected]}
          canChangePlayers={canChangePlayers}
          onClose={() => setSelected(null)}
          onCaptain={() => setSquad((s) => setCaptain(s, selected))}
          onViceCaptain={() => setSquad((s) => setViceCaptain(s, selected))}
          onSwap={(other) => setSquad((s) => swapSlots(s, selectedIndex, other))}
          onRemove={() => setSquad((s) => removePlayer(s, selected))}
        />
      )}

      {/* Save bar, sitting just above the bottom navigation */}
      {dirty && (
        <div
          className="fixed inset-x-0 z-30 px-gutter"
          style={{ bottom: "calc(var(--nav-height) + env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <div className="mx-auto flex max-w-content items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-white shadow-lifted">
            <p className="min-w-0 flex-1 text-sm leading-snug">
              {problems.length ? problems[0] : "You have unsaved changes."}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={() => setSquad(saved)}
              disabled={saving}
            >
              Undo
            </Button>
            <Button size="sm" onClick={save} disabled={saving || problems.length > 0}>
              {saving ? "Saving…" : "Save team"}
            </Button>
          </div>
        </div>
      )}
      {dirty && <div className="h-16" aria-hidden="true" />}
    </div>
  );
}

function DeadlineNote({
  nextGameweek,
  canChangePlayers,
}: {
  nextGameweek: TeamData["nextGameweek"];
  canChangePlayers: boolean;
}) {
  return (
    <div className="space-y-2">
      {!canChangePlayers && (
        <p className="flex gap-2.5 rounded-xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Your team has been locked in for a gameweek, so swapping players now counts as a transfer. Transfers are
            coming in the next update. You can still change your captain, vice-captain and bench.
          </span>
        </p>
      )}
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        {nextGameweek ? (
          <>
            Deadline for gameweek {nextGameweek.number}:{" "}
            <strong className="text-foreground">{formatLondonDateTime(new Date(nextGameweek.deadline))}</strong>. Your
            team is locked in then; changes after that count for the following gameweek.
          </>
        ) : (
          "No upcoming deadline has been set yet, so you can change your team freely."
        )}
      </p>
    </div>
  );
}
