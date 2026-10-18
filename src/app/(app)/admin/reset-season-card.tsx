"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resetSeasonAction } from "./actions";

const CONFIRM_WORD = "RESTART";

/** Danger zone: wipe all gameweek history before the real launch. */
export function ResetSeasonCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clearSquads, setClearSquads] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  function close(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setClearSquads(false);
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = await resetSeasonAction(clearSquads);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      close(false);
      router.refresh();
    });
  }

  return (
    <section className="flex items-start gap-3 rounded-panel border-2 border-dashed border-primary/40 bg-surface p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <RotateCcw className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base">Restart the season</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Clear all test gameweeks, points, transfers and chips before you launch to the club.
        </p>
        <Button variant="outline" size="sm" className="mt-3 text-destructive" onClick={() => setOpen(true)}>
          Restart season…
        </Button>
      </div>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent showCloseButton={false}>
          <DialogHeader className="pr-0">
            <DialogTitle>Restart the season?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <strong className="text-foreground">Removed:</strong> every gameweek whose deadline has passed, all
                  locked teams, points, results, transfers and chips. The league goes back to 0.
                </p>
                <p>
                  <strong className="text-foreground">Kept:</strong> upcoming gameweeks (reopened), players, scoring
                  rules, managers and the join code. Everyone gets unlimited free changes until the first deadline.
                </p>
                <p>This can&apos;t be undone.</p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
              <div className="min-w-0">
                <Label htmlFor="clear-squads" className="text-sm leading-snug">
                  Also empty everyone&apos;s squad
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Managers pick their teams again from scratch.</p>
              </div>
              <Switch id="clear-squads" checked={clearSquads} onCheckedChange={setClearSquads} disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-reset">
                Type <strong>{CONFIRM_WORD}</strong> to confirm
              </Label>
              <Input
                id="confirm-reset"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                disabled={pending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => close(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={pending || typed.trim().toUpperCase() !== CONFIRM_WORD}
            >
              {pending ? "Restarting…" : "Restart season"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
