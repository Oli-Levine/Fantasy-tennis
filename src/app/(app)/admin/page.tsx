import type { Metadata } from "next";
import { Shield } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Admin" subtitle="Players, scoring rules, gameweeks and users." />
      <EmptyState
        icon={Shield}
        title="Admin tools are coming soon"
        description="Admin access is locked down in the database in the next phase."
      />
    </>
  );
}
