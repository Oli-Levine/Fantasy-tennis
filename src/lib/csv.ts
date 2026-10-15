import { parseActive, parseClubTeam, parsePrice, validatePlayer, type PlayerInput } from "@/lib/players";

/** Minimal RFC 4180 CSV parser: commas or semicolons, quoted fields, CRLF. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = !firstLine.includes(",") && firstLine.includes(";") ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type CsvPlayerRow = {
  line: number; // 1-based line in the file
  input: PlayerInput | null;
  raw: Record<"name" | "team" | "price" | "active", string>;
  problems: string[];
};

const HEADER_ALIASES: Record<keyof CsvPlayerRow["raw"], string[]> = {
  name: ["name", "player", "player name", "full name"],
  team: ["team", "club team", "club_team", "squad"],
  price: ["price", "cost", "value", "price (£m)", "price £m"],
  active: ["active", "available", "status", "is_active"],
};

/**
 * Parses a players CSV. The first row may be a header (name, team, price,
 * active — any order); without one, columns are taken in that order.
 */
export function parsePlayersCsv(text: string): { rows: CsvPlayerRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], error: "The file is empty." };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const index: Record<keyof CsvPlayerRow["raw"], number> = { name: -1, team: -1, price: -1, active: -1 };
  for (const key of Object.keys(index) as (keyof typeof index)[]) {
    index[key] = header.findIndex((h) => HEADER_ALIASES[key].includes(h));
  }
  const hasHeader = index.name >= 0;
  if (hasHeader && (index.team < 0 || index.price < 0)) {
    return { rows: [], error: "The header needs name, team and price columns." };
  }
  if (!hasHeader) Object.assign(index, { name: 0, team: 1, price: 2, active: 3 });

  const body = hasHeader ? table.slice(1) : table;
  const rows = body.map((cells, i): CsvPlayerRow => {
    const cell = (k: keyof typeof index) => (index[k] >= 0 ? (cells[index[k]] ?? "").trim() : "");
    const raw = { name: cell("name"), team: cell("team"), price: cell("price"), active: cell("active") };
    const club_team = parseClubTeam(raw.team);
    const price = parsePrice(raw.price);
    const is_active = parseActive(raw.active);
    const name = raw.name.replace(/\s+/g, " ");
    const problems = validatePlayer({ name, club_team, price });
    if (is_active === null) problems.push(`Active should be yes or no, not “${raw.active}”.`);
    return {
      line: i + (hasHeader ? 2 : 1),
      raw,
      problems,
      input: problems.length === 0 ? { name, club_team: club_team!, price: price!, is_active: is_active! } : null,
    };
  });

  // Duplicate names inside the file.
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = row.raw.name.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      row.problems.push(`Same name as line ${seen.get(key)}.`);
      row.input = null;
    } else {
      seen.set(key, row.line);
    }
  }
  return { rows, error: rows.length === 0 ? "No players found under the header." : null };
}

export const PLAYERS_CSV_TEMPLATE = "name,team,price,active\nAva Thornton,1s,12.5,yes\nSam Lee,6s,3.0,yes\n";
