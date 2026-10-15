import type { Metadata } from "next";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { AdminHeader } from "@/components/app/admin-header";
import { Button } from "@/components/ui/button";
import { devAuthBypass } from "@/lib/env";
import type { Player } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { DEMO_PLAYERS } from "../dev-fixtures";
import { PlayersManager } from "./players-manager";

export const metadata: Metadata = { title: "Players · Admin" };

export default async function AdminPlayersPage() {
  const players = devAuthBypass() ? DEMO_PLAYERS : await loadPlayers();

  return (
    <>
      <AdminHeader
        title="Players"
        subtitle={`${players.length} in the pool`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/players/import">
              <FileUp />
              Import CSV
            </Link>
          </Button>
        }
      />
      <PlayersManager players={players} />
    </>
  );
}

async function loadPlayers(): Promise<Player[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .order("club_team")
    .order("price", { ascending: false })
    .order("name");
  if (error) throw new Error(`Couldn't load players: ${error.message}`);
  return data;
}
