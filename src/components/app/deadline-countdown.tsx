"use client";

import { useSyncExternalStore } from "react";
import { formatCountdown, nextDeadline } from "@/lib/time";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const currentSecond = () => Math.floor(Date.now() / 1000);
const serverSecond = () => null;

/** Live countdown to the next Tuesday 21:00 UK deadline. */
export function DeadlineCountdown() {
  const second = useSyncExternalStore(subscribe, currentSecond, serverSecond);
  if (second === null) return <span aria-hidden="true">–</span>;

  const now = new Date(second * 1000);
  return (
    <time dateTime={nextDeadline(now).toISOString()} suppressHydrationWarning>
      {formatCountdown(nextDeadline(now).getTime() - now.getTime())}
    </time>
  );
}
