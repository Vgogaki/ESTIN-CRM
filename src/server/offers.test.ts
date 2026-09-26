import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { discountedFee, isPastSendDelay, priceBreakdown } from "./offers";

const { Decimal } = Prisma;
const d = (n: number) => new Decimal(n);

describe("discountedFee", () => {
  it("applies a percent discount", () => {
    expect(discountedFee(d(300), "percent", d(20)).toNumber()).toBe(240);
  });

  it("applies a fixed discount", () => {
    expect(discountedFee(d(300), "fixed", d(50)).toNumber()).toBe(250);
  });

  it("floors a fixed discount at zero rather than going negative", () => {
    expect(discountedFee(d(100), "fixed", d(150)).toNumber()).toBe(0);
  });

  it("a 100% percent discount is free, not negative", () => {
    expect(discountedFee(d(300), "percent", d(100)).toNumber()).toBe(0);
  });

  it("a 0% discount changes nothing", () => {
    expect(discountedFee(d(300), "percent", d(0)).toNumber()).toBe(300);
  });
});

describe("priceBreakdown", () => {
  it("matches the campaign form's preview: 200 at 30% off is 140, giving up 60", () => {
    const r = priceBreakdown(d(200), "percent", d(30));
    expect(r.offerFee.toNumber()).toBe(140);
    expect(r.revenueGivenUp.toNumber()).toBe(60);
  });

  it("gives up the whole fee on a 100% discount", () => {
    expect(priceBreakdown(d(200), "percent", d(100)).revenueGivenUp.toNumber()).toBe(200);
  });

  it("gives up only what the fee actually was when a fixed discount exceeds it", () => {
    expect(priceBreakdown(d(100), "fixed", d(150)).revenueGivenUp.toNumber()).toBe(100);
  });
});

describe("isPastSendDelay", () => {
  const breached = new Date("2026-01-10T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  it("is not past just before the delay elapses", () => {
    expect(isPastSendDelay(breached, 3, new Date(breached.getTime() + 3 * day - 1))).toBe(false);
  });

  it("is past exactly at the delay", () => {
    expect(isPastSendDelay(breached, 3, new Date(breached.getTime() + 3 * day))).toBe(true);
  });

  it("a zero delay means immediately", () => {
    expect(isPastSendDelay(breached, 0, breached)).toBe(true);
  });
});
