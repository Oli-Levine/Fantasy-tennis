import { Plus } from "lucide-react";
import { PlayerPhoto } from "@/components/app/player-photo";
import { formatPrice, shortName } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CaptainBadge = "C" | "VC" | "TC";

export type PlayerCardData = {
  name: string;
  clubTeam: string; // "1s" … "6s"
  price: number; // £m
  lastPoints?: number | null;
  photoUrl?: string | null;
  badge?: CaptainBadge | null;
  unavailable?: boolean;
};

/** Wraps a card in a button when it's tappable. */
function Tappable({
  onClick,
  label,
  className,
  children,
}: {
  onClick?: () => void;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!onClick) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "block w-full cursor-pointer rounded-card text-left transition-transform outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.98]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Player tile styled like the reference design. */
export function PlayerCard({
  player,
  className,
  onClick,
}: {
  player: PlayerCardData;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Tappable onClick={onClick} label={`${player.name}: options`} className={cn("min-w-0", className)}>
      <figure className="min-w-0">
        <div className="relative aspect-[5/4] overflow-hidden rounded-card bg-muted">
          {/* soft diagonal highlight, as in the reference */}
          <div aria-hidden="true" className="absolute -right-1/4 -bottom-1/2 size-[130%] rounded-full bg-white/45" />
          <div className="absolute inset-0 flex items-end justify-center">
            {player.photoUrl ? (
              <PlayerPhoto name={player.name} photoUrl={player.photoUrl} />
            ) : (
              <div className="flex size-full items-center justify-center pb-1">
                <PlayerPhoto
                  name={player.name}
                  className="w-[52%] shadow-soft"
                  initialsClassName="text-[clamp(1.1rem,6vw,1.75rem)]"
                />
              </div>
            )}
          </div>

          <span className="absolute top-2.5 left-2.5 rounded-lg bg-surface px-2 py-1 text-[11px] leading-none font-semibold shadow-soft">
            {player.clubTeam}
          </span>

          {player.badge && <CaptainBadgeChip badge={player.badge} />}

          {player.unavailable && (
            <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-primary px-2 py-1 text-[10px] leading-none font-semibold tracking-wide text-white uppercase">
              Unavailable
            </span>
          )}

          {player.lastPoints != null && (
            <span className="absolute right-2.5 bottom-2.5 rounded-lg bg-ink px-2 py-1 text-[11px] leading-none font-semibold text-white tabular-nums">
              {player.lastPoints} pts
            </span>
          )}
        </div>
        <figcaption className="mt-2 flex items-baseline justify-between gap-2 px-1 text-sm">
          <span className="truncate font-medium">{shortName(player.name)}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">{formatPrice(player.price)}</span>
        </figcaption>
      </figure>
    </Tappable>
  );
}

/** A dashed placeholder for an empty squad slot. */
export function EmptySlotCard({
  label,
  onClick,
  bench = false,
}: {
  label: string;
  onClick?: () => void;
  bench?: boolean;
}) {
  return (
    <Tappable onClick={onClick} label={label}>
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-card border-2 border-dashed border-muted-strong text-sm font-medium text-muted-foreground",
          bench ? "h-[5.25rem]" : "aspect-[5/4] flex-col",
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-muted">
          <Plus className="size-5" />
        </span>
        {label}
      </div>
      {!bench && <div className="mt-2 h-5" aria-hidden="true" />}
    </Tappable>
  );
}

function CaptainBadgeChip({ badge }: { badge: CaptainBadge }) {
  const label = { C: "Captain", VC: "Vice-captain", TC: "Triple captain" }[badge];
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "absolute top-2.5 right-2.5 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 font-heading text-xs font-bold shadow-soft",
        badge === "VC" ? "bg-surface text-ink ring-2 ring-gold" : "bg-gold text-ink",
      )}
    >
      {badge}
    </span>
  );
}

/** Wider, visually separate tile for the bench player. */
export function BenchCard({
  player,
  className,
  onClick,
}: {
  player: PlayerCardData;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Tappable onClick={onClick} label={`${player.name}: options`}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-card border-2 border-dashed border-muted-strong bg-surface p-3",
          className,
        )}
      >
        <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {player.photoUrl ? (
            <PlayerPhoto name={player.name} photoUrl={player.photoUrl} />
          ) : (
            <div className="flex size-full items-center justify-center">
              <PlayerPhoto name={player.name} className="w-10 text-sm" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{player.name}</div>
          <div className="text-xs text-muted-foreground">
            {player.clubTeam} · {formatPrice(player.price)}
            {player.lastPoints != null && <> · {player.lastPoints} pts</>}
            {player.unavailable && <span className="font-semibold text-primary"> · Unavailable</span>}
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase">
          Bench
        </span>
      </div>
    </Tappable>
  );
}
