"use client";

import { usePathname } from "next/navigation";

/** Full-strength court on the sign-in page, Home and Team; a dark backdrop on text-heavy pages. */
const FULL_COURT = ["/", "/team", "/login"];
const DIMMED = 0.55;

/** The fixed court layer behind every screen (styles in globals.css). */
export function CourtBackground() {
  const pathname = usePathname();
  const dim = FULL_COURT.includes(pathname) ? 0 : DIMMED;
  return <div aria-hidden="true" className="court-bg" style={{ "--court-dim": dim } as React.CSSProperties} />;
}
