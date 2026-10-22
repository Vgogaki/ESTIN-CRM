import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { convertAmount, converterTo, RateUnavailable, usdPer } from "./fx";
import { isMarketOpen, minutesIntoWeek, nextOpen } from "./market-hours";
import { DEFAULT_INSTRUMENTS, lotProblem, specFrom } from "./instruments";

const d = (v: string | number) => new Prisma.Decimal(v);

describe("usdPer", () => {
  it("is 1 for USD", () => {
    expect(usdPer("USD", {}).toString()).toBe("1");
  });
  it("reads a CCYUSD pair directly, and inverts a USDCCY pair", () => {
    expect(usdPer("EUR", { EURUSD: d("1.25") }).toString()).toBe("1.25");
    expect(usdPer("JPY", { USDJPY: d("160") }).toString()).toBe("0.00625");
  });
  it("throws, rather than guessing, when no pair is available", () => {
    expect(() => usdPer("CHF", { EURUSD: d("1.1") })).toThrow(RateUnavailable);
    expect(() => usdPer("EUR", { EURUSD: d("0") })).toThrow(RateUnavailable);
  });
});

describe("convertAmount", () => {
  const mids = { EURUSD: d("1.25"), GBPUSD: d("1.5"), USDJPY: d("150") };
  it("does nothing between the same currency", () => {
    expect(convertAmount(d("123.45"), "EUR", "EUR", {}).toString()).toBe("123.45");
  });
  it("converts via dollars: 1,000 USD = 800 EUR; 15,000 JPY = 100 USD = 80 EUR; 100 GBP = 150 USD = 120 EUR", () => {
    expect(convertAmount(d("1000"), "USD", "EUR", mids).toString()).toBe("800");
    expect(convertAmount(d("15000"), "JPY", "EUR", mids).toString()).toBe("80");
    expect(convertAmount(d("100"), "GBP", "EUR", mids).toString()).toBe("120");
  });
  it("converts the other way round", () => {
    expect(convertAmount(d("80"), "EUR", "USD", mids).toString()).toBe("100");
  });
  it("converterTo binds the account currency and the prices", () => {
    expect(converterTo("EUR", mids)(d("1000"), "USD").toString()).toBe("800");
  });
  it("fails loudly if a needed rate is missing", () => {
    expect(() => convertAmount(d("1"), "CHF", "EUR", mids)).toThrow(/No current exchange rate for CHF/);
  });
});

describe("market hours (a Thursday is 2026-10-22; Friday the 23rd; Saturday the 24th; Sunday the 25th)", () => {
  const fx = DEFAULT_INSTRUMENTS.find((i) => i.symbol === "EURUSD")!.sessions;
  const uk = DEFAULT_INSTRUMENTS.find((i) => i.symbol === "UK100")!.sessions;

  it("counts minutes from Sunday 00:00 UTC", () => {
    expect(minutesIntoWeek(new Date("2026-10-25T00:00:00Z"))).toBe(0);
    expect(minutesIntoWeek(new Date("2026-10-26T01:30:00Z"))).toBe(1440 + 90);
  });
  it("forex is open mid-week, closed from Friday 21:00 until Sunday 22:00", () => {
    expect(isMarketOpen(fx, new Date("2026-10-22T12:00:00Z"))).toBe(true);
    expect(isMarketOpen(fx, new Date("2026-10-23T20:59:00Z"))).toBe(true);
    expect(isMarketOpen(fx, new Date("2026-10-23T21:00:00Z"))).toBe(false);
    expect(isMarketOpen(fx, new Date("2026-10-24T12:00:00Z"))).toBe(false);
    expect(isMarketOpen(fx, new Date("2026-10-25T21:59:00Z"))).toBe(false);
    expect(isMarketOpen(fx, new Date("2026-10-25T22:00:00Z"))).toBe(true);
  });
  it("the FTSE 100 has shorter weekday hours", () => {
    expect(isMarketOpen(uk, new Date("2026-10-22T06:59:00Z"))).toBe(false);
    expect(isMarketOpen(uk, new Date("2026-10-22T07:00:00Z"))).toBe(true);
    expect(isMarketOpen(uk, new Date("2026-10-22T21:00:00Z"))).toBe(false);
    expect(isMarketOpen(uk, new Date("2026-10-25T12:00:00Z"))).toBe(false); // Sunday
  });
  it("no schedule means closed", () => {
    expect(isMarketOpen([], new Date("2026-10-22T12:00:00Z"))).toBe(false);
  });
  it("finds when a closed market next opens", () => {
    expect(nextOpen(fx, new Date("2026-10-24T12:00:00Z"))?.toISOString()).toBe("2026-10-25T22:00:00.000Z");
    expect(nextOpen(uk, new Date("2026-10-23T22:00:00Z"))?.toISOString()).toBe("2026-10-26T07:00:00.000Z");
    expect(nextOpen(fx, new Date("2026-10-22T12:00:00Z"))?.toISOString()).toBe("2026-10-22T12:00:00.000Z"); // already open
    expect(nextOpen([], new Date())).toBeNull();
  });
});

describe("lot sizes", () => {
  const s = specFrom(DEFAULT_INSTRUMENTS.find((i) => i.symbol === "EURUSD")!);
  it("accepts a size within limits and on the step", () => {
    expect(lotProblem(s, d("0.01"))).toBeNull();
    expect(lotProblem(s, d("1.37"))).toBeNull();
    expect(lotProblem(s, d("50"))).toBeNull();
  });
  it("explains what is wrong otherwise", () => {
    expect(lotProblem(s, d("0.009"))).toMatch(/smallest/);
    expect(lotProblem(s, d("50.01"))).toMatch(/largest/);
    expect(lotProblem(s, d("1.005"))).toMatch(/steps of/);
  });
  it("an index with a 0.1 step", () => {
    const i = specFrom(DEFAULT_INSTRUMENTS.find((x) => x.symbol === "US30")!);
    expect(lotProblem(i, d("0.3"))).toBeNull();
    expect(lotProblem(i, d("0.25"))).toMatch(/steps of/);
  });
});
