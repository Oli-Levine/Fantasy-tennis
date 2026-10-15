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
  saved,
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
  /** Transfers already saved this gameweek (before this edit). */
  saved: TransferSummary;
  byId: Map<string, Player>;
  budgetLeft: number;
  chipName: string | null;
  gameweekNumber: number | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const savedHit = saved.hit;
  const extra = summary.hit - savedHit;
  // Swaps already saved this gameweek are listed too (they count towards the hit), but marked.
  const earlierPairs = summary.in
    .filter((id) => saved.in.includes(id))
    .map((id) => ({ inId: id, outId: saved.out[saved.in.indexOf(id)], earlier: true }))
    .filter((p) => p.outId != null && summary.out.includes(p.outId));
  const usedOut = new Set(earlierPairs.map((p) => p.outId));
  const newIn = summary.in.filter((id) => !earlierPairs.some((p) => p.inId === id));
  const newOut = summary.out.filter((id) => !usedOut.has(id));
  const pairs = [...earlierPairs, ...newIn.map((id, i) => ({ inId: id, outId: newOut[i], earlier: false }))];
  const newCount = pairs.filter((p) => !p.earlier).length;
  const earlierCount = pairs.length - newCount;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onCancel()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader className="pr-0">
          <DialogTitle>Confirm transfers</DialogTitle>
          <DialogDescription>
            {summary.made === 0
              ? "Your squad is back to how it was at the last deadline, so there are no transfers."
              : earlierCount > 0
                ? `${newCount} new transfer${newCount === 1 ? "" : "s"}, plus ${earlierCount} you already saved for ${gameweekNumber ? `gameweek ${gameweekNumber}` : "the next gameweek"}. They all count towards this gameweek's free transfer.`
                : `${summary.made} transfer${summary.made === 1 ? "" : "s"} for ${gameweekNumber ? `gameweek ${gameweekNumber}` : "the next gameweek"}.`}
          </DialogDescription>
        </DialogHeader>

        {pairs.length > 0 && (
          <ul className="space-y-2">
            {pairs.map(({ outId, inId, earlier }) => (
              <li key={inId} className={cn("rounded-xl p-2.5", earlier ? "border border-dashed border-border" : "bg-muted/60")}>
                {earlier && (
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Saved earlier</p>
                )}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <PlayerChip player={outId ? byId.get(outId) : undefined} tone="out" />
                  <ArrowRight className="size-4 text-muted-foreground" aria-label="replaced by" />
                  <PlayerChip player={byId.get(inId)} tone="in" />
                </div>
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
              ? `This will cost −${extra} pts${savedHit > 0 ? ` more (−${summary.hit} pts in total this gameweek)` : ""}, taken off your ${gameweekNumber ? `gameweek ${gameweekNumber}` : "next gameweek's"} score when it's published.`
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
