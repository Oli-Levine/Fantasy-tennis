import type { Metadata } from "next";
import { AdminHeader } from "@/components/app/admin-header";
import { requireAdmin } from "@/lib/auth";
import { devAuthBypass } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { DEMO_USERS } from "../dev-fixtures";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = { title: "Users · Admin" };

export default async function AdminUsersPage() {
  const { user } = await requireAdmin();
  const users = devAuthBypass() ? DEMO_USERS : await loadUsers();
  const members = users.filter((u) => u.joined_at).length;

  return (
    <>
      <AdminHeader title="Users" subtitle={`${members} member${members === 1 ? "" : "s"} · ${users.length - members} waiting for the code`} />
      <UsersManager users={users} currentUserId={user.id} />
    </>
  );
}

async function loadUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw new Error(`Couldn't load users: ${error.message}`);
  return data;
}
