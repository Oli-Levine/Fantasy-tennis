/**
 * Only allow same-site relative paths as post-login destinations, so a crafted
 * `?next=` can't bounce users to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
