import type { Metadata } from "next";
import { LogoMark } from "@/components/app/logo";
import { safeNextPath } from "@/lib/redirect";
import { GoogleSignInButton } from "./google-button";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  signin_failed: "Sign-in didn't complete. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] ?? ERRORS.signin_failed : null;
  const rawNext = typeof params.next === "string" ? params.next : null;
  const next = rawNext ? safeNextPath(rawNext) : undefined;

  return (
    <main
      className="relative flex min-h-dvh flex-col overflow-hidden bg-ink text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* tennis court, seen from above */}
      <svg
        aria-hidden="true"
        viewBox="0 0 120 200"
        preserveAspectRatio="xMidYMin meet"
        className="pointer-events-none absolute inset-x-10 top-10 h-[44%] w-[calc(100%-5rem)] text-white opacity-[0.09]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      >
        <rect x="6" y="4" width="108" height="192" />
        <line x1="19.5" y1="4" x2="19.5" y2="196" />
        <line x1="100.5" y1="4" x2="100.5" y2="196" />
        <line x1="19.5" y1="54" x2="100.5" y2="54" />
        <line x1="19.5" y1="146" x2="100.5" y2="146" />
        <line x1="60" y1="54" x2="60" y2="146" />
        <line x1="2" y1="100" x2="118" y2="100" strokeWidth="2" />
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 size-96 rounded-full bg-primary/40 blur-3xl"
      />

      <div className="relative flex flex-1 flex-col justify-end px-6 pb-6">
        <LogoMark className="mb-6 h-24" />
        <h1 className="text-[2.5rem] leading-[1.05] font-bold">
          UOB Tennis
          <br />
          <span className="text-line-yellow">Fantasy</span>
        </h1>
        <p className="mt-3 max-w-xs text-base text-white/70">
          Pick your club squad, captain your star and climb the league.
        </p>
      </div>

      <div className="relative rounded-t-panel bg-surface px-6 pt-7 pb-8 text-foreground">
        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
            {error}
          </p>
        )}
        <GoogleSignInButton next={next} />
        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          Any Google account works. You&apos;ll need the club join code before you can create a team.
        </p>
      </div>
    </main>
  );
}
