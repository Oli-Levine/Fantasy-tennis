"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, fail, ok, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth";
import type { RuleCategory, RuleType } from "@/lib/database.types";
import { validateRule } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/", "layout");
}

export type RuleFields = { name: string; points: number; type: RuleType; category: RuleCategory };

export async function saveRule(id: string | null, fields: RuleFields): Promise<ActionResult> {
  await requireAdmin();
  const values = {
    name: fields.name.trim().replace(/\s+/g, " "),
    points: Number(fields.points),
    type: fields.type,
    category: fields.category,
  };
  const problems = validateRule(values);
  if (problems.length) return fail(problems[0]);

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("scoring_rules").update(values).eq("id", id);
    if (error) return fail(describeDbError(error, "That rule"));
  } else {
    const { data: last } = await supabase
      .from("scoring_rules")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("scoring_rules")
      .insert({ ...values, sort_order: (last?.sort_order ?? 0) + 10 });
    if (error) return fail(describeDbError(error, "That rule"));
  }
  refresh();
  return ok(undefined, id ? `“${values.name}” updated` : `“${values.name}” added`);
}

/**
 * Deletes a rule. If results already use it, it's archived instead so no
 * scoring history is lost (archived rules no longer appear for new results).
 */
export async function deleteRule(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("scoring_rules").delete().eq("id", id).select("name");
  if (error?.code === "23503") {
    const { data: archived, error: archiveError } = await supabase
      .from("scoring_rules")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("name")
      .single();
    if (archiveError) return fail(describeDbError(archiveError, "That rule"));
    refresh();
    return ok(undefined, `“${archived.name}” has results, so it was archived instead of deleted`);
  }
  if (error) return fail(describeDbError(error, "That rule"));
  if (!data?.length) return fail("That rule no longer exists.");
  refresh();
  return ok(undefined, `“${data[0].name}” deleted`);
}

export async function restoreRule(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("scoring_rules").update({ archived_at: null }).eq("id", id);
  if (error) return fail(describeDbError(error, "That rule"));
  refresh();
  return ok(undefined, "Rule restored");
}

/** Swap a rule with its neighbour in the display order. */
export async function moveRule(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: rules, error } = await supabase
    .from("scoring_rules")
    .select("id, sort_order")
    .is("archived_at", null)
    .order("sort_order")
    .order("name");
  if (error) return fail(describeDbError(error));

  const from = rules.findIndex((r) => r.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= rules.length) return ok(undefined);

  // Re-space everything 10 apart so equal sort orders can't get stuck.
  const ordered = [...rules];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  for (const [i, rule] of ordered.entries()) {
    const sort_order = (i + 1) * 10;
    if (rule.sort_order !== sort_order) {
      const { error: updateError } = await supabase.from("scoring_rules").update({ sort_order }).eq("id", rule.id);
      if (updateError) return fail(describeDbError(updateError));
    }
  }
  refresh();
  return ok(undefined);
}
