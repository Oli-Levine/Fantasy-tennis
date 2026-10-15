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
  return ok(undefined, role === "admin" ? "Promoted to admin" : "Admin rights removed");
}

export async function removeUser(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_user", { p_user_id: userId });
  if (error) return fail(describeDbError(error));
  revalidatePath("/", "layout");
  return ok(undefined, "User removed");
}
