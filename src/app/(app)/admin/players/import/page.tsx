import type { Metadata } from "next";
import { AdminHeader } from "@/components/app/admin-header";
import { ImportPlayers } from "./import-players";

export const metadata: Metadata = { title: "Import players · Admin" };

export default function ImportPlayersPage() {
  return (
    <>
      <AdminHeader title="Import players" subtitle="Add or update many players from a CSV file." />
      <ImportPlayers />
    </>
  );
}
