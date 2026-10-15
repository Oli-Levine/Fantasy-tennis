import type { RuleCategory, RuleType } from "@/lib/database.types";

export const RULE_TYPES: { value: RuleType; label: string; hint: string }[] = [
  { value: "tick", label: "Tick", hint: "Yes/no, e.g. “Won match”" },
  { value: "count", label: "Count", hint: "A number × points, e.g. “Sets won”" },
];

export const RULE_CATEGORIES: { value: RuleCategory; label: string; hint: string }[] = [
  { value: "match", label: "Match", hint: "On court: wins, sets, bagels…" },
  { value: "other", label: "Other", hint: "Off court: socials, no-shows… (still scores if they didn't play)" },
];

/** "+5", "−1", "0" — with a real minus sign. */
export function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return "0";
}

export function validateRule(input: { name: string; points: number; type: string; category: string }): string[] {
  const problems: string[] = [];
  const name = input.name.trim();
  if (!name) problems.push("Name is required.");
  else if (name.length > 60) problems.push("Name can be at most 60 characters.");
  if (!Number.isInteger(input.points)) problems.push("Points must be a whole number, e.g. 5 or -2.");
  else if (input.points < -100 || input.points > 100) problems.push("Points must be between −100 and 100.");
  if (!["tick", "count"].includes(input.type)) problems.push("Choose tick or count.");
  if (!["match", "other"].includes(input.category)) problems.push("Choose match or other.");
  return problems;
}

/** Accepts "5", "+5", "-2", "−2" (unicode minus). */
export function parsePoints(value: string): number {
  const cleaned = value.trim().replace(/^−/, "-").replace(/^\+/, "");
  return /^-?\d+$/.test(cleaned) ? Number(cleaned) : NaN;
}
