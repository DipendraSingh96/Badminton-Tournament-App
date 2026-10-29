// Reading entries from a spreadsheet: a CSV file, or rows pasted from one
// (tab separated). Columns are found by their heading: Category, Name (or
// Team), Player 1…n, External, Seed. Without a heading row, the columns are
// taken as Name, then players. Anything that can't be read is reported, never
// guessed.

/** Rows of cells from CSV or pasted text; quotes may hold commas, tabs, quotes ("") and line breaks. */
export function parseDelimited(text: string): string[][] {
  const delimiter = text.split(/\r?\n/, 1)[0]!.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

export interface ImportedEntry {
  categoryId: string;
  name: string;
  players: string[];
  external: boolean;
  seed: number | null;
}

const YES = new Set(["yes", "y", "true", "1", "external", "x"]);

/**
 * Entries from rows. With one category, a Category column is optional; with
 * several, each row names its category (by its name, ignoring case).
 */
export function entriesFromRows(
  rows: string[][],
  categories: { id: string; name: string }[],
): { entries: ImportedEntry[]; problems: string[] } {
  const entries: ImportedEntry[] = [];
  const problems: string[] = [];
  if (rows.length === 0) return { entries, problems };

  const heading = rows[0]!.map((c) => c.toLowerCase());
  const hasHeading = heading.some((c) => /^(category|name|team|pair|external|seed|player\s*\d*)$/.test(c));
  const column = (test: RegExp) => (hasHeading ? heading.findIndex((c) => test.test(c)) : -1);
  const categoryCol = column(/^category$/);
  const nameCol = hasHeading ? column(/^(name|team|pair)$/) : 0;
  const externalCol = column(/^external$/);
  const seedCol = column(/^seed$/);
  const playerCols = hasHeading
    ? heading.flatMap((c, i) => (/^player\s*\d*$/.test(c) ? [i] : []))
    : rows[0]!.map((_, i) => i).slice(1);

  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
  (hasHeading ? rows.slice(1) : rows).forEach((row, i) => {
    const line = i + (hasHeading ? 2 : 1);
    let categoryId = categories.length === 1 ? categories[0]!.id : null;
    if (categoryCol !== -1 && row[categoryCol]) {
      categoryId = byName.get(row[categoryCol]!.toLowerCase()) ?? null;
      if (!categoryId) {
        problems.push(`Row ${line}: no category called "${row[categoryCol]}"`);
        return;
      }
    }
    if (!categoryId) {
      problems.push(`Row ${line}: say which category it's in`);
      return;
    }
    const players = playerCols.map((c) => row[c] ?? "").filter(Boolean);
    const name = nameCol === -1 ? "" : (row[nameCol] ?? "");
    if (!name && players.length === 0) {
      problems.push(`Row ${line}: no name or players`);
      return;
    }
    const seedText = seedCol === -1 ? "" : (row[seedCol] ?? "");
    const seed = seedText === "" ? null : Number(seedText);
    if (seed !== null && (!Number.isInteger(seed) || seed < 1)) {
      problems.push(`Row ${line}: the seed "${seedText}" isn't a whole number from 1`);
      return;
    }
    entries.push({
      categoryId,
      name,
      players,
      external: externalCol !== -1 && YES.has((row[externalCol] ?? "").toLowerCase()),
      seed,
    });
  });
  return { entries, problems };
}
