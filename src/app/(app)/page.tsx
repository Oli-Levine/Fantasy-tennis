import { Sparkles } from "lucide-react";
import { DeadlineCountdown } from "@/components/app/deadline-countdown";
import { BenchCard, PlayerCard, type PlayerCardData } from "@/components/app/player-card";
import { StatsHeader } from "@/components/app/stats-header";
import { requireMember } from "@/lib/auth";
import { formatPrice, ordinal } from "@/lib/format";

// Demo squad so the design can be judged on a phone. Replaced with the
// manager's real squad in Phase 4.
const DEMO_STARTERS: PlayerCardData[] = [
  { name: "Alex Morgan", clubTeam: "1s", price: 12.5, lastPoints: 18, badge: "TC" },
  { name: "Priya Shah", clubTeam: "1s", price: 9.0, lastPoints: 11, badge: "VC" },
  { name: "Tom Okafor", clubTeam: "3s", price: 6.5, lastPoints: 7 },
  { name: "Ellie Brooks", clubTeam: "5s", price: 4.0, lastPoints: 9 },
];
const DEMO_BENCH: PlayerCardData = { name: "Sam Lee", clubTeam: "6s", price: 2.5, lastPoints: 3 };
const BUDGET = 35;

export default async function HomePage() {
  const { profile } = await requireMember();
  const spent = [...DEMO_STARTERS, DEMO_BENCH].reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-gold-ink">
        <Sparkles className="size-4 shrink-0" />
        <span>
          <strong className="font-semibold">Triple Captain</strong> is active this gameweek
        </span>
      </div>

      <section className="rounded-panel bg-card p-4 shadow-soft sm:p-5">
        <StatsHeader
          eyebrow={
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Preview · demo data
            </span>
          }
          title={profile.team_name}
          stats={[
            { label: "Budget left", value: formatPrice(BUDGET - spent) },
            { label: "Deadline", value: <DeadlineCountdown /> },
            { label: "GW points", value: 54 },
            { label: "Rank", value: ordinal(3) },
          ]}
        />

        <h3 className="mt-4 mb-3 text-sm font-semibold text-muted-foreground">Starters</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          {DEMO_STARTERS.map((p) => (
            <PlayerCard key={p.name} player={p} />
          ))}
        </div>

        <h3 className="mt-6 mb-3 text-sm font-semibold text-muted-foreground">Bench</h3>
        <BenchCard player={DEMO_BENCH} />
      </section>
    </div>
  );
}
