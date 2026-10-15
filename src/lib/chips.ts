import type { Chip } from "@/lib/database.types";

export type ChipInfo = {
  id: Chip;
  name: string;
  /** Short line for lists and banners. */
  summary: string;
  /** What happens, shown in the confirm modal. */
  effect: string;
};

export const CHIPS: ChipInfo[] = [
  {
    id: "triple_captain",
    name: "Triple Captain",
    summary: "Your captain scores 3× this gameweek.",
    effect:
      "Your captain's points are tripled instead of doubled for this gameweek. If your captain doesn't play, your vice-captain gets the 3×.",
  },
  {
    id: "wildcard",
    name: "Wildcard",
    summary: "Unlimited free transfers this gameweek. The changes are permanent.",
    effect:
      "Make as many transfers as you like before the deadline without losing any points. Your new squad stays after this gameweek. You still have to stay within budget.",
  },
  {
    id: "free_hit",
    name: "Free Hit",
    summary: "Unlimited free transfers for one gameweek, then your squad goes back.",
    effect:
      "Make as many transfers as you like before the deadline without losing any points. After this gameweek's deadline your squad goes back to how it was at the last deadline. You still have to stay within budget.",
  },
];

export const chipInfo = (id: Chip) => CHIPS.find((c) => c.id === id)!;

/** Chips that make every transfer free for the gameweek. */
export const isUnlimitedTransferChip = (chip: Chip | null) => chip === "wildcard" || chip === "free_hit";
