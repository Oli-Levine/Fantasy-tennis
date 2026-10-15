"use client";

import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteTestDataAction } from "./actions";

export function TestDataCard({ counts }: { counts: { players: number; scoring_rules: number; managers: number } }) {
  const router = useRouter();
  const summary = `${counts.players} players, ${counts.scoring_rules} scoring rules and ${counts.managers} managers`;

  return (
    <section className="flex items-start gap-3 rounded-panel border-2 border-dashed border-muted-strong bg-surface p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <FlaskConical className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base">Fake test data</h2>
        <p className="mt-1 text-sm text-muted-foreground">{summary} are fake. Delete them before the real season starts.</p>
        <ConfirmDialog
          title="Delete all fake test data?"
          description={`This removes ${summary}. Your real players, rules, managers and gameweeks stay. Anyone who picked a fake player loses that pick.`}
          confirmLabel="Delete test data"
          destructive
          onConfirm={async () => {
            const result = await deleteTestDataAction();
            if (!result.ok) return void toast.error(result.message);
            toast.success(result.message);
            router.refresh();
          }}
          trigger={(open) => (
            <Button variant="outline" size="sm" className="mt-3 text-destructive" onClick={open}>
              Delete test data
            </Button>
          )}
        />
      </div>
    </section>
  );
}
