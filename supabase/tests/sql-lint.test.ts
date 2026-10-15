/**
 * Supabase runs API requests with pg-safeupdate, which rejects any UPDATE or
 * DELETE without a WHERE clause, even inside functions and triggers. PGlite
 * doesn't, so check the SQL files directly.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = (sub: string) => fileURLToPath(new URL(`../${sub}/`, import.meta.url));

/** UPDATE/DELETE statements in `sql` that have no WHERE clause. */
function unguardedWrites(sql: string): string[] {
  const statements = sql
    .replace(/--[^\n]*/g, "") // comments
    .split(";");
  const offenders: string[] = [];
  for (const statement of statements) {
    const match = statement.match(/\b(update\s+[\w.]+\s+(?:\w+\s+)?set\b|delete\s+from\b)/i);
    if (match && !/\bwhere\b/i.test(statement.slice(match.index))) {
      offenders.push(statement.trim().replace(/\s+/g, " ").slice(0, 120));
    }
  }
  return offenders;
}

describe("unguardedWrites", () => {
  it("spots UPDATE/DELETE without WHERE and ignores look-alikes", () => {
    expect(unguardedWrites("update public.t set a = 1;")).toHaveLength(1);
    expect(unguardedWrites("delete from public.t;")).toHaveLength(1);
    expect(unguardedWrites("update public.t g set a = r.b from x r where g.id = r.id;")).toEqual([]);
    expect(unguardedWrites("update public.t set a = 1 where true;")).toEqual([]);
    expect(unguardedWrites("create trigger x after update of deadline on public.t for each statement execute function f();")).toEqual([]);
    expect(unguardedWrites(`create policy "p" on public.t for update to authenticated using (true);`)).toEqual([]);
    expect(unguardedWrites("revoke insert, update, delete on public.t from anon;")).toEqual([]);
  });
});

describe.each(["migrations", "seed"])("SQL in supabase/%s", (sub) => {
  const files = readdirSync(dir(sub)).filter((f) => f.endsWith(".sql"));
  it.each(files)("%s has a WHERE clause on every UPDATE and DELETE", (file) => {
    expect(unguardedWrites(readFileSync(dir(sub) + file, "utf8"))).toEqual([]);
  });
});
