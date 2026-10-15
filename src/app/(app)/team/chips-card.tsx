"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { CHIPS, chipInfo } from "@/lib/chips";
import type { Chip } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { cancelChipAction, playChipAction } from "./actions";

type Pending = { chip: Chip; mode: "play" | "cancel" } | null;

/** Chip dropdown, the active chip, and which chips are left this season. */
export function ChipsCard({
  activeChip,
  chipsUsed,
  gameweekNumber,
  isNewManager,
}: {
  activeChip: Chip | null;
  chipsUsed: { chip: Chip; gameweekNumber: number }[];
  gameweekNumber: number | null;
  isNewManager: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [working, startWorking] = useTransition();
  const usedIn = (chip: Chip) => chipsUsed.find((c) => c.chip === chip && c.chip !== activeChip)?.gameweekNumber;
  const remaining = CHIPS.filter((c) => usedIn(c.id) == null && c.id !== activeChip);

  // Why a chip can't be picked from the dropdown right now (null = it can).
  const blocker = (chip: Chip) => {
    const used = usedIn(chip);
    if (used != null) return `used in GW${used}`;
    if (isNewManager && chip !== "triple_captain") return "free changes until your first deadline";
    return null;
  };

  function confirm() {
    if (!pending) return;
    startWorking(async () => {
      const result =
        pending.mode === "play" ? await playChipAction(pending.chip) : await cancelChipAction(pending.chip);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setPending(null);
      router.refresh();
    });
  }

  return (
    <section className="rounded-panel bg-card p-4 shadow-soft" aria-labelledby="chips-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="chips-heading" className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-gold" />
          Chips
        </h2>
        <span className="text-xs text-muted-foreground">One per gameweek · each once a season</span>
      </div>

      {activeChip ? (
        <div className="flex items-center gap-3 rounded-xl bg-gold-soft p-3 text-gold-ink">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-semibold">
              {chipInfo(activeChip).name} active{gameweekNumber ? ` for GW${gameweekNumber}` : ""}
            </p>
            <p className="text-xs leading-snug">{chipInfo(activeChip).summary}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 bg-card"
            onClick={() => setPending({ chip: activeChip, mode: "cancel" })}
          >
            Cancel
          </Button>
        </div>
      ) : gameweekNumber == null ? (
        <p className="text-sm text-muted-foreground">Chips can be played once the next gameweek is scheduled.</p>
      ) : (
        <NativeSelect
          value=""
          aria-label="Play a chip"
          disabled={remaining.length === 0}
          onChange={(e) => e.target.value && setPending({ chip: e.target.value as Chip, mode: "play" })}
        >
          <option value="">{remaining.length ? `Play a chip for GW${gameweekNumber}…` : "All chips used"}</option>
          {CHIPS.map((c) => {
            const why = blocker(c.id);
            return (
              <option key={c.id} value={c.id} disabled={why != null}>
                {c.name}
                {why ? ` (${why})` : ""}
              </option>
            );
          })}
        </NativeSelect>
      )}

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Chips this season">
        {CHIPS.map((c) => {
          const used = usedIn(c.id);
          const active = c.id === activeChip;
          return (
            <li
              key={c.id}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                active ? "bg-gold text-ink" : used != null ? "bg-muted text-muted-foreground line-through" : "bg-gold-soft text-gold-ink",
              )}
            >
              {c.name}
              <span className="sr-only">{active ? " (active)" : used != null ? ` (used in gameweek ${used})` : " (available)"}</span>
            </li>
          );
        })}
      </ul>

      <Dialog open={pending != null} onOpenChange={(open) => !open && !working && setPending(null)}>
        <DialogContent showCloseButton={false}>
          {pending && (
            <>
              <DialogHeader className="pr-0">
                <DialogTitle>
                  {pending.mode === "play"
                    ? `Play ${chipInfo(pending.chip).name}${gameweekNumber ? ` for GW${gameweekNumber}` : ""}?`
                    : `Cancel ${chipInfo(pending.chip).name}?`}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2">
                    {pending.mode === "play" ? (
                      <>
                        <p>{chipInfo(pending.chip).effect}</p>
                        <p>You can cancel it any time before the deadline. Each chip can only be used once a season.</p>
                      </>
                    ) : (
                      <>
                        <p>You&apos;ll keep the chip to use in another gameweek.</p>
                        {pending.chip !== "triple_captain" && (
                          <p className="font-medium text-foreground">
                            Transfers you&apos;ve already made this gameweek will count normally again, so they may cost
                            points.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPending(null)} disabled={working}>
                  {pending.mode === "play" ? "Not now" : "Keep it"}
                </Button>
                <Button
                  variant={pending.mode === "play" ? "gold" : "default"}
                  onClick={confirm}
                  disabled={working}
                >
                  {working ? "Working…" : pending.mode === "play" ? `Play ${chipInfo(pending.chip).name}` : "Cancel chip"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
