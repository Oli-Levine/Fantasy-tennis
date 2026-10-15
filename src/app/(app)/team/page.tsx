import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { loadTeamData } from "@/lib/team-data";
import { TeamBuilder } from "./team-builder";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { user, profile } = await requireMember();
  const data = await loadTeamData(user.id);

  // Remount the builder whenever the saved squad changes, so it starts from the server's copy.
  const savedKey = data.picks.map((p) => `${p.position}:${p.player_id}:${+p.is_captain}${+p.is_vice_captain}`).join("|");

  return <TeamBuilder key={savedKey} teamName={profile.team_name} {...data} />;
}
