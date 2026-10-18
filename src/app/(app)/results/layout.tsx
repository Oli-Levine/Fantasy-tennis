import { requireResultsEntry } from "@/lib/auth";

/** Results entry is for team captains and admins (the database enforces it too). */
export default async function ResultsLayout({ children }: LayoutProps<"/results">) {
  await requireResultsEntry();
  return children;
}
