import { BottomNav } from "@/components/app/bottom-nav";
import { TopBar } from "@/components/app/top-bar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar name={user.name} email={user.email} />
      <main
        className="mx-auto w-full max-w-content flex-1 px-gutter pt-4"
        style={{ paddingBottom: "calc(var(--nav-height) + env(safe-area-inset-bottom) + 1.5rem)" }}
      >
        {children}
      </main>
      {/* Admin tab appears once roles exist (Phase 2). */}
      <BottomNav />
    </div>
  );
}
