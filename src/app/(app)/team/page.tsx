import type { Metadata } from "next";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" subtitle="Pick 4 starters and 1 bench player within £35.0m." />
      <EmptyState
        icon={Users}
        title="Squad picking is coming soon"
        description="Once players are added you'll build your squad, choose a captain and play chips here."
      />
    </>
  );
}
