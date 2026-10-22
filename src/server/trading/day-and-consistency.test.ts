import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { isNewTradingDay, needsRollover, rolloverValues, sameUtcDay, utcDay } from "./day";
import { checkBestDay, dailyNetProfits, parseConsistencyRule } from "./consistency";

const d = (v: string | number) => new Prisma.Decimal(v);

describe("the UTC trading day", () => {
  it("starts at midnight UTC", () => {
    expect(utcDay(new Date("2026-10-20T00:00:00Z")).toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(utcDay(new Date("2026-10-20T23:59:59.999Z")).toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(utcDay(new Date("2026-10-21T00:00:00Z")).toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });
  it("compares days, ignoring the time of day", () => {
    expect(sameUtcDay(new Date("2026-10-20T01:00:00Z"), new Date("2026-10-20T23:00:00Z"))).toBe(true);
    expect(sameUtcDay(new Date("2026-10-20T23:59:59Z"), new Date("2026-10-21T00:00:00Z"))).toBe(false);
    expect(sameUtcDay(null, new Date())).toBe(false);
  });
  it("a reset is due when it has never run, or last ran on an earlier day, not twice in one day", () => {
    const now = new Date("2026-10-21T00:00:05Z");
    expect(needsRollover(null, now)).toBe(true);
    expect(needsRollover(new Date("2026-10-20T00:00:00Z"), now)).toBe(true);
    expect(needsRollover(new Date("2026-10-21T00:00:00Z"), now)).toBe(false);
    expect(needsRollover(new Date("2026-10-21T00:00:00Z"), new Date("2026-10-21T23:59:59Z"))).toBe(false);
  });
  it("a trade closed on a new UTC day is a new trading day; the second close the same day is not", () => {
    expect(isNewTradingDay(null, new Date("2026-10-20T10:00:00Z"))).toBe(true);
    expect(isNewTradingDay(new Date("2026-10-20T00:00:00Z"), new Date("2026-10-20T22:30:00Z"))).toBe(false);
    expect(isNewTradingDay(new Date("2026-10-20T00:00:00Z"), new Date("2026-10-21T00:00:01Z"))).toBe(true);
  });
});

describe("the daily reset", () => {
  it("starts the new day from the last equity, and raises the high-water mark only to the end-of-day equity", () => {
    expect(rolloverValues({ equity: d("101000"), peakEquity: d("100000") })).toEqual({ dayStartEquity: d("101000"), peakEquity: d("101000") });
  });
  it("never lowers the high-water mark after a losing day", () => {
    const r = rolloverValues({ equity: d("99500"), peakEquity: d("102000") });
    expect(r.dayStartEquity.toString()).toBe("99500");
    expect(r.peakEquity.toString()).toBe("102000");
  });
});

describe("the best-day consistency rule", () => {
  const rule = { maxPct: d("50") };

  it("reads the stored form, and refuses anything else", () => {
    expect(parseConsistencyRule({ type: "best_day", maxPct: 50 })?.maxPct.toString()).toBe("50");
    expect(parseConsistencyRule({ type: "best_day", maxPct: "40" })?.maxPct.toString()).toBe("40");
    expect(parseConsistencyRule(null)).toBeNull();
    expect(parseConsistencyRule({ type: "other", maxPct: 50 })).toBeNull();
    expect(parseConsistencyRule({ type: "best_day", maxPct: 0 })).toBeNull();
    expect(parseConsistencyRule({ type: "best_day", maxPct: 150 })).toBeNull();
    expect(parseConsistencyRule({ type: "best_day" })).toBeNull();
    expect(parseConsistencyRule({ type: "best_day", maxPct: "abc" })).toBeNull();
  });
  it("passes when profit is spread out", () => {
    const c = checkBestDay([d("300"), d("300"), d("400")], rule); // best 400 of 1000 = 40%
    expect(c.ok).toBe(true);
    expect(c.pct?.toString()).toBe("40");
  });
  it("fails when one day is more than the limit of the profit", () => {
    const c = checkBestDay([d("100"), d("100"), d("800")], rule); // 80%
    expect(c.ok).toBe(false);
    expect(c.bestDay.toString()).toBe("800");
    expect(c.totalPositive.toString()).toBe("1000");
  });
  it("is allowed exactly at the limit", () => {
    expect(checkBestDay([d("500"), d("500")], rule).ok).toBe(true); // 50%
    expect(checkBestDay([d("501"), d("499")], rule).ok).toBe(false); // 50.1%
  });
  it("losing days don't count towards the total", () => {
    // profitable days 400 + 600; the -300 day is ignored: best 600 / 1000 = 60%
    expect(checkBestDay([d("400"), d("-300"), d("600")], rule).ok).toBe(false);
  });
  it("a single profitable day is 100%", () => {
    expect(checkBestDay([d("250")], rule).ok).toBe(false);
  });
  it("no profit at all is not an inconsistency", () => {
    expect(checkBestDay([], rule)).toMatchObject({ ok: true, pct: null });
    expect(checkBestDay([d("-100"), d("0")], rule).ok).toBe(true);
  });
  it("adds up trades within a UTC day, after commission", () => {
    const days = dailyNetProfits([
      { closedAt: new Date("2026-10-20T10:00:00Z"), netPnl: d("100") },
      { closedAt: new Date("2026-10-20T23:59:00Z"), netPnl: d("-30") },
      { closedAt: new Date("2026-10-21T00:00:00Z"), netPnl: d("50") },
    ]);
    expect(days.get("2026-10-20")?.toString()).toBe("70");
    expect(days.get("2026-10-21")?.toString()).toBe("50");
    expect(days.size).toBe(2);
  });
});
