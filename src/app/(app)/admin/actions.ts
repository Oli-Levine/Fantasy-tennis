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
