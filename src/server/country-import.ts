/**
 * Bulk country-list upload (module 6.3's Countries page): parses a CSV file
 * into the same allowed/review/blocked rows the one-by-one form produces.
 * Pure and hand-rolled — no CSV library needed for reading a spreadsheet
 * export, matching how finance-report.ts hand-rolls CSV writing.
 *
 * Deliberately upsert-only: a country absent from the file is left exactly
 * as it is. Nothing is ever removed by uploading a file — removing a country
 * from the list stays the explicit, one-at-a-time Remove action.
 */

export type CsvAction = "allowed" | "review" | "blocked";

export type ParsedCountryRow = {
  row: number; // 1-based line in the file, header counted as row 1
  countryCode: string;
  registration: CsvAction;
  purchase: CsvAction;
  trading: CsvAction;
  payout: CsvAction;
  note: string | null;
};

export type CountryCsvError = { row: number; message: string };

export type ParsedCountryCsv = {
  fatalError: string | null;
  valid: ParsedCountryRow[];
  errors: CountryCsvError[];
};

export const MAX_IMPORT_ROWS = 500;

/** A small RFC-4180-ish tokenizer: quoted fields, "" as an escaped quote, CRLF or LF. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const HEADER_ALIASES: Record<string, string[]> = {
  country: ["country", "country_code", "countrycode", "code"],
  registration: ["registration", "reg"],
  purchase: ["purchase"],
  trading: ["trading", "trade"],
  payout: ["payout"],
  note: ["note", "notes"],
};

function findColumn(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.includes(h));
}

function parseAction(raw: string | undefined): CsvAction | "invalid" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return "allowed";
  if (v === "allowed" || v === "review" || v === "blocked") return v;
  return "invalid";
}

export function parseCountryCsv(text: string): ParsedCountryCsv {
  const rows = parseCsvText(text.trim());
  if (rows.length === 0) return { fatalError: "That file is empty.", valid: [], errors: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colCountry = findColumn(header, HEADER_ALIASES.country);
  if (colCountry === -1) {
    return { fatalError: 'No "country" column found. The first row should be a header, e.g. country,registration,purchase,trading,payout,note.', valid: [], errors: [] };
  }
  const colReg = findColumn(header, HEADER_ALIASES.registration);
  const colPurchase = findColumn(header, HEADER_ALIASES.purchase);
  const colTrading = findColumn(header, HEADER_ALIASES.trading);
  const colPayout = findColumn(header, HEADER_ALIASES.payout);
  const colNote = findColumn(header, HEADER_ALIASES.note);

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { fatalError: `That's ${dataRows.length} rows — split it into files of ${MAX_IMPORT_ROWS} or fewer.`, valid: [], errors: [] };
  }

  const seen = new Set<string>();
  const valid: ParsedCountryRow[] = [];
  const errors: CountryCsvError[] = [];

  dataRows.forEach((cells, idx) => {
    const rowNum = idx + 2;
    if (cells.every((c) => c.trim() === "")) return; // a blank line is not an error

    const typedIn = (cells[colCountry] ?? "").trim();
    const code = typedIn.toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      errors.push({ row: rowNum, message: `"${typedIn}" isn't a 2-letter country code.` });
      return;
    }
    if (seen.has(code)) {
      errors.push({ row: rowNum, message: `${code} appears more than once in this file — only the first is used.` });
      return;
    }

    const registration = parseAction(cells[colReg]);
    const purchase = parseAction(cells[colPurchase]);
    const trading = parseAction(cells[colTrading]);
    const payout = parseAction(cells[colPayout]);
    const badFields = (
      [
        ["registration", registration],
        ["purchase", purchase],
        ["trading", trading],
        ["payout", payout],
      ] as const
    )
      .filter(([, v]) => v === "invalid")
      .map(([name]) => name);
    if (badFields.length > 0) {
      errors.push({ row: rowNum, message: `${code}: ${badFields.join(", ")} must be "allowed", "review" or "blocked" (blank means allowed).` });
      return;
    }

    seen.add(code);
    valid.push({
      row: rowNum,
      countryCode: code,
      registration: registration as CsvAction,
      purchase: purchase as CsvAction,
      trading: trading as CsvAction,
      payout: payout as CsvAction,
      note: colNote >= 0 ? cells[colNote]?.trim() || null : null,
    });
  });

  return { fatalError: null, valid, errors };
}
