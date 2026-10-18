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
      className="relative flex min-h-dvh flex-col text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* The full-strength court (CourtBackground) shows through; the crest and name sit on a navy panel. */}
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="on-dark w-full max-w-xs rounded-glass bg-navy/95 px-6 pt-7 pb-6 text-center shadow-lifted">
          <LogoMark className="mx-auto block h-28" />
          <h1 className="mt-5 text-[2.25rem] leading-[1.05] font-bold">
            UOB Tennis
            <br />
            <span className="text-line-yellow">Fantasy</span>
          </h1>
        </div>
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
