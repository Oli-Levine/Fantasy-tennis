import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/app/logo";
import { getViewer, isOnboarded } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { JoinCodeForm, TeamForm } from "./join-forms";

export const metadata: Metadata = { title: "Join the club" };

export default async function JoinPage() {
  const { user, profile } = await getViewer();
  if (isOnboarded(profile)) redirect("/");

  const step = profile?.joined_at ? 2 : 1;

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-content flex-col px-gutter"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 2rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
    >
      <div className="flex items-center justify-between">
        <LogoMark className="size-10" />
        <form action="/auth/signout" method="post">
          <button type="submit" className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-8 flex gap-1.5" aria-label={`Step ${step} of 2`}>
        {[1, 2].map((n) => (
          <span key={n} className={cn("h-1.5 flex-1 rounded-full", n <= step ? "bg-primary" : "bg-muted-strong")} />
        ))}
      </div>

      <section className="mt-6 rounded-panel bg-card p-6 shadow-soft">
        {step === 1 ? (
          <>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Step 1 of 2</p>
            <h1 className="mt-1 text-2xl">Join the club</h1>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.email}</span>. Enter the join
              code from a club admin to get in.
            </p>
            <JoinCodeForm />
          </>
        ) : (
          <>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Step 2 of 2</p>
            <h1 className="mt-1 text-2xl">Name your team</h1>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-muted-foreground">
              You&apos;re in! Pick a team name for the league table.
            </p>
            <TeamForm defaultDisplayName={profile?.display_name ?? user.name} />
          </>
        )}
      </section>
    </main>
  );
}
