import type { Metadata } from "next";
import { addDays } from "date-fns";
import { AdminHeader } from "@/components/app/admin-header";
import type { Gameweek } from "@/lib/database.types";
import { devAuthBypass } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { nextDeadline, toLondonDateInputValue } from "@/lib/time";
import { DEMO_GAMEWEEKS } from "@/lib/dev-fixtures";
import { GameweeksManager } from "./gameweeks-manager";

export const metadata: Metadata = { title: "Gameweeks · Admin" };

export default async function AdminGameweeksPage() {
  const gameweeks = devAuthBypass() ? DEMO_GAMEWEEKS : await loadGameweeks();

  // Suggest continuing straight after the last deadline (or from next Tuesday).
  const last = gameweeks.at(-1);
  const suggestedStart = toLondonDateInputValue(
    last ? addDays(new Date(last.deadline), 7) : nextDeadline(new Date()),
  );

  return (
    <>
      <AdminHeader title="Gameweeks" subtitle="Weekly deadlines: Tuesdays at 21:00 UK time." />
      <GameweeksManager gameweeks={gameweeks} suggestedStart={suggestedStart} now={new Date().toISOString()} />
    </>
  );
}

async function loadGameweeks(): Promise<Gameweek[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("gameweeks").select("*").order("deadline");
  if (error) throw new Error(`Couldn't load gameweeks: ${error.message}`);
  return data;
}
