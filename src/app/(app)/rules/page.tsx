import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Rules" };

export default function RulesPage() {
  return (
    <>
      <PageHeader title="Rules" subtitle="How the game, transfers, chips and scoring work." />
      <EmptyState
        icon={BookOpen}
        title="Rules are on their way"
        description="The full guide and the live scoring table will appear here."
      />
    </>
  );
}
