"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type JoinCodeState = { error: string | null; saved?: string };

export async function setJoinCodeAction(_prev: JoinCodeState, formData: FormData): Promise<JoinCodeState> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (code.length < 4 || code.length > 40) return { error: "Use 4–40 characters." };
  if (/\s/.test(code)) return { error: "No spaces, please." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_join_code", { p_code: code });
  if (error) {
    console.error("set_join_code failed", error);
    return { error: "Couldn't save the code. Please try again." };
  }
  revalidatePath("/admin");
  return { error: null, saved: data };
}

export async function deleteTestDataAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_test_data");
  if (error) {
    console.error("admin_delete_test_data failed", error);
    return { ok: false, message: "Couldn't delete the test data. Please try again." };
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Deleted ${data.players} test players, ${data.scoring_rules} rules and ${data.managers} managers`,
  };
}
