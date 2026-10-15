import type { Metadata } from "next";
import { AdminHeader } from "@/components/app/admin-header";
import type { ScoringRule } from "@/lib/database.types";
import { devAuthBypass } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { DEMO_RULES } from "@/lib/dev-fixtures";
import { RulesManager } from "./rules-manager";

export const metadata: Metadata = { title: "Scoring rules · Admin" };

export default async function AdminRulesPage() {
  const rules = devAuthBypass() ? DEMO_RULES : await loadRules();
  return (
    <>
      <AdminHeader title="Scoring rules" subtitle="Points each player earns per gameweek. All rules stack." />
      <RulesManager rules={rules} />
    </>
  );
}

async function loadRules(): Promise<ScoringRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("scoring_rules").select("*").order("sort_order").order("name");
  if (error) throw new Error(`Couldn't load scoring rules: ${error.message}`);
  return data;
}
