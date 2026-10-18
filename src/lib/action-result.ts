export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

export const ok = <T,>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

type DbError = { code?: string; message?: string } | null | undefined;

/** Turns a Postgres/Supabase error into a sentence for the admin. */
export function describeDbError(error: DbError, what = "That"): string {
  switch (error?.code) {
    case "23505":
      return `${what} already exists.`;
    case "23503":
      return error.message?.startsWith("Gameweek")
        ? error.message
        : `${what} is still used elsewhere (e.g. in a squad or results), so it can't be deleted.`;
    case "23514":
    case "22023":
      return error.message && !error.message.includes("violates") ? error.message : `${what} has an invalid value.`;
    case "42501":
      // Our own explanations (e.g. "Only team captains and admins…"); RLS messages stay generic.
      return error.message && /^(Only|Gameweek) /.test(error.message) ? error.message : "Only admins can do that.";
    case "PGRST202":
      return "The database is missing an update. Re-run the latest file in supabase/migrations in the Supabase SQL Editor.";
    default:
      // Include the database's own words so problems can be diagnosed.
      return error?.message
        ? `Something went wrong: ${error.message}`
        : "Something went wrong. Please try again.";
  }
}
