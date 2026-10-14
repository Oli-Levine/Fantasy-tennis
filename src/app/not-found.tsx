import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-content items-center px-gutter">
      <EmptyState
        className="w-full"
        icon={SearchX}
        title="Page not found"
        description="That page doesn't exist."
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    </main>
  );
}
