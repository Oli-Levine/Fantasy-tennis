"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISPLAY_NAME_MAX, TEAM_NAME_MAX } from "@/lib/validation";
import { joinClubAction, saveTeamAction, type FormState } from "./actions";

const initial: FormState = { error: null };

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
      {message}
    </p>
  );
}

export function JoinCodeForm() {
  const [state, action, pending] = useActionState(joinClubAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Club join code</Label>
        <Input
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. ACES26"
          defaultValue={state.values?.code}
          aria-invalid={Boolean(state.error)}
          className="font-heading text-lg tracking-[0.2em] uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
        />
      </div>
      <FormError message={state.error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Join the club"}
      </Button>
    </form>
  );
}

export function TeamForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const [state, action, pending] = useActionState(saveTeamAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team_name">Team name</Label>
        <Input
          id="team_name"
          name="team_name"
          required
          autoFocus
          maxLength={TEAM_NAME_MAX}
          placeholder="e.g. Deuce Bigalow"
          defaultValue={state.values?.team_name}
        />
        <p className="text-xs text-muted-foreground">Must be unique. You can change it later.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display_name">Your name</Label>
        <Input
          id="display_name"
          name="display_name"
          required
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          defaultValue={state.values?.display_name ?? defaultDisplayName}
        />
        <p className="text-xs text-muted-foreground">Shown next to your team in the league.</p>
      </div>
      <FormError message={state.error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Create my team"}
      </Button>
    </form>
  );
}
