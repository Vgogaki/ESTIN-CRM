import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, parseCountryCsv, parseCsvText } from "./country-import";

describe("parseCsvText", () => {
  it("splits a simple comma-separated file into rows and cells", () => {
    expect(parseCsvText("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles CRLF line endings", () => {
    expect(parseCsvText("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("keeps a comma inside a quoted field", () => {
    expect(parseCsvText('a,"b, c",d\n')).toEqual([["a", "b, c", "d"]]);
  });
  it('unescapes a doubled quote ("") inside a quoted field', () => {
    expect(parseCsvText('x,"She said ""hi"""\n')).toEqual([["x", 'She said "hi"']]);
  });
  it("doesn't invent a phantom row from a trailing newline", () => {
    expect(parseCsvText("a,b\n")).toEqual([["a", "b"]]);
  });
  it("still reads the last row when the file has no trailing newline", () => {
    expect(parseCsvText("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCountryCsv", () => {
  it("parses a well-formed file, defaulting a blank cell to allowed", () => {
    const csv = "country,registration,purchase,trading,payout,note\ncy,review,review,,review,Sanctioned list\nus,,,,,\n";
    const r = parseCountryCsv(csv);
    expect(r.fatalError).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.valid).toEqual([
      { row: 2, countryCode: "CY", registration: "review", purchase: "review", trading: "allowed", payout: "review", note: "Sanctioned list" },
      { row: 3, countryCode: "US", registration: "allowed", purchase: "allowed", trading: "allowed", payout: "allowed", note: null },
    ]);
  });

  it("accepts header aliases and reorders columns freely", () => {
    const csv = "note,code,payout,reg\nx,gb,blocked,allowed\n";
    const r = parseCountryCsv(csv);
    expect(r.valid).toEqual([{ row: 2, countryCode: "GB", registration: "allowed", purchase: "allowed", trading: "allowed", payout: "blocked", note: "x" }]);
  });

  it("fails with a clear message when there's no country column", () => {
    const r = parseCountryCsv("registration,purchase\nreview,review\n");
    expect(r.fatalError).toMatch(/country/i);
    expect(r.valid).toEqual([]);
  });

  it("fails clearly on an empty file", () => {
    expect(parseCountryCsv("").fatalError).toMatch(/empty/i);
    expect(parseCountryCsv("   \n  ").fatalError).toMatch(/empty/i);
  });

  it("rejects a bad country code as a row error, not a fatal one, and keeps parsing", () => {
    const r = parseCountryCsv("country,registration\nxyz,review\ngb,review\n");
    expect(r.fatalError).toBeNull();
    expect(r.errors).toEqual([{ row: 2, message: '"xyz" isn\'t a 2-letter country code.' }]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].countryCode).toBe("GB");
  });

  it("rejects an invalid action word", () => {
    const r = parseCountryCsv("country,registration\ngb,maybe\n");
    expect(r.errors).toEqual([{ row: 2, message: 'GB: registration must be "allowed", "review" or "blocked" (blank means allowed).' }]);
  });

  it("flags a duplicate country and keeps only the first", () => {
    const r = parseCountryCsv("country,registration\ngb,review\ngb,blocked\n");
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].registration).toBe("review");
    expect(r.errors).toEqual([{ row: 3, message: "GB appears more than once in this file — only the first is used." }]);
  });

  it("silently skips a fully blank line", () => {
    const r = parseCountryCsv("country,registration\ngb,review\n,,\n");
    expect(r.valid).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("refuses a file with too many rows", () => {
    const csv = "country,registration\n" + Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => "gb,review").join("\n");
    expect(parseCountryCsv(csv).fatalError).toMatch(/split/i);
  });

  it("is case-insensitive on both the header and the action words", () => {
    const r = parseCountryCsv("COUNTRY,REGISTRATION\nGB,REVIEW\n");
    expect(r.valid[0]).toMatchObject({ countryCode: "GB", registration: "review" });
  });
});
