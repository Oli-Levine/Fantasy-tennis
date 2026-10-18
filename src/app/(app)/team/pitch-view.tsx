"use client";

import { Plus } from "lucide-react";
import { CaptainBadgeChip, type PlayerCardData } from "@/components/app/player-card";
import { PlayerPhoto } from "@/components/app/player-photo";
import type { Stat } from "@/components/app/stats-header";
import { formatPrice, shortName } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * The squad drawn on the court, FPL-pitch style. The court background is a
 * fixed layer stretched over the screen (100lvh), so the pitch layer below is
 * the same size and pinned to the top of the page: at the top of the page the
 * tokens line up with the court lines on any phone. Court geometry, as a
 * percentage of the screen: doubles court x 14–86%, y 14–86%; service lines
 * y 30.6% and 69.4%; net y 50%; centre service line x 50%.
 */

/** Photo centres for the 4 starters: doubles pairs either side of the net and the centre line. */
const SPOTS = [
  { x: 32, y: 40.5 },
  { x: 68, y: 40.5 },
  { x: 32, y: 61.5 },
  { x: 68, y: 61.5 },
];

export type PitchSlot =
  | { kind: "player"; id: string; data: PlayerCardData; onClick: () => void }
  | { kind: "empty"; label: string };

/** Navy panel at the top of the Team page (stats in one row so it stays above the court). */
export function PitchSummary({
  eyebrow,
  title,
  actions,
  stats,
  children,
}: {
  eyebrow: React.ReactNode;
  title: string;
  actions: React.ReactNode;
  stats: Stat[];
  children?: React.ReactNode;
}) {
  return (
    <section className="on-dark rounded-glass bg-navy-glass px-3 py-2.5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {eyebrow}
          <h2 className="truncate text-base leading-tight">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      <dl
        className="mt-2 grid gap-x-2 border-t border-white/15 pt-2"
        style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dd className="truncate font-heading text-base leading-tight font-semibold tabular-nums">{stat.value}</dd>
            <dt className="truncate text-[11px] text-white/70">{stat.label}</dt>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

/** The 4 starters on the court, plus the bench strip just above the bottom navigation. */
export function CourtPitch({
  starters,
  bench,
  onAddPlayer,
}: {
  starters: PitchSlot[];
  bench: PitchSlot;
  /** Tapping an empty slot (scrolls to the player list). */
  onAddPlayer: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-10 h-lvh w-full"
      style={{ "--token": "clamp(60px, min(20vw, 10.5svh), 84px)" } as React.CSSProperties}
    >
      <h2 className="sr-only">Starters</h2>
      {starters.map((slot, i) => (
        <div
          key={slot.kind === "player" ? slot.id : `empty-${i}`}
          className="pointer-events-auto absolute w-[8.25rem] -translate-x-1/2"
          style={{ left: `${SPOTS[i].x}%`, top: `calc(${SPOTS[i].y}% - var(--token) / 2)` }}
        >
          {slot.kind === "player" ? <PlayerToken {...slot} /> : <EmptyToken label={slot.label} onClick={onAddPlayer} />}
        </div>
      ))}

      <BenchStrip slot={bench} onAddPlayer={onAddPlayer} />
    </div>
  );
}

function NavyPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-navy-glass px-3 py-1 text-[14px] leading-none font-semibold text-white shadow-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Circular photo with a white ring, the club-team tag and the captain badge. */
function TokenPhoto({ data, size }: { data: PlayerCardData; size: string }) {
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="size-full overflow-hidden rounded-full bg-tile shadow-token ring-[3px] ring-white">
        {data.photoUrl ? (
          <PlayerPhoto name={data.name} photoUrl={data.photoUrl} />
        ) : (
          <PlayerPhoto name={data.name} className="size-full text-[calc(var(--token)/3)]" />
        )}
      </div>
      <span className="absolute -top-1 -left-2 rounded-full bg-white px-1.5 py-0.5 text-[10px] leading-none font-semibold text-navy shadow-soft">
        {data.clubTeam}
      </span>
      {data.badge && <CaptainBadgeChip badge={data.badge} className="absolute -top-1 -right-2 h-6 min-w-6 text-[11px]" />}
      {data.unavailable && (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-wide text-white uppercase">
          Unavailable
        </span>
      )}
    </div>
  );
}

function PlayerToken({ data, onClick }: Extract<PitchSlot, { kind: "player" }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${data.name}: options`}
      className="block w-full cursor-pointer rounded-2xl outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-line-yellow active:scale-[0.96]"
    >
      <TokenPhoto data={data} size="var(--token)" />
      <span className="relative mx-auto -mt-2.5 block w-fit max-w-full rounded-2xl bg-navy px-2.5 py-1 text-center shadow-soft ring-1 ring-white/15">
        <span className="block truncate text-[13px] leading-tight font-semibold text-white">{shortName(data.name)}</span>
        <span className="block text-[11px] leading-tight font-medium tabular-nums">
          <span className="text-line-yellow">{formatPrice(data.price)}</span>
          {data.lastPoints != null && <span className="text-white/70"> · {data.lastPoints} pts</span>}
        </span>
      </span>
    </button>
  );
}

function EmptyToken({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full cursor-pointer rounded-2xl outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-line-yellow active:scale-[0.96]"
    >
      <span
        className="mx-auto flex items-center justify-center rounded-full border-[3px] border-dashed border-white/85 bg-navy/45 text-white"
        style={{ width: "var(--token)", height: "var(--token)" }}
      >
        <Plus className="size-7" />
      </span>
      <span className="relative mx-auto -mt-2.5 block w-fit rounded-full bg-navy px-2.5 py-1 text-[12px] font-semibold text-white shadow-soft ring-1 ring-white/15">
        {label}
      </span>
    </button>
  );
}

/** Navy strip above the bottom navigation (100svh: visible even with the browser toolbars showing). */
function BenchStrip({ slot, onAddPlayer }: { slot: PitchSlot; onAddPlayer: () => void }) {
  return (
    <div
      className="pointer-events-auto absolute left-1/2 w-[min(100%-2rem,var(--content-max))] -translate-x-1/2"
      style={{ top: "calc(100svh - var(--nav-height) - env(safe-area-inset-bottom) - 5.75rem)" }}
    >
      <h2 className="absolute -top-3 left-[5.25rem] z-10">
        <NavyPill className="block py-1.5 text-[13px] ring-1 ring-white/20">Bench</NavyPill>
      </h2>
      <button
        type="button"
        onClick={slot.kind === "player" ? slot.onClick : onAddPlayer}
        aria-label={slot.kind === "player" ? `${slot.data.name}: options` : slot.label}
        className="flex h-[4.75rem] w-full cursor-pointer items-center gap-3 rounded-glass bg-navy-glass px-3 pt-1.5 text-left text-white shadow-soft outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-line-yellow active:scale-[0.99]"
      >
        {slot.kind === "player" ? (
          <>
            <TokenPhoto data={slot.data} size="3.5rem" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{slot.data.name}</span>
              <span className="block text-xs text-white/70">
                {slot.data.clubTeam} · <span className="text-line-yellow">{formatPrice(slot.data.price)}</span>
                {slot.data.lastPoints != null && <> · {slot.data.lastPoints} pts</>}
              </span>
            </span>
            <span className="max-w-[7.5rem] shrink-0 text-right text-[11px] leading-snug text-white/70">
              Comes on if a starter doesn&apos;t play
            </span>
          </>
        ) : (
          <>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full border-[3px] border-dashed border-white/85">
              <Plus className="size-6" />
            </span>
            <span className="text-sm font-semibold">{slot.label}</span>
          </>
        )}
      </button>
    </div>
  );
}
