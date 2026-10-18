"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, fail, ok, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth";
import type { Role } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export async function setRole(userId: string, role: Role): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
  if (error) return fail(describeDbError(error));
  revalidatePath("/", "layout");
  const messages: Record<Role, string> = {
    admin: "Promoted to admin",
    captain: "Now a team captain (can enter results)",
    user: "Back to a regular player",
  };
  return ok(undefined, messages[role]);
}

export async function removeUser(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_user", { p_user_id: userId });
  if (error) return fail(describeDbError(error));
  revalidatePath("/", "layout");
  return ok(undefined, "User removed");
}

/** Not playing = keeps full access but is left out of the league (e.g. the organiser). */
export async function setPlaying(userId: string, playing: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_playing", { p_user_id: userId, p_playing: playing });
  if (error) return fail(describeDbError(error));
  revalidatePath("/", "layout");
  return ok(undefined, playing ? "now playing and shown in the league" : "not playing, hidden from the league");
}
