import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Google sends the user back to Supabase, which sends them here with a one-time
 * `code`. We swap it for a session cookie, then go to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("Auth callback: code exchange failed", error.message);
  } else {
    console.error("Auth callback: no code", searchParams.get("error_description"));
  }

  return NextResponse.redirect(`${origin}/login?error=signin_failed`);
}
