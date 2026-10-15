"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ListChecks, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import type { RuleCategory, RuleType, ScoringRule } from "@/lib/database.types";
import { RULE_CATEGORIES, RULE_TYPES, formatPoints, parsePoints, validateRule } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { deleteRule, moveRule, restoreRule, saveRule } from "./actions";

export function RulesManager({ rules }: { rules: ScoringRule[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ScoringRule | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const active = rules.filter((r) => !r.archived_at);
  const archived = rules.filter((r) => r.archived_at);

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
      else if (result.message) toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {active.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No scoring rules yet"
          description="Add rules like “Won match +5” or “Sets won +1 each”. They appear in the results grid and on the Rules page."
          action={<Button onClick={() => setEditing("new")}>Add a rule</Button>}
        />
      ) : (
        <>
          <ul className="overflow-hidden rounded-panel bg-card shadow-soft">
            {active.map((rule, i) => (
              <li key={rule.id} className="flex items-center gap-1 border-b border-border pr-2 last:border-0">
                <button
                  type="button"
                  onClick={() => setEditing(rule)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-4 text-left"
                >
                  <PointsBadge points={rule.points} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{rule.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {rule.type === "count" ? "Count (× points)" : "Tick"} ·{" "}
                      {rule.category === "match" ? "Match" : "Other"}
                      {rule.is_test_data && " · Test"}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${rule.name} up`}
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveRule(rule.id, "up"))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${rule.name} down`}
                  disabled={pending || i === active.length - 1}
                  onClick={() => run(() => moveRule(rule.id, "down"))}
                >
                  <ArrowDown />
                </Button>
              </li>
            ))}
          </ul>
          <Button className="w-full" onClick={() => setEditing("new")}>
            <Plus />
            Add rule
          </Button>
        </>
      )}

      {archived.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">Archived (kept for past results)</h2>
          <ul className="overflow-hidden rounded-panel bg-card shadow-soft">
            {archived.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <PointsBadge points={rule.points} muted />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{rule.name}</span>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => restoreRule(rule.id))}>
                  <RotateCcw />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RuleFormDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        rule={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function PointsBadge({ points, muted = false }: { points: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-9 min-w-12 shrink-0 items-center justify-center rounded-xl px-2 font-heading text-sm font-semibold tabular-nums",
        muted
          ? "bg-muted text-muted-foreground"
          : points > 0
            ? "bg-success-soft text-success"
            : points < 0
              ? "bg-primary-soft text-primary"
              : "bg-muted text-muted-foreground",
      )}
    >
      {formatPoints(points)}
    </span>
  );
}

function RuleFormDialog({
  rule,
  open,
  onOpenChange,
}: {
  rule: ScoringRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(rule?.name ?? "");
  const [points, setPoints] = useState(rule ? String(rule.points) : "");
  const [type, setType] = useState<RuleType>(rule?.type ?? "tick");
  const [category, setCategory] = useState<RuleCategory>(rule?.category ?? "match");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const fields = { name, points: parsePoints(points), type, category };
    const problems = validateRule(fields);
    if (problems.length) return setError(problems[0]);
    setError(null);
    startTransition(async () => {
      const result = await saveRule(rule?.id ?? null, fields);
      if (!result.ok) return setError(result.error);
      toast.success(result.message);
      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "Add rule"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Won match"
              maxLength={60}
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-points">Points</Label>
            <Input
              id="rule-points"
              inputMode="text"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="e.g. 5 or -2"
              required
            />
            <p className="text-xs text-muted-foreground">Use a minus for penalties, e.g. -5 for a no-show.</p>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Segmented name="type" value={type} onChange={setType} options={RULE_TYPES} />
            <p className="text-xs text-muted-foreground">{RULE_TYPES.find((t) => t.value === type)?.hint}</p>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Segmented name="category" value={category} onChange={setCategory} options={RULE_CATEGORIES} />
            <p className="text-xs text-muted-foreground">{RULE_CATEGORIES.find((c) => c.value === category)?.hint}</p>
          </div>
          {rule && (
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Changing the points also changes past gameweeks when they&apos;re next recalculated.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
              {error}
            </p>
          )}
          <DialogFooter className="mt-2">
            {rule && (
              <ConfirmDialog
                title={`Delete “${rule.name}”?`}
                description="If any results already use this rule it will be archived instead, so no history is lost."
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  const result = await deleteRule(rule.id);
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
              {pending ? "Saving…" : rule ? "Save changes" : "Add rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
