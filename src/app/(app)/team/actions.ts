"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember } from "@/lib/auth";
import type { SavedPick } from "@/lib/squad";
import { createClient } from "@/lib/supabase/server";

/** Save the signed-in manager's squad. The database checks every rule and the deadline. */
export async function saveSquadAction(picks: SavedPick[]): Promise<ActionResult> {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_squad", { p_picks: picks });
  if (error) {
    // Rule breaks come back as plain-English messages from the database.
    if (error.code === "22023" || error.code === "42501") return fail(error.message);
    console.error("save_squad failed", error);
    return fail(`Couldn't save your team: ${error.message}`);
  }
  revalidatePath("/", "layout");
  return ok(undefined, "Team saved");
}
