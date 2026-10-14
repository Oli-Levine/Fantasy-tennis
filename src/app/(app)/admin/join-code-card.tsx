"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setJoinCodeAction, type JoinCodeState } from "./actions";

export function JoinCodeCard({ code }: { code: string }) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: JoinCodeState, formData: FormData) => {
      const next = await setJoinCodeAction(prev, formData);
      if (!next.error) {
        setEditing(false);
        toast.success(`Join code changed to ${next.saved}`);
      }
      return next;
    },
    { error: null },
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the code instead.");
    }
  }

  return (
    <section className="rounded-panel bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gold-soft text-gold-ink">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h2 className="text-base">Club join code</h2>
          <p className="text-xs text-muted-foreground">New members need this after signing in.</p>
        </div>
      </div>

      {editing ? (
        <form action={action} className="mt-4 space-y-3">
          <Label htmlFor="new-code" className="sr-only">
            New join code
          </Label>
          <Input
            id="new-code"
            name="code"
            defaultValue={code}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            aria-invalid={Boolean(state.error)}
            className="font-heading text-lg tracking-[0.15em] uppercase"
          />
          {state.error && (
            <p role="alert" className="text-sm text-primary">
              {state.error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Changing it doesn&apos;t affect people who have already joined.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save code"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex items-center gap-2">
          <code className="flex-1 truncate rounded-xl bg-muted px-4 py-3 font-heading text-xl font-semibold tracking-[0.15em]">
            {code}
          </code>
          <Button variant="soft" size="icon" onClick={copy} aria-label="Copy join code">
            {copied ? <Check /> : <Copy />}
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      )}
    </section>
  );
}
