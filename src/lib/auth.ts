import "server-only";
import { redirect } from "next/navigation";
import { devAuthBypass } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

/** The signed-in user, or a redirect to /login. Use in Server Components. */
export async function requireUser(): Promise<CurrentUser> {
  if (devAuthBypass()) {
    return { id: "dev-user", email: "dev@example.com", name: "Dev Player", avatarUrl: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const { user } = data;
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? "",
    name: (meta.full_name as string) || (meta.name as string) || user.email || "Player",
    avatarUrl: (meta.avatar_url as string) || null,
  };
}
