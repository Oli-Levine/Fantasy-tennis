"use client";

import { ArrowRight } from "lucide-react";
import { PlayerPhoto } from "@/components/app/player-photo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Player } from "@/lib/database.types";
import { formatPrice } from "@/lib/format";
import { clubTeamLabel, playerPhotoUrl } from "@/lib/players";
import type { TransferSummary } from "@/lib/squad";
import { cn } from "@/lib/utils";

/** "Are you sure?" sheet before saving transfers: players out and in, budget and any points hit. */
export function TransferPreview({
  open,
  summary,
  savedHit,
  byId,
  budgetLeft,
  chipName,
  gameweekNumber,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  summary: TransferSummary;
  /** Hit already locked in by the last save, to show what changes. */
  savedHit: number;
  byId: Map<string, Player>;
  budgetLeft: number;
  chipName: string | null;
  gameweekNumber: number | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const pairs = summary.in.map((id, i) => [summary.out[i], id] as const);
  const extra = summary.hit - savedHit;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader className="pr-0">
          <DialogTitle>Confirm transfers</DialogTitle>
          <DialogDescription>
            {summary.made === 0
              ? "Your squad is back to how it was at the last deadline, so there are no transfers."
              : `${summary.made} transfer${summary.made === 1 ? "" : "s"} for ${gameweekNumber ? `gameweek ${gameweekNumber}` : "the next gameweek"}, counted from your team at the last deadline.`}
          </DialogDescription>
        </DialogHeader>

        {pairs.length > 0 && (
          <ul className="space-y-2">
            {pairs.map(([outId, inId]) => (
              <li key={inId} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-muted/60 p-2.5">
                <PlayerChip player={outId ? byId.get(outId) : undefined} tone="out" />
                <ArrowRight className="size-4 text-muted-foreground" aria-label="replaced by" />
                <PlayerChip player={byId.get(inId)} tone="in" />
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
          <div>
            <dt className="text-xs text-muted-foreground">Budget left</dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{formatPrice(budgetLeft)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Points hit</dt>
            <dd
              className={cn(
                "font-heading text-lg font-semibold tabular-nums",
                summary.hit > 0 ? "text-primary" : "text-success",
              )}
            >
              {summary.hit > 0 ? `−${summary.hit} pts` : "Free"}
            </dd>
          </div>
        </dl>

        <p
          className={cn(
            "mt-3 rounded-xl px-3 py-2.5 text-sm",
            summary.hit > 0 ? "bg-primary-soft text-primary" : "bg-success-soft text-foreground",
          )}
        >
          {chipName
            ? `${chipName} is active, so these transfers are free.`
            : extra > 0
              ? `This will cost −${extra} pts${savedHit > 0 ? ` more (−${summary.hit} pts in total this gameweek)` : ""}.`
              : summary.hit > 0
                ? `Your hit this gameweek stays at −${summary.hit} pts.`
                : summary.freeLeft
                  ? `No points hit. You'll still have ${summary.freeLeft} free transfer${summary.freeLeft === 1 ? "" : "s"}.`
                  : "No points hit. Any more transfers this gameweek will cost points."}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Keep editing
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? "Saving…" : "Confirm transfers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlayerChip({ player, tone }: { player?: Player; tone: "in" | "out" }) {
  if (!player) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card">
        <PlayerPhoto
          name={player.name}
          photoUrl={playerPhotoUrl(player.photo_path)}
          className={player.photo_path ? "" : "w-7 text-[10px]"}
        />
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-sm font-medium", tone === "out" && "text-muted-foreground line-through")}>
          {player.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">
          {clubTeamLabel(player.club_team)} · {formatPrice(player.price)}
        </span>
      </span>
    </span>
  );
}
