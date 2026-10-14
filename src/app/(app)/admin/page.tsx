import type { Metadata } from "next";
import { CalendarDays, ClipboardList, ListChecks, UserCog, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { requireAdmin } from "@/lib/auth";
import { devAuthBypass } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { JoinCodeCard } from "./join-code-card";

export const metadata: Metadata = { title: "Admin" };

const COMING = [
  { icon: Users, label: "Players", detail: "Add, edit, photos and CSV import" },
  { icon: ListChecks, label: "Scoring rules", detail: "Create, edit and delete" },
  { icon: CalendarDays, label: "Gameweeks", detail: "Deadlines, blank weeks, status" },
  { icon: ClipboardList, label: "Results entry", detail: "Weekly grid, draft and publish" },
  { icon: UserCog, label: "Users", detail: "Promote to admin, remove" },
];

export default async function AdminPage() {
  await requireAdmin();
  const code = devAuthBypass() ? "ACES26" : await loadJoinCode();

  return (
    <div className="space-y-4">
      <PageHeader title="Admin" subtitle="Run the club's fantasy league." />
      <JoinCodeCard code={code} />

      <section className="rounded-panel bg-card p-5 shadow-soft">
        <h2 className="text-base">Coming next</h2>
        <ul className="mt-3 divide-y divide-border">
          {COMING.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex items-center gap-3 py-3 opacity-70">
              <Icon className="size-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

async function loadJoinCode() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_join_code");
  if (error) throw new Error(`Couldn't load the join code: ${error.message}`);
  return data;
}
