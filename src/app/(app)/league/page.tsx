import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Minus, Trophy } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireMember } from "@/lib/auth";
import type { Movement, StandingRow } from "@/lib/league";
import { loadLeague } from "@/lib/league-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "League" };

export default async function LeaguePage() {
  const { user } = await requireMember();
  const { standings, latest } = await loadLeague();

  return (
    <>
      <PageHeader
        title="League"
        subtitle={latest ? `Standings after gameweek ${latest.number}.` : "Club standings, updated when each gameweek is published."}
      />
      {standings.length === 0 ? (
        <EmptyState icon={Trophy} title="No teams yet" description="Teams appear here once managers have joined and picked a name." />
      ) : (
        <>
          {!latest && (
            <p className="mb-3 rounded-xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">
              No points yet: the table fills in when the first gameweek is published.
            </p>
          )}
          <section className="overflow-hidden rounded-panel bg-card shadow-soft" aria-label="Standings">
            <div className="grid grid-cols-[2.75rem_1fr_3rem_3.5rem_1.25rem] items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span className="text-center">Rank</span>
              <span>Team</span>
              <span className="text-right">GW</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            <ol>
              {standings.map((row) => (
                <li key={row.userId} className="border-b border-border last:border-0">
                  <StandingLink row={row} isYou={row.userId === user.id} />
                </li>
              ))}
            </ol>
          </section>
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            Teams on equal points share a rank. Tap a team to see their locked squads.
          </p>
        </>
      )}
    </>
  );
}

function StandingLink({ row, isYou }: { row: StandingRow; isYou: boolean }) {
  const top3 = row.rank <= 3 && row.total > 0;
  return (
    <Link
      href={`/league/${row.userId}`}
      className={cn(
        "grid grid-cols-[2.75rem_1fr_3rem_3.5rem_1.25rem] items-center gap-2 px-3 py-3 transition-colors hover:bg-muted/60",
        isYou && "bg-primary-soft/40",
      )}
    >
      <span className="flex flex-col items-center gap-0.5">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full font-heading text-sm font-bold tabular-nums",
            top3 ? "bg-gold text-ink" : "bg-muted text-foreground",
          )}
        >
          {row.rank}
        </span>
        <MovementIcon movement={row.movement} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {row.teamName}
          {isYou && <span className="ml-1.5 text-xs font-semibold text-primary">You</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{row.displayName}</span>
      </span>
      <span className="text-right text-sm text-muted-foreground tabular-nums">{row.gameweekPoints ?? "–"}</span>
      <span className="text-right font-heading font-semibold tabular-nums">{row.total}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

function MovementIcon({ movement }: { movement: Movement }) {
  if (movement === "up") return <ChevronUp className="size-4 text-success" strokeWidth={3} aria-label="Up" />;
  if (movement === "down") return <ChevronDown className="size-4 text-primary" strokeWidth={3} aria-label="Down" />;
  if (movement === "new") return <span className="text-[9px] font-bold text-gold-ink uppercase">New</span>;
  return <Minus className="size-3 text-muted-foreground" aria-label="No change" />;
}
