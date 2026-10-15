"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, fail, ok, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth";
import type { GameweekStatus } from "@/lib/database.types";
import { recalculateGameweek } from "@/lib/recalculate";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/", "layout");
}

/** Create `weeks` weekly deadlines at 21:00 UK time, starting on `firstDate` (YYYY-MM-DD). */
export async function generateGameweeks(firstDate: string, weeks: number): Promise<ActionResult<number>> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) return fail("Choose a start date.");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) return fail("Choose between 1 and 52 weeks.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_generate_gameweeks", { p_first_date: firstDate, p_weeks: weeks });
  if (error) return fail(describeDbError(error));
  refresh();
  const skipped = weeks - data;
  return ok(
    data,
    data === 0
      ? "Those weeks already exist."
      : `${data} gameweek${data === 1 ? "" : "s"} created${skipped ? ` (${skipped} already existed)` : ""}`,
  );
}

export type GameweekFields = { deadline: string; is_blank: boolean; status: GameweekStatus };

export async function updateGameweek(id: number, fields: GameweekFields): Promise<ActionResult> {
  await requireAdmin();
  const deadline = new Date(fields.deadline);
  if (Number.isNaN(deadline.getTime())) return fail("Choose a valid deadline.");
  if (!["open", "locked", "published"].includes(fields.status)) return fail("Choose a valid status.");

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("gameweeks")
    .select("status, locked_at, published_at")
    .eq("id", id)
    .single();
  if (loadError) return fail(describeDbError(loadError, "That gameweek"));

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("gameweeks")
    .update({
      deadline: deadline.toISOString(),
      is_blank: fields.is_blank,
      status: fields.status,
      locked_at: fields.status === "open" ? null : (current.locked_at ?? now),
      published_at: fields.status === "published" ? (current.published_at ?? now) : null,
    })
    .eq("id", id);
  if (error) {
    return fail(error.code === "23505" ? "Another gameweek already has that exact deadline." : describeDbError(error, "That gameweek"));
  }
  // Publishing from here scores the gameweek just like the Results page does.
  if (fields.status === "published" && current.status !== "published" && !fields.is_blank) {
    const recalcError = await recalculateGameweek(supabase, id, true);
    if (recalcError) return fail(`Gameweek updated, but points couldn't be calculated: ${describeDbError(recalcError)}`);
  }
  refresh();
  return ok(undefined, "Gameweek updated");
}

export async function deleteGameweek(id: number): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("gameweeks").delete().eq("id", id).select("id");
  if (error) return fail(describeDbError(error, "That gameweek"));
  if (!data?.length) return fail("That gameweek no longer exists.");
  refresh();
  return ok(undefined, "Gameweek deleted (the rest were renumbered)");
}
