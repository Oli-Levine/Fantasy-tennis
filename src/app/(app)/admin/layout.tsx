import { requireAdmin } from "@/lib/auth";

/** Every page under /admin is admins-only (the database enforces it too). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return children;
}
