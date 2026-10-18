"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { DeadlineCountdown } from "@/components/app/deadline-countdown";
import { BenchCard, EmptySlotCard, PlayerCard, type PlayerCardData } from "@/components/app/player-card";
import { StatsHeader } from "@/components/app/stats-header";
import { Button } from "@/components/ui/button";
import { chipInfo, isUnlimitedTransferChip } from "@/lib/chips";
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
  transferSummary,
  type ClubLimit,
  type Squad,
  type TransferRules,
  type TransferSummary,
} from "@/lib/squad";
import type { TeamData } from "@/lib/team-data";
import { formatLondonDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { saveSquadAction } from "./actions";
import { ChipsCard } from "./chips-card";
import { CourtPitch, PitchSummary, type PitchSlot } from "./pitch-view";
import { PlayerPool } from "./player-pool";
import { PlayerSheet } from "./player-sheet";
import { TransferPreview } from "./transfer-preview";

/** true: starters drawn on the court (pitch-view.tsx); false: the original card grid. */
const PITCH_VIEW = true;

export function TeamBuilder({
  teamName,
  players,
  picks,
  budget,
  maxPerClubTeam,
  nextGameweek,
  baselineIds,
  freeTransfers,
  hitPoints,
  activeChip,
  chipsUsed,
  stats,
}: TeamData & { teamName: string }) {
  const router = useRouter();
  const saved = useMemo(() => fromPicks(picks), [picks]);
  const [squad, setSquad] = useState<Squad>(saved);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [previewing, setPreviewing] = useState(false);
  const poolRef = useRef<HTMLElement>(null);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const priceOf = (id: string) => byId.get(id)?.price ?? 0;
  const cost = squadCost(squad, priceOf);
  const left = round1(budget - cost);
  const clubLimit: ClubLimit = { max: maxPerClubTeam, clubOf: (id) => byId.get(id)?.club_team };
  const problems = squadProblems(squad, cost, budget, clubLimit);
  const dirty = JSON.stringify(toPicks(squad)) !== JSON.stringify(toPicks(saved));
  const count = playerIds(squad).length;

  const isNewManager = baselineIds == null;
  const rules: TransferRules = {
    baselineIds,
    freeTransfers,
    hitPoints,
    unlimited: isUnlimitedTransferChip(activeChip),
  };
  const transfers = transferSummary(squad, rules);
  const savedTransfers = transferSummary(saved, rules);
  const playersChanged = playerIds(squad).sort().join() !== playerIds(saved).sort().join();

  const cardData = (player: Player, index: number): PlayerCardData => {
    const slot = squad[index]!;
    return {
      name: player.name,
      clubTeam: clubTeamLabel(player.club_team),
      price: player.price,
      photoUrl: playerPhotoUrl(player.photo_path),
      lastPoints: stats[player.id]?.last ?? null,
      badge: slot.isCaptain ? (activeChip === "triple_captain" ? "TC" : "C") : slot.isViceCaptain ? "VC" : null,
      unavailable: !player.is_active,
    };
  };

  function scrollToPool() {
    poolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function save() {
    // Changing players after your first deadline: show the transfer preview first.
    if (!isNewManager && playersChanged && !previewing) {
      setPreviewing(true);
      return;
    }
    startSaving(async () => {
      const result = await saveSquadAction(toPicks(squad));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPreviewing(false);
      const hit = result.data.transferHit;
      toast.success(
        (nextGameweek ? `Team saved for gameweek ${nextGameweek.number}` : "Team saved") +
          (hit > 0 ? ` (−${hit} pts for transfers)` : ""),
      );
      router.refresh();
    });
  }

  const selectedIndex = selected ? squad.findIndex((s) => s?.playerId === selected) : -1;

  const eyebrowText = nextGameweek ? `Gameweek ${nextGameweek.number}` : "Your squad";
  const autoPickButton = (
    <Button
      variant="soft"
      size="sm"
      disabled={count === 5}
      onClick={() => setSquad((s) => autoPick(s, players, budget, Math.random, maxPerClubTeam))}
    >
      <Shuffle />
      Auto-pick
    </Button>
  );
  const headerStats = [
    { label: "Players", value: `${count} / 5` },
    { label: "Budget left", value: <span className={left < 0 ? "text-primary" : ""}>{formatPrice(left)}</span> },
    { label: "Until deadline", value: <DeadlineCountdown deadline={nextGameweek?.deadline ?? null} /> },
  ];
  const transfersBar = (className?: string) => (
    <TransfersBar
      className={className}
      gameweekNumber={nextGameweek?.number ?? null}
      isNewManager={isNewManager}
      summary={transfers}
      freeTransfers={freeTransfers}
      chipName={rules.unlimited && activeChip ? chipInfo(activeChip).name : null}
    />
  );

  const pitchSlot = (index: number, emptyLabel: string): PitchSlot => {
    const slot = squad[index];
    const player = slot && byId.get(slot.playerId);
    return player
      ? { kind: "player", id: player.id, data: cardData(player, index), onClick: () => setSelected(player.id) }
      : { kind: "empty", label: emptyLabel };
  };

  // Pitch view: a compact navy summary, then the team on the court. The wrapper fills
  // the first screen, so everything after it starts below the bench strip.
  const pitch = (
    <div style={{ minHeight: "calc(100svh - var(--topbar-height) - env(safe-area-inset-top) - 1rem)" }}>
      <PitchSummary
        eyebrow={<span className="text-[11px] font-semibold tracking-wide text-line-yellow uppercase">{eyebrowText}</span>}
        title={teamName}
        actions={
          <>
            {autoPickButton}
            {isNewManager && (
              <Button
                size="sm"
                className="bg-white text-navy shadow-none hover:bg-white/90"
                disabled={count === 0}
                onClick={() => setSquad(emptySquad())}
              >
                <RotateCcw />
                Clear
              </Button>
            )}
          </>
        }
        stats={headerStats}
      >
        {transfersBar("mt-2 py-1.5 text-xs")}
      </PitchSummary>
      <CourtPitch
        starters={[0, 1, 2, 3].map((i) => pitchSlot(i, "Add starter"))}
        bench={pitchSlot(BENCH_INDEX, "Add bench player")}
        onAddPlayer={scrollToPool}
      />
    </div>
  );

  // Original view: stats and a 2×2 card grid in one white card.
  const grid = (
        <section className="rounded-panel bg-card p-4 shadow-soft sm:p-5">
          <StatsHeader
            title={teamName}
            eyebrow={
              <span className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrowText}</span>
            }
            actions={
              <>
                {autoPickButton}
                {isNewManager && (
                  <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => setSquad(emptySquad())}>
                    <RotateCcw />
                    Clear
                  </Button>
                )}
              </>
            }
            stats={headerStats}
          />

          {transfersBar()}

          <h2 className="mt-4 mb-3 text-sm font-semibold text-muted-foreground">Starters</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            {squad.slice(0, BENCH_INDEX).map((slot, i) => {
              const player = slot && byId.get(slot.playerId);
              return player ? (
                <PlayerCard key={player.id} player={cardData(player, i)} onClick={() => setSelected(player.id)} />
              ) : (
                <EmptySlotCard key={`empty-${i}`} label="Add starter" onClick={scrollToPool} />
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
              <EmptySlotCard bench label="Add bench player" onClick={scrollToPool} />
            );
          })()}
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            The bench player only scores if a starter doesn&apos;t play. Tap a player for captain and bench options.
          </p>
        </section>
  );

  return (
    <div className="space-y-4">
      {PITCH_VIEW ? pitch : grid}

      <ChipsCard
        activeChip={activeChip}
        chipsUsed={chipsUsed}
        gameweekNumber={nextGameweek?.number ?? null}
        isNewManager={isNewManager}
      />

      <DeadlineNote
        nextGameweek={nextGameweek}
        isNewManager={isNewManager}
        freeTransfers={freeTransfers}
        hitPoints={hitPoints}
      />

      <PlayerPool
        ref={poolRef}
        players={players}
        squad={squad}
        budgetLeft={left}
        clubLimit={clubLimit}
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
          isNewManager={isNewManager}
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
              {problems.length
                ? problems[0]
                : !isNewManager && playersChanged
                  ? `${transfers.made} transfer${transfers.made === 1 ? "" : "s"} · ${transfers.hit > 0 ? `−${transfers.hit} pts` : "free"}`
                  : "You have unsaved changes."}
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
              {saving ? "Saving…" : !isNewManager && playersChanged ? "Review" : "Save team"}
            </Button>
          </div>
        </div>
      )}

      <TransferPreview
        open={previewing}
        summary={transfers}
        saved={savedTransfers}
        byId={byId}
        budgetLeft={left}
        chipName={rules.unlimited && activeChip ? chipInfo(activeChip).name : null}
        gameweekNumber={nextGameweek?.number ?? null}
        saving={saving}
        onCancel={() => setPreviewing(false)}
        onConfirm={save}
      />
      {dirty && <div className="h-16" aria-hidden="true" />}
    </div>
  );
}

/** "1 free · 2 made → −5 pts", or why transfers are free right now. */
function TransfersBar({
  className,
  gameweekNumber,
  isNewManager,
  summary,
  freeTransfers,
  chipName,
}: {
  className?: string;
  gameweekNumber: number | null;
  isNewManager: boolean;
  summary: TransferSummary;
  freeTransfers: number;
  chipName: string | null;
}) {
  const text = isNewManager
    ? "Unlimited free changes until your first deadline"
    : chipName
      ? `${chipName}: unlimited free transfers · ${summary.made} made`
      : `${freeTransfers} free · ${summary.made} made`;
  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm",
        chipName ? "bg-gold-soft text-gold-ink" : "bg-muted/70",
        className,
      )}
    >
      <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="sr-only">Transfers: </span>
        {text}
      </span>
      {!isNewManager && !chipName && (
        <span
          className={cn(
            "shrink-0 font-heading font-semibold tabular-nums",
            summary.hit > 0 ? "text-primary" : "text-muted-foreground",
          )}
        >
          {summary.hit > 0 ? `−${summary.hit} pts${gameweekNumber ? ` off GW${gameweekNumber}` : ""}` : "No hit"}
        </span>
      )}
    </div>
  );
}

function DeadlineNote({
  nextGameweek,
  isNewManager,
  freeTransfers,
  hitPoints,
}: {
  nextGameweek: TeamData["nextGameweek"];
  isNewManager: boolean;
  freeTransfers: number;
  hitPoints: number;
}) {
  return (
    <div className="space-y-2 rounded-glass bg-navy-glass p-4 text-xs leading-relaxed text-white/75">
      <p>
        {nextGameweek ? (
          <>
            Deadline for gameweek {nextGameweek.number}:{" "}
            <strong className="text-white">{formatLondonDateTime(new Date(nextGameweek.deadline))}</strong>. Your
            team is locked in then; changes after that count for the following gameweek.
          </>
        ) : (
          "No upcoming deadline has been set yet."
        )}
      </p>
      <p>
        {isNewManager
          ? "After your first deadline, swapping players counts as a transfer."
          : `Swapping players counts as a transfer: ${freeTransfers} free per gameweek, then −${hitPoints} pts each. Free transfers don't roll over. Swap a player back before the deadline and it no longer counts.`}
      </p>
    </div>
  );
}
