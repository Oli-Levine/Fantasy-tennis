/** Club teams are stored as 1–6 and shown as "1s"–"6s". */
export const CLUB_TEAMS = [1, 2, 3, 4, 5, 6] as const;
export const PHOTO_BUCKET = "player-photos";
export const MAX_PLAYERS = 40;

export function clubTeamLabel(team: number): string {
  return `${team}s`;
}

/** Accepts "1", "1s", "1st", "1sts", "Team 1"… → 1. */
export function parseClubTeam(value: unknown): number | null {
  const match = String(value ?? "").trim().match(/^(?:team\s*)?([1-6])(?:s|st|nd|rd|th|sts|nds|rds|ths)?$/i);
  return match ? Number(match[1]) : null;
}

/** Accepts "8.5", "£8.5m", "8.5m" → 8.5 (rounded to 0.1). */
export function parsePrice(value: unknown): number | null {
  const cleaned = String(value ?? "").trim().replace(/^£/, "").replace(/m$/i, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 10) / 10;
}

/** Accepts yes/no, true/false, 1/0, active/unavailable; blank = active. */
export function parseActive(value: unknown): boolean | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "" || ["yes", "y", "true", "1", "active", "available"].includes(v)) return true;
  if (["no", "n", "false", "0", "inactive", "unavailable", "injured"].includes(v)) return false;
  return null;
}

export type PlayerInput = { name: string; club_team: number; price: number; is_active: boolean };

/** Returns a list of problems (empty = valid). Mirrors the database checks. */
export function validatePlayer(input: {
  name: string;
  club_team: number | null;
  price: number | null;
}): string[] {
  const problems: string[] = [];
  const name = input.name.trim();
  if (!name) problems.push("Name is required.");
  else if (name.length > 60) problems.push("Name can be at most 60 characters.");
  if (input.club_team == null || input.club_team < 1 || input.club_team > 6)
    problems.push("Club team must be 1s–6s.");
  if (input.price == null) problems.push("Price must be a number, e.g. 8.5.");
  else if (input.price <= 0 || input.price > 99.9) problems.push("Price must be between £0.1m and £99.9m.");
  return problems;
}

/** Public URL of a photo in Supabase Storage. */
export function playerPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}
