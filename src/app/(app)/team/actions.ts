"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import { chipInfo } from "@/lib/chips";
import type { Chip } from "@/lib/database.types";
import type { SavedPick } from "@/lib/squad";
import { createClient } from "@/lib/supabase/server";

type DbError = { code?: string; message: string };

/** Rule breaks come back from the database as plain-English messages. */
function explain(error: DbError, what: string): ActionResult<never> {
  if (error.code === "22023" || error.code === "42501") return fail(error.message);
  if (error.code === "PGRST202") {
    return fail("The database is missing an update. Ask the admin to run the latest file in supabase/migrations.");
  }
  console.error(`${what} failed`, error);
  return fail(`Couldn't ${what}: ${error.message}`);
}

/** Save the signed-in manager's squad. The database checks every rule and the deadline. */
export async function saveSquadAction(
  picks: SavedPick[],
): Promise<ActionResult<{ transfersMade: number; transferHit: number }>> {
  await requireMember();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_squad", { p_picks: picks });
  if (error) return explain(error, "save your team");
  revalidatePath("/", "layout");
  return ok({ transfersMade: data.transfers_made, transferHit: data.transfer_hit }, "Team saved");
}

/** Play a chip for the next gameweek. */
export async function playChipAction(chip: Chip): Promise<ActionResult> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("play_chip", { p_chip: chip });
  if (error) return explain(error, "play that chip");
  revalidatePath("/", "layout");
  return ok(undefined, `${chipInfo(chip).name} played`);
}

/** Cancel a chip before the deadline, so it can be used another week. */
export async function cancelChipAction(chip: Chip): Promise<ActionResult> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_chip", { p_chip: chip });
  if (error) return explain(error, "cancel that chip");
  revalidatePath("/", "layout");
  return ok(undefined, `${chipInfo(chip).name} cancelled`);
}
