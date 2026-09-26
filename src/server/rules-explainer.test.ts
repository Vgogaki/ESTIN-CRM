import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { explainChallenge, type ExplainableChallenge } from "./rules-explainer";

const d = (v: string) => new Prisma.Decimal(v);

const base: ExplainableChallenge = {
  name: "Two-step 100K",
  accountSize: d("100000"),
  currency: "EUR",
  leverageCap: 30,
  permittedInstruments: ["EURUSD", "XAUUSD"],
  kycTiming: "after_evaluation",
  phases: [
    { order: 1, label: "Evaluation", isFunded: false, profitTargetPct: d("8"), dailyLossPct: d("5"), maxLossPct: d("10"), drawdownType: "trailing", minTradingDays: 4, timeLimitDays: 30, consistencyRule: null, profitSplitPct: null, payoutCycleDays: null, minPayoutAmount: null },
    { order: 2, label: "Funded", isFunded: true, profitTargetPct: null, dailyLossPct: d("5"), maxLossPct: d("10"), drawdownType: "static", minTradingDays: 0, timeLimitDays: null, consistencyRule: null, profitSplitPct: d("80"), payoutCycleDays: 14, minPayoutAmount: d("100") },
  ],
};

const text = (c: ExplainableChallenge) => explainChallenge(c).sections.flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("explainChallenge", () => {
  it("computes limits in money from the percentage and account size", () => {
    const t = text(base);
    expect(t).toContain("Profit target: 8% of the account size (8,000 EUR)");
    expect(t).toContain("Daily loss limit: 5% of the account size (5,000 EUR)");
    expect(t).toContain("(10,000 EUR), trailing");
  });
  it("describes static drawdown differently from trailing", () => {
    expect(text(base)).toContain("static: measured down from the starting account size");
  });
  it("covers the funded stage terms", () => {
    const t = text(base);
    expect(t).toContain("Your profit share is 80%");
    expect(t).toContain("every 14 days");
    expect(t).toContain("minimum payout is 100 EUR");
  });
  it("reflects a configuration change immediately (no stored copy)", () => {
    const changed = { ...base, phases: [{ ...base.phases[0], dailyLossPct: d("4") }, base.phases[1]] };
    expect(text(changed)).toContain("Daily loss limit: 4% of the account size (4,000 EUR)");
  });
  it("says so when there is no time limit or minimum days", () => {
    const t = text({ ...base, phases: [{ ...base.phases[0], timeLimitDays: null, minTradingDays: 0 }] });
    expect(t).toContain("no time limit");
    expect(t).not.toContain("Minimum trading days");
  });
  it("keeps cents when present and states when KYC is needed", () => {
    expect(text({ ...base, accountSize: d("2500.50") })).toContain("2,500.50 EUR");
    expect(text({ ...base, kycTiming: "at_first_payout" })).toContain("before your first payout");
  });
});
