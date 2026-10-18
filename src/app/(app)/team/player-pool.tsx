"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { PlayerPhoto } from "@/components/app/player-photo";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Player } from "@/lib/database.types";
import { formatPrice } from "@/lib/format";
import { CLUB_TEAMS, clubTeamLabel, playerPhotoUrl } from "@/lib/players";
import { addBlocker, indexOf, type ClubLimit, type Squad } from "@/lib/squad";
import type { PlayerStats } from "@/lib/team-data";
import { cn } from "@/lib/utils";

type Sort = "price-desc" | "price-asc" | "total" | "last";

export function PlayerPool({
  ref,
  players,
  squad,
  budgetLeft,
  clubLimit,
  stats,
  onAdd,
  onRemove,
}: {
  ref?: React.Ref<HTMLElement>;
  players: Player[];
  squad: Squad;
  budgetLeft: number;
  clubLimit: ClubLimit;
  stats: Record<string, PlayerStats>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("price-desc");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const total = (p: Player) => stats[p.id]?.total ?? 0;
    const last = (p: Player) => stats[p.id]?.last ?? 0;
    const compare: Record<Sort, (a: Player, b: Player) => number> = {
      "price-desc": (a, b) => b.price - a.price,
      "price-asc": (a, b) => a.price - b.price,
      total: (a, b) => total(b) - total(a) || b.price - a.price,
      last: (a, b) => last(b) - last(a) || b.price - a.price,
    };
    return players
      .filter((p) => (team == null || p.club_team === team) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => compare[sort](a, b) || a.name.localeCompare(b.name));
  }, [players, query, team, sort, stats]);

  return (
    <section ref={ref} className="scroll-mt-20 space-y-3" aria-labelledby="pool-heading">
      <h2 id="pool-heading" className="px-1 pt-2 text-lg">
        Players
      </h2>

      <div className="grid grid-cols-[1fr_8.5rem] gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            aria-label="Search players"
          />
        </div>
        <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort players">
          <option value="price-desc">Price ↓</option>
          <option value="price-asc">Price ↑</option>
          <option value="total">Total pts</option>
          <option value="last">Last GW pts</option>
        </NativeSelect>
      </div>

      <div className="-mx-gutter flex gap-1.5 overflow-x-auto px-gutter pb-1" role="group" aria-label="Filter by club team">
        {[null, ...CLUB_TEAMS].map((t) => (
          <button
            key={t ?? "all"}
            type="button"
            onClick={() => setTeam(t)}
            aria-pressed={team === t}
            className={cn(
              "h-9 shrink-0 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors",
              team === t ? "bg-ink text-white" : "bg-surface text-muted-foreground shadow-soft",
            )}
          >
            {t == null ? "All" : clubTeamLabel(t)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {players.length === 0 ? "No players have been added yet. Check back soon!" : "No players match."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-panel bg-card shadow-soft">
          {visible.map((p) => {
            const inSquad = indexOf(squad, p.id) >= 0;
            const blocker = inSquad ? null : addBlocker(p, squad, budgetLeft, clubLimit);
            const s = stats[p.id];
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-3 border-b border-border px-4 py-3 last:border-0",
                  inSquad && "bg-primary-soft/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted",
                    blocker && "opacity-50",
                  )}
                >
                  <PlayerPhoto
                    name={p.name}
                    photoUrl={playerPhotoUrl(p.photo_path)}
                    className={p.photo_path ? "" : "w-9 text-xs"}
                  />
                </span>
                <span className={cn("min-w-0 flex-1", blocker && "opacity-50")}>
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">
                    {clubTeamLabel(p.club_team)} · {s?.total ?? 0} pts · last GW {s?.last ?? "–"}
                  </span>
                  {blocker && (
                    <span
                      className={cn(
                        "block text-xs font-medium",
                        blocker.includes("budget") || blocker === "Unavailable" ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {blocker}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatPrice(p.price)}</span>
                {inSquad ? (
                  <button
                    type="button"
                    onClick={() => onRemove(p.id)}
                    aria-label={`Remove ${p.name}`}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition-transform active:scale-90"
                  >
                    <Check className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(p.id)}
                    disabled={Boolean(blocker)}
                    aria-label={blocker ? `${p.name}: ${blocker}` : `Add ${p.name}`}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-primary text-primary transition-transform active:scale-90 disabled:cursor-not-allowed disabled:border-muted-strong disabled:text-muted-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
