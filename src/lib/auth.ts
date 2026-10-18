import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Profile } from "@/lib/database.types";
import { devAuthBypass } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type Viewer = {
  user: CurrentUser;
  profile: Profile | null;
};

/** A club member who has finished onboarding (has a team name). */
export type Member = {
  user: CurrentUser;
  profile: Profile & { team_name: string; joined_at: string };
  isAdmin: boolean;
};

const DEV_VIEWER: Viewer = {
  user: { id: "dev-user", email: "dev@example.com", name: "Dev Player", avatarUrl: null },
  profile: {
    id: "dev-user",
    display_name: "Dev Player",
    team_name: "Deuce Bigalow",
    role: "admin",
    joined_at: "2026-01-01T00:00:00Z",
    is_test_data: false,
    is_playing: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
};

/**
 * The signed-in user and their profile (cached per request), or a redirect to
 * /login. Use in Server Components and Server Actions.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (devAuthBypass()) return devViewer();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const { user } = data;
  const meta = user.user_metadata ?? {};
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      name: (meta.full_name as string) || (meta.name as string) || user.email || "Player",
      avatarUrl: (meta.avatar_url as string) || null,
    },
    profile,
  };
});

/** Local dev only: DEV_PROFILE=outsider|joined|member previews each onboarding state. */
function devViewer(): Viewer {
  const profile = DEV_VIEWER.profile!;
  switch (process.env.DEV_PROFILE) {
    case "outsider":
      return { ...DEV_VIEWER, profile: { ...profile, joined_at: null, team_name: null, role: "user" } };
    case "joined":
      return { ...DEV_VIEWER, profile: { ...profile, team_name: null, role: "user" } };
    case "member":
      return { ...DEV_VIEWER, profile: { ...profile, role: "user" } };
    default:
      return DEV_VIEWER;
  }
}

/** Has entered the join code and chosen a team name. */
export function isOnboarded(profile: Profile | null): profile is Member["profile"] {
  return Boolean(profile?.joined_at && profile.team_name);
}

/** A fully onboarded club member, or a redirect to the join flow. */
export async function requireMember(): Promise<Member> {
  const { user, profile } = await getViewer();
  if (!isOnboarded(profile)) redirect("/join");
  return { user, profile, isAdmin: profile.role === "admin" };
}

/**
 * An admin, or a redirect home. This only decides what the UI shows; the
 * database enforces admin rights separately (RLS), whatever the app does.
 */
export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();
  if (!member.isAdmin) redirect("/");
  return member;
}
