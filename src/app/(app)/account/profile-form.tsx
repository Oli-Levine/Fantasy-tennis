"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISPLAY_NAME_MAX, TEAM_NAME_MAX } from "@/lib/validation";
import { updateProfileAction, type ProfileState } from "./actions";

export function ProfileForm({ teamName, displayName }: { teamName: string; displayName: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, { error: null } as ProfileState);

  useEffect(() => {
    if (state.saved) toast.success("Saved");
  }, [state.saved]);

  return (
    <form action={action} className="space-y-4 rounded-panel bg-card p-4 shadow-soft sm:p-5">
      <div className="space-y-2">
        <Label htmlFor="team_name">Team name</Label>
        <Input
          id="team_name"
          name="team_name"
          required
          maxLength={TEAM_NAME_MAX}
          defaultValue={state.values?.team_name ?? teamName}
          aria-invalid={Boolean(state.error)}
        />
        <p className="text-xs text-muted-foreground">Must be unique in the club.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display_name">Your name</Label>
        <Input
          id="display_name"
          name="display_name"
          required
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          defaultValue={state.values?.display_name ?? displayName}
        />
        <p className="text-xs text-muted-foreground">Shown next to your team in the league.</p>
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
