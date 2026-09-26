import { Prisma } from "@prisma/client";

type D = Prisma.Decimal;

export type ExplainableChallenge = {
  name: string;
  accountSize: D;
  currency: string;
  leverageCap: number;
  permittedInstruments: string[];
  kycTiming: "at_creation" | "after_evaluation" | "at_first_payout";
  phases: {
    order: number;
    label: string;
    isFunded: boolean;
    profitTargetPct: D | null;
    dailyLossPct: D;
    maxLossPct: D;
    drawdownType: "trailing" | "static";
    minTradingDays: number;
    timeLimitDays: number | null;
    consistencyRule: unknown | null;
    profitSplitPct: D | null;
    payoutCycleDays: number | null;
    minPayoutAmount: D | null;
  }[];
};

/** Money with thousands separators, no floating point. */
function money(amount: D, currency: string): string {
  const [int, frac] = amount.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}${frac === "00" ? "" : "." + frac} ${currency}`;
}

const pct = (v: D) => `${v.toString()}%`;
const of = (size: D, p: D) => size.mul(p).div(100);

const KYC_TEXT = {
  at_creation: "Identity verification (KYC) is required before your account is created.",
  after_evaluation: "Identity verification (KYC) is required after you pass the evaluation, before you are funded.",
  at_first_payout: "Identity verification (KYC) is required before your first payout.",
} as const;

/**
 * Plain-language rules for a challenge, generated from its live configuration
 * (module 7.5: "rules explanations should be generated from challenge type
 * configuration, so they never contradict the actual rules"). Pure: nothing is
 * stored, so editing a challenge type changes the explanation the moment it goes live.
 * It states the mechanics only; it never promises outcomes.
 */
export function explainChallenge(c: ExplainableChallenge): { heading: string; intro: string; sections: { title: string; lines: string[] }[] } {
  const phases = [...c.phases].sort((a, b) => a.order - b.order);
  const sections: { title: string; lines: string[] }[] = [];

  for (const p of phases) {
    const lines: string[] = [];
    if (p.isFunded) {
      lines.push("This is the funded stage: the account is still simulated, and you receive a share of simulated profits as real payouts.");
      if (p.profitSplitPct) lines.push(`Your profit share is ${pct(p.profitSplitPct)}.`);
      if (p.payoutCycleDays) lines.push(`You can request a payout every ${p.payoutCycleDays} days.`);
      if (p.minPayoutAmount) lines.push(`The minimum payout is ${money(p.minPayoutAmount, c.currency)}.`);
    } else if (p.profitTargetPct) {
      lines.push(`Profit target: ${pct(p.profitTargetPct)} of the account size (${money(of(c.accountSize, p.profitTargetPct), c.currency)}).`);
    }
    lines.push(`Daily loss limit: ${pct(p.dailyLossPct)} of the account size (${money(of(c.accountSize, p.dailyLossPct), c.currency)}), measured from your equity at the start of the trading day.`);
    lines.push(
      p.drawdownType === "trailing"
        ? `Maximum loss limit: ${pct(p.maxLossPct)} of the account size (${money(of(c.accountSize, p.maxLossPct), c.currency)}), trailing: measured down from the highest equity your account has reached, so it moves up as you make profit.`
        : `Maximum loss limit: ${pct(p.maxLossPct)} of the account size (${money(of(c.accountSize, p.maxLossPct), c.currency)}), static: measured down from the starting account size and it does not move.`,
    );
    lines.push("Limits are checked against equity, which includes open positions, not only closed trades.");
    if (p.minTradingDays > 0) lines.push(`Minimum trading days: ${p.minTradingDays}.`);
    lines.push(p.timeLimitDays ? `Time limit: ${p.timeLimitDays} days from the start of this phase.` : "There is no time limit for this phase.");
    if (p.consistencyRule) lines.push("A consistency rule applies to this phase. It is set out in the challenge terms.");
    sections.push({ title: p.isFunded ? `Funded stage: ${p.label}` : `Phase ${p.order}: ${p.label}`, lines });
  }

  const general = [
    `Account size: ${money(c.accountSize, c.currency)} (simulated).`,
    `Maximum leverage: ${c.leverageCap}:1.`,
    c.permittedInstruments.length ? `Permitted instruments: ${c.permittedInstruments.join(", ")}.` : "No instrument list is set for this challenge.",
    KYC_TEXT[c.kycTiming],
    "Breaching a loss limit ends the account.",
  ];
  sections.unshift({ title: "The basics", lines: general });

  return {
    heading: c.name,
    intro: "These rules are generated from the live settings of this challenge. If anything here differs from the signed terms, the terms apply.",
    sections,
  };
}
