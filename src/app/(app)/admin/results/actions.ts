"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, fail, ok, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth";
import { recalculateGameweek } from "@/lib/recalculate";
import type { PlayerResult } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

/**
 * Saves the raw results for a gameweek. "publish" also scores it and makes the
 * points visible. Saving changes to an already-published gameweek re-scores it
 * straight away.
 */
export async function saveResultsAction(
  gameweekId: number,
  results: Record<string, PlayerResult>,
  publish: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: gw, error: gwError } = await supabase
    .from("gameweeks")
    .select("number, status")
    .eq("id", gameweekId)
    .single();
  if (gwError) return fail(describeDbError(gwError, "That gameweek"));

  const payload = Object.entries(results)
    .map(([player_id, r]) => ({
      player_id,
      did_not_play: r.didNotPlay,
      counts: Object.fromEntries(Object.entries(r.counts).filter(([, n]) => n > 0)),
    }))
    .filter((r) => r.did_not_play || Object.keys(r.counts).length > 0);

  const { error } = await supabase.rpc("admin_save_results", { p_gameweek_id: gameweekId, p_results: payload });
  if (error) return fail(describeDbError(error, "Those results"));

  const wasPublished = gw.status === "published";
  if (publish || wasPublished) {
    const recalcError = await recalculateGameweek(supabase, gameweekId, publish);
    if (recalcError) return fail(`Results saved, but points couldn't be calculated: ${describeDbError(recalcError)}`);
  }

  revalidatePath("/", "layout");
  return ok(
    undefined,
    publish && !wasPublished
      ? `Gameweek ${gw.number} published. Points are now live.`
      : wasPublished
        ? `Saved. Gameweek ${gw.number} points recalculated.`
        : "Draft saved. Members can't see it until you publish.",
  );
}
