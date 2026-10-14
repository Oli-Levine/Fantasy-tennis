"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cleanName, validateDisplayName, validateTeamName } from "@/lib/validation";

export type FormState = { error: string | null; values?: Record<string, string> };

/** Step 1: check the club join code. */
export async function joinClubAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = cleanName(formData.get("code"));
  if (!code) return { error: "Enter the club join code." };

  await getViewer(); // signed in, or redirected to /login
  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("join_club", { p_code: code });
  if (error) {
    console.error("join_club failed", error);
    return { error: "Something went wrong. Please try again.", values: { code } };
  }
  if (!ok) {
    return { error: "That code isn't right. Ask a club admin for the current code.", values: { code } };
  }
  redirect("/join");
}

/** Step 2: choose a team name and display name. */
export async function saveTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamName = cleanName(formData.get("team_name"));
  const displayName = cleanName(formData.get("display_name"));
  const values = { team_name: teamName, display_name: displayName };

  const problem = validateTeamName(teamName) ?? validateDisplayName(displayName);
  if (problem) return { error: problem, values };

  const { user } = await getViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ team_name: teamName, display_name: displayName })
    .eq("id", user.id)
    .select("id");

  if (error?.code === "23505") {
    return { error: `“${teamName}” is already taken. Try another team name.`, values };
  }
  if (error) {
    console.error("saving team name failed", error);
    return { error: "Something went wrong. Please try again.", values };
  }
  if (!data?.length) redirect("/join"); // not a member yet
  redirect("/");
}
