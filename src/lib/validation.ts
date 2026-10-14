/** Shared input rules (the database enforces the same limits). */
export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 30;
export const DISPLAY_NAME_MAX = 40;

/** Trim and collapse inner whitespace. */
export function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateTeamName(name: string): string | null {
  if (name.length < TEAM_NAME_MIN) return `Team name needs at least ${TEAM_NAME_MIN} characters.`;
  if (name.length > TEAM_NAME_MAX) return `Team name can be at most ${TEAM_NAME_MAX} characters.`;
  return null;
}

export function validateDisplayName(name: string): string | null {
  if (name.length < 1) return "Please enter your name.";
  if (name.length > DISPLAY_NAME_MAX) return `Name can be at most ${DISPLAY_NAME_MAX} characters.`;
  return null;
}
