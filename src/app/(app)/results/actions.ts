"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, fail, ok, type ActionResult } from "@/lib/action-result";
import { requireResultsEntry } from "@/lib/auth";
import { recalculateGameweek } from "@/lib/recalculate";
import type { PlayerResult } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

/**
 * Saves the raw results for the players in `changes` (others are left alone,
 * so several captains can each save their part). A player with nothing ticked
 * has their results cleared. "publish" (admins only) also scores the gameweek
 * and makes the points visible; saving changes to an already-published
 * gameweek (admins only) re-scores it straight away.
 */
export async function saveResultsAction(
  gameweekId: number,
  changes: Record<string, PlayerResult>,
  publish: boolean,
): Promise<ActionResult> {
  const { isAdmin } = await requireResultsEntry();
  const supabase = await createClient();

  const { data: gw, error: gwError } = await supabase
    .from("gameweeks")
    .select("number, status")
    .eq("id", gameweekId)
    .single();
  if (gwError) return fail(describeDbError(gwError, "That gameweek"));

  const wasPublished = gw.status === "published";
  if (!isAdmin && (publish || wasPublished)) {
    return fail("Only an admin can publish results or change a published gameweek.");
  }

  const payload = Object.entries(changes).map(([player_id, r]) => ({
    player_id,
    did_not_play: r.didNotPlay,
    counts: Object.fromEntries(Object.entries(r.counts).filter(([, n]) => n > 0)),
  }));

  if (payload.length > 0) {
    const { error } = await supabase.rpc("save_results", { p_gameweek_id: gameweekId, p_results: payload });
    if (error) return fail(describeDbError(error, "Those results"));
  }

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
        : isAdmin
          ? "Draft saved. Members can't see it until you publish."
          : "Draft saved. An admin will check it and publish the points.",
  );
}
