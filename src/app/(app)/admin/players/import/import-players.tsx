"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLAYERS_CSV_TEMPLATE, parsePlayersCsv } from "@/lib/csv";
import { formatPrice } from "@/lib/format";
import { clubTeamLabel } from "@/lib/players";
import { cn } from "@/lib/utils";
import { importPlayersCsv } from "../actions";

export function ImportPlayers() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? parsePlayersCsv(text) : null), [text]);
  const validCount = parsed?.rows.filter((r) => r.input).length ?? 0;
  const badCount = (parsed?.rows.length ?? 0) - validCount;

  async function readFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
    if (fileInput.current) fileInput.current.value = "";
  }

  function runImport() {
    startTransition(async () => {
      const result = await importPlayersCsv(text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.push("/admin/players");
    });
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(PLAYERS_CSV_TEMPLATE)}`;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-panel bg-card p-5 shadow-soft">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Columns: <strong className="text-foreground">name, team, price</strong> and optionally{" "}
          <strong className="text-foreground">active</strong> (yes/no). Teams can be written <em>1</em> or{" "}
          <em>1s</em>; prices like <em>8.5</em> or <em>£8.5m</em>. A player whose name already exists is updated
          instead of added.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <FileUp />
            Choose CSV file
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={templateHref} download="players-template.csv">
              <Download />
              Template
            </a>
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => readFile(e.target.files?.[0])}
        />
        <div className="space-y-2">
          <Label htmlFor="csv-text">…or paste it here</Label>
          <Textarea
            id="csv-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLAYERS_CSV_TEMPLATE}
            rows={6}
            spellCheck={false}
            className="font-mono text-sm"
          />
        </div>
      </section>

      {parsed?.error && (
        <p role="alert" className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
          {parsed.error}
        </p>
      )}

      {parsed && parsed.rows.length > 0 && (
        <section className="rounded-panel bg-card shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base">Preview</h2>
              <p className="text-xs text-muted-foreground">
                {validCount} ready{badCount > 0 && <span className="text-primary"> · {badCount} with problems (skipped)</span>}
              </p>
            </div>
            <Button onClick={runImport} disabled={pending || validCount === 0}>
              {pending ? "Importing…" : `Import ${validCount}`}
            </Button>
          </div>
          <ul>
            {parsed.rows.map((row) => (
              <li key={row.line} className="flex gap-3 border-b border-border px-5 py-3 last:border-0">
                {row.input ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate font-medium", !row.input && "text-muted-foreground")}>
                      {row.raw.name || <em>No name</em>}
                    </span>
                    {row.input && (
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {clubTeamLabel(row.input.club_team)} · {formatPrice(row.input.price)}
                        {!row.input.is_active && " · unavailable"}
                      </span>
                    )}
                  </div>
                  {row.problems.map((p) => (
                    <p key={p} className="text-xs text-primary">
                      Line {row.line}: {p}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button asChild variant="ghost" className="w-full">
        <Link href="/admin/players">Back to players</Link>
      </Button>
    </div>
  );
}
