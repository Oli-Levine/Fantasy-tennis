"use client";

import { ArrowDownUp, Crown, Trash2 } from "lucide-react";
import { PlayerPhoto } from "@/components/app/player-photo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Player } from "@/lib/database.types";
import { formatPrice } from "@/lib/format";
import { clubTeamLabel, playerPhotoUrl } from "@/lib/players";
import { BENCH_INDEX, STARTER_COUNT, isStarterIndex, type Squad } from "@/lib/squad";
import type { PlayerStats } from "@/lib/team-data";

/** Options for a player in your squad: armbands, bench swaps, remove. */
export function PlayerSheet({
  player,
  index,
  squad,
  byId,
  stats,
  canChangePlayers,
  onClose,
  onCaptain,
  onViceCaptain,
  onSwap,
  onRemove,
}: {
  player: Player;
  index: number;
  squad: Squad;
  byId: Map<string, Player>;
  stats?: PlayerStats;
  canChangePlayers: boolean;
  onClose: () => void;
  onCaptain: () => void;
  onViceCaptain: () => void;
  onSwap: (otherIndex: number) => void;
  onRemove: () => void;
}) {
  const slot = squad[index]!;
  const starter = isStarterIndex(index);
  const bench = squad[BENCH_INDEX];
  const benchPlayer = bench ? byId.get(bench.playerId) : undefined;
  const then = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
              <PlayerPhoto
                name={player.name}
                photoUrl={playerPhotoUrl(player.photo_path)}
                className={player.photo_path ? "" : "w-11 text-sm"}
              />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">{player.name}</DialogTitle>
              <DialogDescription>
                {clubTeamLabel(player.club_team)} · {formatPrice(player.price)} · {stats?.total ?? 0} pts
                {!player.is_active && <span className="font-semibold text-primary"> · Unavailable</span>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          {starter ? (
            <>
              <Button
                variant={slot.isCaptain ? "gold" : "outline"}
                className="w-full justify-start"
                disabled={slot.isCaptain}
                onClick={then(onCaptain)}
              >
                <Crown />
                {slot.isCaptain ? "Captain (scores double)" : "Make captain"}
              </Button>
              <Button
                variant={slot.isViceCaptain ? "gold" : "outline"}
                className="w-full justify-start"
                disabled={slot.isViceCaptain}
                onClick={then(onViceCaptain)}
              >
                <span className="flex size-4 items-center justify-center font-heading text-[10px] font-bold">VC</span>
                {slot.isViceCaptain ? "Vice-captain" : "Make vice-captain"}
              </Button>
              {benchPlayer && (
                <Button variant="outline" className="w-full justify-start" onClick={then(() => onSwap(BENCH_INDEX))}>
                  <ArrowDownUp />
                  Swap with {benchPlayer.name} (bench)
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="px-1 pb-1 text-sm text-muted-foreground">Bring onto the starting line-up in place of:</p>
              {squad.slice(0, STARTER_COUNT).map((s, i) => {
                const starterPlayer = s && byId.get(s.playerId);
                if (!starterPlayer) return null;
                return (
                  <Button key={s.playerId} variant="outline" className="w-full justify-start" onClick={then(() => onSwap(i))}>
                    <ArrowDownUp />
                    {starterPlayer.name}
                    {s.isCaptain && " (C)"}
                    {s.isViceCaptain && " (VC)"}
                  </Button>
                );
              })}
            </>
          )}

          {canChangePlayers && (
            <Button variant="ghost" className="w-full justify-start text-destructive" onClick={then(onRemove)}>
              <Trash2 />
              Remove from squad
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
