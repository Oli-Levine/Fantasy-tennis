/**
 * Public Supabase settings. These are set in `.env.local` locally and in
 * Vercel → Project → Settings → Environment Variables in production.
 *
 * NEXT_PUBLIC_* values are baked in at build time, so after changing them in
 * Vercel you must redeploy.
 */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "(in .env.local, or in Vercel's Environment Variables and then redeploy).",
    );
  }
  return { url, anonKey };
}

/**
 * Local-only escape hatch so the signed-in screens can be screenshotted when
 * Supabase isn't reachable. `NODE_ENV` is "production" in every Vercel build,
 * so this is always false there.
 */
export function devAuthBypass(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_SKIP_AUTH === "1";
}
