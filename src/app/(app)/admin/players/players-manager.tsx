"use client";

import { useMemo, useState } from "react";
import { Plus, Search, UserRound } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PlayerPhoto } from "@/components/app/player-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Player } from "@/lib/database.types";
import { formatPrice } from "@/lib/format";
import { CLUB_TEAMS, MAX_PLAYERS, clubTeamLabel, playerPhotoUrl } from "@/lib/players";
import { cn } from "@/lib/utils";
import { PlayerFormDialog } from "./player-form-dialog";

export function PlayersManager({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<number | null>(null);
  const [editing, setEditing] = useState<Player | "new" | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => (team == null || p.club_team === team) && (!q || p.name.toLowerCase().includes(q)));
  }, [players, query, team]);

  return (
    <div className="space-y-3">
      {players.length > MAX_PLAYERS && (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">
          There are {players.length} players. The game is designed for up to {MAX_PLAYERS}.
        </p>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search players"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            aria-label="Search players"
          />
        </div>
        <Button size="icon" className="size-12 rounded-xl" onClick={() => setEditing("new")} aria-label="Add player">
          <Plus className="size-5" />
        </Button>
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

      {players.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No players yet"
          description="Add players one by one, or import them all at once from a CSV file."
          action={<Button onClick={() => setEditing("new")}>Add a player</Button>}
        />
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No players match.</p>
      ) : (
        <ul className="overflow-hidden rounded-panel bg-card shadow-soft">
          {visible.map((p) => (
            <li key={p.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
              >
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  <PlayerPhoto name={p.name} photoUrl={playerPhotoUrl(p.photo_path)} className={p.photo_path ? "" : "w-9 text-xs"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", !p.is_active && "text-muted-foreground line-through")}>
                    {p.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {clubTeamLabel(p.club_team)}
                    {!p.is_active && <Tag tone="danger">Unavailable</Tag>}
                    {p.is_test_data && <Tag>Test</Tag>}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatPrice(p.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PlayerFormDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        player={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "danger" }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        tone === "danger" ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
