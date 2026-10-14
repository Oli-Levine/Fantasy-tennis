import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "League" };

export default function LeaguePage() {
  return (
    <>
      <PageHeader title="League" subtitle="Club standings, updated when each gameweek is published." />
      <EmptyState
        icon={Trophy}
        title="No standings yet"
        description="The table appears after the first gameweek's points are published."
      />
    </>
  );
}
