import type { Metadata } from "next";
import { ArrowLeftRight, CalendarClock, Crown, ListChecks, Sparkles, Trophy, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { requireMember } from "@/lib/auth";
import { CHIPS } from "@/lib/chips";
import type { ScoringRule } from "@/lib/database.types";
import { DEMO_RULES } from "@/lib/dev-fixtures";
import { devAuthBypass } from "@/lib/env";
import { formatPrice } from "@/lib/format";
import { formatPoints } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rules" };

type Settings = { budget: number; freeTransfers: number; hitPoints: number };

export default async function RulesPage() {
  await requireMember();
  const { rules, settings } = devAuthBypass()
    ? { rules: DEMO_RULES.filter((r) => !r.archived_at), settings: { budget: 35, freeTransfers: 1, hitPoints: 5 } }
    : await loadRules();
  const { budget, freeTransfers, hitPoints } = settings;

  return (
    <div className="space-y-4">
      <PageHeader title="Rules" subtitle="How the game, transfers, chips and scoring work." />

      <Section icon={Users} title="Your squad">
        <ul>
          <li>Pick <strong>5 club players</strong>: 4 starters and 1 on the bench.</li>
          <li>The whole squad must cost <strong>{formatPrice(budget)}</strong> or less, at current prices.</li>
          <li>Any player can be in lots of managers&apos; teams.</li>
        </ul>
      </Section>

      <Section icon={CalendarClock} title="Gameweeks and deadlines">
        <ul>
          <li>
            The deadline is <strong>every Tuesday at 21:00</strong> (UK time). Your team, captain, vice-captain and chip
            are locked in then.
          </li>
          <li>Changes after the deadline count for the next gameweek.</li>
          <li>BUCS matches are played, the results are entered, and points appear once the gameweek is published.</li>
          <li>Holiday weeks with no fixtures are blank weeks: no deadline and no points.</li>
        </ul>
      </Section>

      <Section icon={Crown} title="Captain, vice-captain and bench">
        <ul>
          <li>
            Choose a <strong>captain</strong> from your starters every week. Their points count <strong>double</strong>.
          </li>
          <li>
            If your captain doesn&apos;t play, your <strong>vice-captain</strong> gets the double points instead.
          </li>
          <li>
            Your <strong>bench</strong> player scores nothing, unless one of your starters doesn&apos;t play. Then the
            bench player comes on automatically.
          </li>
          <li>
            A player who didn&apos;t play still keeps any off-court points they earned (e.g. going to a social).
          </li>
        </ul>
      </Section>

      <Section icon={ArrowLeftRight} title="Transfers">
        <ul>
          <li>Until your first deadline you can change your team as much as you like.</li>
          <li>
            After that, you get <strong>{freeTransfers} free transfer{freeTransfers === 1 ? "" : "s"}</strong> per
            gameweek. Each extra transfer costs <strong>−{hitPoints} points</strong>, taken off that gameweek&apos;s score.
          </li>
          <li>Free transfers don&apos;t roll over to the next week.</li>
          <li>Swap a player back before the deadline and it doesn&apos;t count as a transfer.</li>
          <li>You&apos;ll always see a preview of the cost before you confirm.</li>
        </ul>
      </Section>

      <Section icon={Sparkles} title="Chips" accent>
        <p className="mb-3">
          Each chip can be used <strong>once a season</strong>, with <strong>one chip per gameweek</strong>. Play them from
          the Team page; you can cancel until the deadline.
        </p>
        <dl className="space-y-3">
          {CHIPS.map((chip) => (
            <div key={chip.id} className="rounded-xl bg-gold-soft p-3 text-gold-ink">
              <dt className="font-heading font-semibold">{chip.name}</dt>
              <dd className="mt-0.5 text-sm">{chip.effect}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section icon={ListChecks} title="Scoring">
        <p className="mb-3">
          Every rule that applies is added up, so one match can earn several of these. Your gameweek score is your 4
          starters (plus the bench if it came on), with your captain doubled, minus any transfer hit.
        </p>
        {rules.length === 0 ? (
          <p className="rounded-xl bg-muted/70 p-3 text-muted-foreground">The scoring rules haven&apos;t been set yet.</p>
        ) : (
          <div className="space-y-4">
            <ScoringTable title="On court" rules={rules.filter((r) => r.category === "match")} />
            <ScoringTable title="Off court" rules={rules.filter((r) => r.category === "other")} />
          </div>
        )}
      </Section>

      <Section icon={Trophy} title="The league">
        <ul>
          <li>Teams are ranked on total points from every published gameweek.</li>
          <li>Teams on equal points share a rank.</li>
          <li>If you join late you start on 0 points.</li>
          <li>Tap any team on the League page to see their squad for gameweeks that have already locked.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  accent = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel bg-card p-4 shadow-soft sm:p-5">
      <h2 className="mb-3 flex items-center gap-2.5 text-lg">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-xl",
            accent ? "bg-gold-soft text-gold-ink" : "bg-primary-soft text-primary",
          )}
        >
          <Icon className="size-4" />
        </span>
        {title}
      </h2>
      <div className="text-sm leading-relaxed [&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-primary [&_li]:before:content-['•'] [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

function ScoringTable({ title, rules }: { title: string; rules: ScoringRule[] }) {
  if (rules.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <table className="w-full text-sm">
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-3">{rule.name}</td>
              <td
                className={cn(
                  "py-2 text-right font-heading font-semibold whitespace-nowrap tabular-nums",
                  rule.points < 0 ? "text-primary" : "text-foreground",
                )}
              >
                {formatPoints(rule.points)}
                {rule.type === "count" && <span className="font-sans text-xs font-normal text-muted-foreground"> each</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function loadRules(): Promise<{ rules: ScoringRule[]; settings: Settings }> {
  const supabase = await createClient();
  const [rules, settings] = await Promise.all([
    supabase.from("scoring_rules").select("*").is("archived_at", null).order("sort_order").order("name"),
    supabase.from("club_settings").select("budget, free_transfers_per_gameweek, transfer_hit_points").single(),
  ]);
  if (rules.error) throw new Error(`Couldn't load the scoring rules: ${rules.error.message}`);
  if (settings.error) throw new Error(`Couldn't load the club settings: ${settings.error.message}`);
  return {
    rules: rules.data,
    settings: {
      budget: Number(settings.data.budget),
      freeTransfers: settings.data.free_transfers_per_gameweek,
      hitPoints: settings.data.transfer_hit_points,
    },
  };
}
