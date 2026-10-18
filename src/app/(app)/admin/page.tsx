import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, ListChecks, UserCog, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { requireAdmin } from "@/lib/auth";
import { devAuthBypass } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatLondonDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { DEMO_GAMEWEEKS, DEMO_PLAYERS, DEMO_RULES, DEMO_USERS } from "@/lib/dev-fixtures";
import { JoinCodeCard } from "./join-code-card";
import { ResetSeasonCard } from "./reset-season-card";
import { TestDataCard } from "./test-data-card";

export const metadata: Metadata = { title: "Admin" };

type Overview = {
  joinCode: string;
  players: number;
  rules: number;
  gameweeks: number;
  nextDeadline: string | null;
  members: number;
  testData: { players: number; scoring_rules: number; managers: number };
};

export default async function AdminPage() {
  await requireAdmin();
  const o = devAuthBypass() ? demoOverview() : await loadOverview();
  const hasTestData = o.testData.players + o.testData.scoring_rules + o.testData.managers > 0;

  const sections: { href: string; icon: LucideIcon; label: string; detail: string; soon?: boolean }[] = [
    { href: "/admin/players", icon: Users, label: "Players", detail: `${o.players} in the pool · photos · CSV import` },
    { href: "/admin/rules", icon: ListChecks, label: "Scoring rules", detail: `${o.rules} active rules` },
    {
      href: "/admin/gameweeks",
      icon: CalendarDays,
      label: "Gameweeks",
      detail: o.nextDeadline ? `Next deadline ${formatLondonDateTime(new Date(o.nextDeadline))}` : `${o.gameweeks} scheduled`,
    },
    { href: "/admin/users", icon: UserCog, label: "Users", detail: `${o.members} members · promote or remove` },
    { href: "/results", icon: ClipboardList, label: "Results entry", detail: "Enter results, save drafts and publish points" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Admin" subtitle="Run the club's fantasy league." />

      <nav aria-label="Admin sections" className="overflow-hidden rounded-panel bg-card shadow-soft">
        {sections.map(({ href, icon: Icon, label, detail, soon }) => {
          const content = (
            <>
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  soon ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{detail}</span>
              </span>
              {!soon && <ChevronRight className="size-5 text-muted-foreground" />}
            </>
          );
          const className = "flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0";
          return soon ? (
            <div key={label} className={cn(className, "opacity-60")}>
              {content}
            </div>
          ) : (
            <Link key={label} href={href} className={cn(className, "transition-colors hover:bg-muted/60")}>
              {content}
            </Link>
          );
        })}
      </nav>

      <JoinCodeCard code={o.joinCode} />
      {hasTestData && <TestDataCard counts={o.testData} />}
      <ResetSeasonCard />
    </div>
  );
}

async function loadOverview(): Promise<Overview> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [code, players, rules, gameweeks, next, members, testData] = await Promise.all([
    supabase.rpc("get_join_code"),
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("scoring_rules").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("gameweeks").select("id", { count: "exact", head: true }),
    supabase
      .from("gameweeks")
      .select("deadline")
      .eq("is_blank", false)
      .gt("deadline", nowIso)
      .order("deadline")
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).not("joined_at", "is", null),
    supabase.rpc("admin_test_data_counts"),
  ]);
  const failed = [code, players, rules, gameweeks, next, members, testData].find((r) => r.error);
  if (failed?.error) throw new Error(`Couldn't load the admin overview: ${failed.error.message}`);

  return {
    joinCode: code.data!,
    players: players.count ?? 0,
    rules: rules.count ?? 0,
    gameweeks: gameweeks.count ?? 0,
    nextDeadline: next.data?.deadline ?? null,
    members: members.count ?? 0,
    testData: testData.data!,
  };
}

function demoOverview(): Overview {
  return {
    joinCode: "ACES26",
    players: DEMO_PLAYERS.length,
    rules: DEMO_RULES.filter((r) => !r.archived_at).length,
    gameweeks: DEMO_GAMEWEEKS.length,
    nextDeadline: DEMO_GAMEWEEKS[2].deadline,
    members: DEMO_USERS.filter((u) => u.joined_at).length,
    testData: { players: 40, scoring_rules: 8, managers: 10 },
  };
}
