"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { Gameweek, GameweekStatus } from "@/lib/database.types";
import { formatLondonDateTime, fromLondonInputValue, toLondonInputValue } from "@/lib/time";
import { cn } from "@/lib/utils";
import { deleteGameweek, generateGameweeks, updateGameweek } from "./actions";

const STATUS_LABEL: Record<GameweekStatus, string> = { open: "Open", locked: "Locked", published: "Published" };
const STATUS_HELP: Record<GameweekStatus, string> = {
  open: "Open: managers can still change their teams.",
  locked: "Locked: the deadline has passed and results are being entered.",
  published: "Published: points are visible to everyone.",
};

export function GameweeksManager({
  gameweeks,
  suggestedStart,
  now,
}: {
  gameweeks: Gameweek[];
  suggestedStart: string;
  now: string;
}) {
  const [editing, setEditing] = useState<Gameweek | null>(null);
  const current = gameweeks.find((g) => !g.is_blank && g.status === "open" && g.deadline > now);

  return (
    <div className="space-y-4">
      <GenerateCard suggestedStart={suggestedStart} hasGameweeks={gameweeks.length > 0} />

      {gameweeks.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No gameweeks yet"
          description="Generate the season's weekly deadlines above. You can edit dates and mark holiday weeks afterwards."
        />
      ) : (
        <ul className="overflow-hidden rounded-panel bg-card shadow-soft">
          {gameweeks.map((gw) => (
            <li key={gw.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => setEditing(gw)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                  gw.id === current?.id && "bg-primary-soft/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl font-heading leading-none",
                    gw.is_blank ? "bg-muted text-muted-foreground" : "bg-ink text-white",
                  )}
                >
                  <span className="text-[9px] font-medium tracking-wide uppercase opacity-70">GW</span>
                  <span className="text-base font-semibold">{gw.number}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", gw.is_blank && "text-muted-foreground line-through")}>
                    {formatLondonDateTime(new Date(gw.deadline))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {gw.is_blank ? "Blank week · no deadline or scoring" : gw.id === current?.id ? "Next deadline" : " "}
                  </span>
                </span>
                {!gw.is_blank && <StatusBadge status={gw.status} />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <GameweekDialog
        key={editing?.id ?? "closed"}
        gameweek={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: GameweekStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold",
        status === "open" && "bg-success-soft text-success",
        status === "locked" && "bg-gold-soft text-gold-ink",
        status === "published" && "bg-ink text-white",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function GenerateCard({ suggestedStart, hasGameweeks }: { suggestedStart: string; hasGameweeks: boolean }) {
  const router = useRouter();
  const [start, setStart] = useState(suggestedStart);
  const [weeks, setWeeks] = useState(hasGameweeks ? "4" : "10");
  const [pending, startTransition] = useTransition();
  const weekday = start ? new Date(`${start}T12:00:00Z`).getUTCDay() : 2;

  return (
    <section className="space-y-4 rounded-panel bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <CalendarPlus className="size-5" />
        </span>
        <div>
          <h2 className="text-base">{hasGameweeks ? "Add more weeks" : "Generate the season"}</h2>
          <p className="text-xs text-muted-foreground">One deadline a week at 21:00 UK time.</p>
        </div>
      </div>
      <form
        className="grid grid-cols-[1fr_6rem] gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await generateGameweeks(start, Number(weeks));
            if (!result.ok) return void toast.error(result.error);
            toast.success(result.message);
            router.refresh();
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="gw-start">First deadline</Label>
          <Input id="gw-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gw-weeks">Weeks</Label>
          <Input
            id="gw-weeks"
            type="number"
            inputMode="numeric"
            min={1}
            max={52}
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
            required
          />
        </div>
        {weekday !== 2 && (
          <p className="col-span-2 rounded-xl bg-gold-soft px-4 py-2.5 text-xs text-gold-ink">
            That date isn&apos;t a Tuesday. Deadlines will fall on that weekday each week.
          </p>
        )}
        <Button type="submit" className="col-span-2" disabled={pending}>
          {pending ? "Creating…" : `Create ${weeks || 0} week${weeks === "1" ? "" : "s"}`}
        </Button>
      </form>
    </section>
  );
}

function GameweekDialog({
  gameweek,
  onOpenChange,
}: {
  gameweek: Gameweek | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [deadline, setDeadline] = useState(gameweek ? toLondonInputValue(new Date(gameweek.deadline)) : "");
  const [isBlank, setIsBlank] = useState(gameweek?.is_blank ?? false);
  const [status, setStatus] = useState<GameweekStatus>(gameweek?.status ?? "open");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!gameweek) return null;

  function save() {
    const parsed = fromLondonInputValue(deadline);
    if (!parsed) return setError("Choose a valid date and time.");
    setError(null);
    startTransition(async () => {
      const result = await updateGameweek(gameweek!.id, { deadline: parsed.toISOString(), is_blank: isBlank, status });
      if (!result.ok) return setError(result.error);
      toast.success(result.message);
      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gameweek {gameweek.number}</DialogTitle>
          <DialogDescription>Times are UK time (GMT/BST handled automatically).</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="gw-deadline">Deadline</Label>
            <Input
              id="gw-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
            <div>
              <Label htmlFor="gw-blank">Blank week</Label>
              <p className="mt-1 text-xs text-muted-foreground">Holidays or no fixtures: no deadline or scoring.</p>
            </div>
            <Switch id="gw-blank" checked={isBlank} onCheckedChange={setIsBlank} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gw-status">Status</Label>
            <NativeSelect id="gw-status" value={status} onChange={(e) => setStatus(e.target.value as GameweekStatus)}>
              <option value="open">Open</option>
              <option value="locked">Locked</option>
              <option value="published">Published</option>
            </NativeSelect>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {STATUS_HELP[status]} This normally changes by itself at the deadline and when you publish results, so
              only change it to fix a mistake.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
              {error}
            </p>
          )}

          <DialogFooter className="mt-2">
            {gameweek.status === "open" && (
              <ConfirmDialog
                title={`Delete gameweek ${gameweek.number}?`}
                description="Later gameweeks are renumbered. To skip a holiday week, mark it as blank instead."
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  const result = await deleteGameweek(gameweek.id);
                  if (!result.ok) return void toast.error(result.error);
                  toast.success(result.message);
                  router.refresh();
                  onOpenChange(false);
                }}
                trigger={(openConfirm) => (
                  <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" onClick={openConfirm} disabled={pending}>
                    <Trash2 />
                    Delete
                  </Button>
                )}
              />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
