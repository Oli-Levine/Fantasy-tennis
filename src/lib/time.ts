import { TZDate } from "@date-fns/tz";

/** All game times are UK local time, which switches between GMT and BST. */
export const GAME_TIME_ZONE = "Europe/London";

/** Default weekly deadline: Tuesday (day 2) at 21:00 UK time. */
export const DEADLINE_WEEKDAY = 2;
export const DEADLINE_HOUR = 21;

/**
 * The next weekly deadline strictly after `now`, as an absolute instant.
 * Computed in Europe/London wall-clock time, so it stays at 21:00 UK time
 * whether the clocks are on GMT or BST.
 */
export function nextDeadline(now: Date): Date {
  const local = new TZDate(now.getTime(), GAME_TIME_ZONE);
  const daysAhead = (DEADLINE_WEEKDAY - local.getDay() + 7) % 7;

  const candidate = londonWallClock(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + daysAhead,
    DEADLINE_HOUR,
  );
  if (candidate.getTime() > now.getTime()) return candidate;

  return londonWallClock(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + daysAhead + 7,
    DEADLINE_HOUR,
  );
}

/** An instant for a given UK wall-clock time (day overflow is allowed). */
function londonWallClock(year: number, month: number, day: number, hour: number): Date {
  return new Date(new TZDate(year, month, day, hour, 0, 0, GAME_TIME_ZONE).getTime());
}

/**
 * Compact countdown text, e.g. "2d 16h", "5h 12m", "12m 30s", "0s".
 */
export function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** e.g. "Tue 21 Oct, 21:00" in UK time. */
export function formatLondonDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GAME_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
