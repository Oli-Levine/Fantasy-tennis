/**
 * Public Supabase settings. These are set in `.env.local` locally and in
 * Vercel → Project → Settings → Environment Variables in production.
 *
 * NEXT_PUBLIC_* values are baked in at build time, so after changing them in
 * Vercel you must redeploy.
 */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length > 0 || !url || !anonKey) {
    throw new Error(
      `Supabase is not configured: missing ${missing.join(" and ")}. ` +
        "Set it in .env.local, or in Vercel → Settings → Environment Variables (for Production) and then redeploy.",
    );
  }
  return { url, anonKey };
}

/** Accepts the URL with stray whitespace, a trailing slash or `/rest/v1/`. */
export function normaliseSupabaseUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  return trimmed || undefined;
}

/**
 * Local-only escape hatch so the signed-in screens can be screenshotted when
 * Supabase isn't reachable. `NODE_ENV` is "production" in every Vercel build,
 * so this is always false there.
 */
export function devAuthBypass(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_SKIP_AUTH === "1";
}
