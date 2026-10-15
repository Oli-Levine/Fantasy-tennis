"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { formatCountdown } from "@/lib/time";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const currentSecond = () => Math.floor(Date.now() / 1000);
const serverSecond = () => null;

/**
 * Live countdown to a gameweek deadline. When it reaches zero the page is
 * refreshed, so it moves on to the next gameweek (and the team gets locked).
 */
export function DeadlineCountdown({ deadline }: { deadline: string | null }) {
  const router = useRouter();
  const second = useSyncExternalStore(subscribe, currentSecond, serverSecond);
  const target = deadline ? new Date(deadline).getTime() : null;
  const expired = target != null && second != null && second * 1000 >= target;
  const refreshed = useRef(false);

  useEffect(() => {
    if (expired && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [expired, router]);

  if (target == null) return <span>–</span>;
  if (second === null) return <span aria-hidden="true">–</span>;
  return (
    <time dateTime={deadline!} suppressHydrationWarning>
      {expired ? "Locked" : formatCountdown(target - second * 1000)}
    </time>
  );
}
