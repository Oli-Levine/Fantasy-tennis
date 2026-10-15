"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, fail, ok, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth";
import { parsePlayersCsv } from "@/lib/csv";
import { PHOTO_BUCKET, validatePlayer } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/", "layout");
}

export type PlayerFields = {
  name: string;
  club_team: number;
  price: number;
  is_active: boolean;
};

/** Create (id = null) or update a player. Returns the player's id. */
export async function savePlayer(id: string | null, fields: PlayerFields): Promise<ActionResult<string>> {
  await requireAdmin();
  const values = {
    name: fields.name.trim().replace(/\s+/g, " "),
    club_team: Number(fields.club_team),
    price: Math.round(Number(fields.price) * 10) / 10,
    is_active: Boolean(fields.is_active),
  };
  const problems = validatePlayer(values);
  if (problems.length) return fail(problems[0]);

  const supabase = await createClient();
  const query = id
    ? supabase.from("players").update(values).eq("id", id).select("id").single()
    : supabase.from("players").insert(values).select("id").single();
  const { data, error } = await query;
  if (error || !data) {
    console.error("savePlayer failed", error);
    return fail(describeDbError(error, "That player"));
  }
  refresh();
  return ok(data.id, id ? `${values.name} updated` : `${values.name} added`);
}

/** After the browser uploads a photo, point the player at it and tidy up the old one. */
export async function setPlayerPhoto(id: string, path: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (path && !path.startsWith(`${id}/`)) return fail("That photo doesn't belong to this player.");

  const supabase = await createClient();
  const { data: before } = await supabase.from("players").select("photo_path").eq("id", id).single();
  const { error } = await supabase.from("players").update({ photo_path: path }).eq("id", id);
  if (error) {
    console.error("setPlayerPhoto failed", error);
    return fail(describeDbError(error, "That photo"));
  }
  if (before?.photo_path && before.photo_path !== path) {
    await supabase.storage.from(PHOTO_BUCKET).remove([before.photo_path]);
  }
  refresh();
  return ok(undefined);
}

export async function deletePlayer(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("players").delete().eq("id", id).select("name, photo_path");
  if (error) {
    return fail(
      error.code === "23503"
        ? "This player is in someone's squad or history. Mark them as unavailable instead."
        : describeDbError(error, "That player"),
    );
  }
  const deleted = data?.[0];
  if (!deleted) return fail("That player no longer exists.");
  if (deleted.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([deleted.photo_path]);
  refresh();
  return ok(undefined, `${deleted.name} deleted`);
}

/**
 * Import players from CSV text. Rows whose name matches an existing player
 * (ignoring case) update that player; other rows are added.
 */
export async function importPlayersCsv(
  text: string,
): Promise<ActionResult<{ added: number; updated: number; skipped: number }>> {
  await requireAdmin();
  const { rows, error: parseError } = parsePlayersCsv(text);
  if (parseError) return fail(parseError);
  const valid = rows.flatMap((r) => (r.input ? [r.input] : []));
  if (valid.length === 0) return fail("No valid rows to import.");

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase.from("players").select("id, name");
  if (loadError) return fail(describeDbError(loadError));
  const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p.id]));

  const toInsert = valid.filter((p) => !byName.has(p.name.toLowerCase()));
  const toUpdate = valid.filter((p) => byName.has(p.name.toLowerCase()));

  if (toInsert.length) {
    const { error } = await supabase.from("players").insert(toInsert);
    if (error) {
      console.error("import insert failed", error);
      return fail(describeDbError(error, "A player in the file"));
    }
  }
  for (const p of toUpdate) {
    const { error } = await supabase
      .from("players")
      .update({ club_team: p.club_team, price: p.price, is_active: p.is_active })
      .eq("id", byName.get(p.name.toLowerCase())!);
    if (error) {
      console.error("import update failed", error);
      return fail(`Updated some players, then failed on ${p.name}: ${describeDbError(error)}`);
    }
  }
  refresh();
  return ok(
    { added: toInsert.length, updated: toUpdate.length, skipped: rows.length - valid.length },
    `Imported: ${toInsert.length} added, ${toUpdate.length} updated`,
  );
}
