"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cleanName, validateDisplayName, validateTeamName } from "@/lib/validation";

export type ProfileState = { error: string | null; saved?: number; values?: { team_name: string; display_name: string } };

/** Change the signed-in manager's team name and display name. */
export async function updateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { user } = await requireMember();
  const values = { team_name: cleanName(formData.get("team_name")), display_name: cleanName(formData.get("display_name")) };

  const problem = validateTeamName(values.team_name) ?? validateDisplayName(values.display_name);
  if (problem) return { error: problem, values };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(values).eq("id", user.id);
  if (error?.code === "23505") return { error: `“${values.team_name}” is already taken. Try another team name.`, values };
  if (error) {
    console.error("updating profile failed", error);
    return { error: "Something went wrong. Please try again.", values };
  }
  revalidatePath("/", "layout");
  return { error: null, saved: Date.now(), values };
}
