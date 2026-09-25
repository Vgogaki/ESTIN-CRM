import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateAvailableProfit, calculatePayoutAmount } from "./withdrawals";

const { Decimal } = Prisma;
const d = (n: number) => new Decimal(n);

describe("calculateAvailableProfit", () => {
  it("is the full pnl when nothing is reserved", () => {
    const r = calculateAvailableProfit({ equity: d(55000), accountSize: d(50000), reservedAmount: d(0) });
    expect(r.toNumber()).toBe(5000);
  });

  it("floors at zero when equity is below account size (no profit yet)", () => {
    const r = calculateAvailableProfit({ equity: d(48000), accountSize: d(50000), reservedAmount: d(0) });
    expect(r.toNumber()).toBe(0);
  });

  it("subtracts amounts already reserved by pending/approved/paid withdrawals", () => {
    const r = calculateAvailableProfit({ equity: d(55000), accountSize: d(50000), reservedAmount: d(3000) });
    expect(r.toNumber()).toBe(2000);
  });

  it("floors at zero rather than going negative when reserved exceeds current profit", () => {
    // e.g. equity dropped after a withdrawal was already approved against a higher equity.
    const r = calculateAvailableProfit({ equity: d(52000), accountSize: d(50000), reservedAmount: d(5000) });
    expect(r.toNumber()).toBe(0);
  });

  it("is exactly zero at the account size, not negative", () => {
    const r = calculateAvailableProfit({ equity: d(50000), accountSize: d(50000), reservedAmount: d(0) });
    expect(r.toNumber()).toBe(0);
  });
});

describe("calculatePayoutAmount", () => {
  it("applies the split percentage to available profit", () => {
    expect(calculatePayoutAmount(d(5000), d(80)).toNumber()).toBe(4000);
  });

  it("is zero when available profit is zero", () => {
    expect(calculatePayoutAmount(d(0), d(80)).toNumber()).toBe(0);
  });

  it("handles a 100% split", () => {
    expect(calculatePayoutAmount(d(1234.56), d(100)).toNumber()).toBe(1234.56);
  });

  it("keeps cent precision on an uneven split", () => {
    expect(calculatePayoutAmount(d(1000), d(33)).toNumber()).toBe(330);
  });
});
