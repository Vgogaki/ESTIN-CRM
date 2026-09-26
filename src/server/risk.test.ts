import { describe, expect, it } from "vitest";
import { blocksPayout, canResolve, riskLevel } from "./risk";

const f = (status: "open" | "reviewed" | "dismissed", severity: "low" | "medium" | "high") => ({ status, severity });

describe("riskLevel", () => {
  it("is null with no flags or only resolved ones", () => {
    expect(riskLevel([])).toBeNull();
    expect(riskLevel([f("reviewed", "high"), f("dismissed", "medium")])).toBeNull();
  });
  it("is the highest severity among OPEN flags", () => {
    expect(riskLevel([f("open", "low"), f("open", "medium")])).toBe("medium");
    expect(riskLevel([f("open", "low"), f("open", "high"), f("open", "medium")])).toBe("high");
  });
  it("ignores resolved flags even if they were high", () => {
    expect(riskLevel([f("dismissed", "high"), f("open", "low")])).toBe("low");
  });
});

describe("blocksPayout", () => {
  it("blocks only for an open high flag", () => {
    expect(blocksPayout([f("open", "high")])).toBe(true);
    expect(blocksPayout([f("open", "medium"), f("open", "low")])).toBe(false);
  });
  it("unblocks once the high flag is reviewed or dismissed", () => {
    expect(blocksPayout([f("reviewed", "high")])).toBe(false);
    expect(blocksPayout([f("dismissed", "high")])).toBe(false);
  });
  it("stays blocked while any one high flag is still open", () => {
    expect(blocksPayout([f("dismissed", "high"), f("open", "high")])).toBe(true);
  });
});

describe("canResolve", () => {
  it("only open flags can be resolved", () => {
    expect(canResolve("open")).toBe(true);
    expect(canResolve("reviewed")).toBe(false);
    expect(canResolve("dismissed")).toBe(false);
  });
});
