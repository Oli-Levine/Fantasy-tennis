"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Player, ScoringRule } from "@/lib/database.types";
import { CLUB_TEAMS, clubTeamLabel } from "@/lib/players";
import { formatPoints } from "@/lib/rules";
import { playerPoints, type PlayerResult } from "@/lib/scoring";
import { formatLondonDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ResultsData } from "./page";
import { saveResultsAction } from "./actions";

type Results = Record<string, PlayerResult>;
const EMPTY: PlayerResult = { didNotPlay: false, counts: {} };

/** Drops empty rows so "changed?" compares like with like. */
function normalise(results: Results): string {
  const rows = Object.entries(results)
    .map(([id, r]) => {
      const counts = Object.entries(r.counts).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b));
      return [id, r.didNotPlay, counts] as const;
    })
    .filter(([, dnp, counts]) => dnp || counts.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(rows);
}

export function ResultsGrid({
  gameweeks,
  gameweek,
  players,
  rules,
  results: saved,
  pickedBy,
  managers,
}: ResultsData & { gameweek: NonNullable<ResultsData["gameweek"]> }) {
  const router = useRouter();
  const [results, setResults] = useState<Results>(saved);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<number | null>(null);
  const [pickedOnly, setPickedOnly] = useState(Object.keys(pickedBy).length > 0);
  const [saving, startSaving] = useTransition();

  const dirty = normalise(results) !== normalise(saved);
  const published = gameweek.status === "published";

  // Don't lose a half-entered grid by navigating away.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter(
      (p) =>
        (team == null || p.club_team === team) &&
        (!q || p.name.toLowerCase().includes(q)) &&
        (!pickedOnly || pickedBy[p.id] || results[p.id]),
    );
  }, [players, query, team, pickedOnly, pickedBy, results]);

  const update = (playerId: string, change: (r: PlayerResult) => PlayerResult) =>
    setResults((all) => ({ ...all, [playerId]: change(all[playerId] ?? EMPTY) }));
  const setCount = (playerId: string, ruleId: string, n: number) =>
    update(playerId, (r) => ({ ...r, counts: { ...r.counts, [ruleId]: Math.max(0, Math.min(99, n)) } }));

  const entered = Object.values(results).filter((r) => r.didNotPlay || Object.values(r.counts).some((n) => n > 0)).length;

  function save(publish: boolean) {
    return new Promise<boolean>((resolve) =>
      startSaving(async () => {
        const result = await saveResultsAction(gameweek.id, results, publish);
        if (!result.ok) {
          toast.error(result.error);
          resolve(false);
          return;
        }
        toast.success(result.message);
        router.refresh();
        resolve(true);
      }),
    );
  }

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-panel bg-card p-4 shadow-soft">
        <NativeSelect
          aria-label="Gameweek"
          value={gameweek.id}
          onChange={(e) => {
            if (dirty && !window.confirm("You have unsaved results. Leave without saving?")) return;
            router.push(`/admin/results?gw=${e.target.value}`);
          }}
        >
          {gameweeks.map((g) => (
            <option key={g.id} value={g.id}>
              Gameweek {g.number} · {g.status === "published" ? "Published" : "Draft"}
            </option>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          Deadline {formatLondonDateTime(new Date(gameweek.deadline))} · {managers} team{managers === 1 ? "" : "s"} locked
          in.{" "}
          {published ? (
            <span className="font-medium text-foreground">Published: saving changes recalculates everyone&apos;s points.</span>
          ) : (
            <span className="font-medium text-foreground">Draft: members can&apos;t see these results yet.</span>
          )}
        </p>
      </section>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            aria-label="Search players"
          />
        </div>
        <button
          type="button"
          onClick={() => setPickedOnly((v) => !v)}
          aria-pressed={pickedOnly}
          className={cn(
            "h-12 cursor-pointer rounded-xl px-3.5 text-sm font-medium transition-colors",
            pickedOnly ? "bg-ink text-white" : "bg-surface text-muted-foreground shadow-soft",
          )}
        >
          In a team
        </button>
      </div>

      <div className="-mx-gutter flex gap-1.5 overflow-x-auto px-gutter pb-1" role="group" aria-label="Filter by club team">
        {[null, ...CLUB_TEAMS].map((t) => (
          <button
            key={t ?? "all"}
            type="button"
            onClick={() => setTeam(t)}
            aria-pressed={team === t}
            className={cn(
              "h-9 shrink-0 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors",
              team === t ? "bg-ink text-white" : "bg-surface text-muted-foreground shadow-soft",
            )}
          >
            {t == null ? "All" : clubTeamLabel(t)}
          </button>
        ))}
      </div>

      {rules.length === 0 ? (
        <p className="rounded-panel bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
          Add some scoring rules first (Admin → Scoring rules).
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-panel bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
          No players match.
        </p>
      ) : (
        <div className="overflow-hidden rounded-panel bg-card shadow-soft">
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="align-bottom">
                  <th className="sticky left-0 z-10 w-36 border-b border-border bg-card px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                    Player
                  </th>
                  <th className="w-16 border-b border-border px-1 py-2 text-center text-[11px] leading-tight font-semibold text-muted-foreground">
                    Didn&apos;t play
                  </th>
                  {rules.map((rule) => (
                    <th
                      key={rule.id}
                      className="w-20 border-b border-border px-1 py-2 text-center text-[11px] leading-tight font-semibold text-muted-foreground"
                    >
                      <span className="line-clamp-2 block">{rule.name}</span>
                      <span className={cn("block tabular-nums", rule.points < 0 ? "text-primary" : "text-foreground")}>
                        {formatPoints(rule.points)}
                        {rule.type === "count" && " each"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <ResultRow
                    key={p.id}
                    player={p}
                    rules={rules}
                    result={results[p.id] ?? EMPTY}
                    pickedBy={pickedBy[p.id] ?? 0}
                    onDidNotPlay={(v) => update(p.id, (r) => ({ ...r, didNotPlay: v }))}
                    onCount={(ruleId, n) => setCount(p.id, ruleId, n)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        All rules stack, so tick everything that applies. &ldquo;Didn&apos;t play&rdquo; brings in the manager&apos;s bench
        player and moves the armband to the vice-captain; the player still scores any other points (e.g. a social).
      </p>

      {/* Save bar, just above the bottom navigation */}
      <div
        className="fixed inset-x-0 z-30 px-gutter"
        style={{ bottom: "calc(var(--nav-height) + env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="mx-auto flex max-w-content items-center gap-2 rounded-2xl bg-ink p-3 pl-4 text-white shadow-lifted">
          <p className="min-w-0 flex-1 text-sm leading-snug">
            {dirty ? "Unsaved changes" : `${entered} player${entered === 1 ? "" : "s"} with results`}
          </p>
          {!published && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              disabled={saving || !dirty}
              onClick={() => save(false)}
            >
              Save draft
            </Button>
          )}
          {published ? (
            <Button size="sm" disabled={saving || !dirty} onClick={() => save(false)}>
              {saving ? "Saving…" : "Save & recalculate"}
            </Button>
          ) : (
            <ConfirmDialog
              title={`Publish gameweek ${gameweek.number}?`}
              description={
                <div className="space-y-2">
                  <p>
                    Points will be calculated for {entered} player{entered === 1 ? "" : "s"} and {managers} team
                    {managers === 1 ? "" : "s"}, and everyone will see them on the League page.
                  </p>
                  <p>You can still correct results afterwards; points recalculate automatically.</p>
                </div>
              }
              confirmLabel="Publish"
              onConfirm={() => save(true)}
              trigger={(open) => (
                <Button size="sm" disabled={saving} onClick={open}>
                  {saving ? "Saving…" : "Publish"}
                </Button>
              )}
            />
          )}
        </div>
      </div>
      <div className="h-20" aria-hidden="true" />
    </div>
  );
}

function ResultRow({
  player,
  rules,
  result,
  pickedBy,
  onDidNotPlay,
  onCount,
}: {
  player: Player;
  rules: ScoringRule[];
  result: PlayerResult;
  pickedBy: number;
  onDidNotPlay: (value: boolean) => void;
  onCount: (ruleId: string, n: number) => void;
}) {
  const points = playerPoints(result, rules);
  const hasAny = result.didNotPlay || Object.values(result.counts).some((n) => n > 0);
  return (
    <tr className={cn(result.didNotPlay && "bg-muted/50")}>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 w-36 max-w-36 border-b border-border px-3 py-2 text-left font-normal",
          result.didNotPlay ? "bg-muted" : "bg-card",
        )}
      >
        <span className="block truncate font-medium">{player.name}</span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">
          {clubTeamLabel(player.club_team)}
          {pickedBy > 0 && ` · in ${pickedBy}`}
          {hasAny && (
            <>
              {" · "}
              <strong className={cn("font-semibold", points < 0 ? "text-primary" : "text-foreground")}>
                {points} pts
              </strong>
            </>
          )}
        </span>
      </th>
      <td className="border-b border-border text-center">
        <TickBox
          checked={result.didNotPlay}
          onChange={onDidNotPlay}
          label={`${player.name} didn't play`}
          tone="ink"
        />
      </td>
      {rules.map((rule) => {
        const n = result.counts[rule.id] ?? 0;
        return (
          <td key={rule.id} className="border-b border-border px-1 text-center">
            {rule.type === "tick" ? (
              <TickBox checked={n > 0} onChange={(v) => onCount(rule.id, v ? 1 : 0)} label={`${player.name}: ${rule.name}`} />
            ) : (
              <Stepper value={n} onChange={(v) => onCount(rule.id, v)} label={`${player.name}: ${rule.name}`} />
            )}
          </td>
        );
      })}
    </tr>
  );
}

function TickBox({
  checked,
  onChange,
  label,
  tone = "primary",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  tone?: "primary" | "ink";
}) {
  return (
    <label className="inline-flex size-11 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className={cn("size-5 cursor-pointer", tone === "ink" ? "accent-ink" : "accent-primary")}
      />
    </label>
  );
}

/** Number input with − / + for counts (big enough to tap on a phone). */
function Stepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        aria-label={`${label}: one less`}
        className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground disabled:opacity-30"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value === 0 ? "" : String(value)}
        placeholder="0"
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, "") || 0);
          onChange(n);
        }}
        aria-label={label}
        className={cn(
          "h-9 w-8 rounded-lg bg-muted text-center text-base font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
          value > 0 && "bg-primary-soft text-primary",
        )}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={`${label}: one more`}
        className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </span>
  );
}
