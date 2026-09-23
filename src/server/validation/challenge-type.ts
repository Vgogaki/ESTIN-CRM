import { z } from "zod";

const phaseSchema = z.object({
  order: z.number().int().min(0),
  label: z.string().min(1).max(100),
  isFunded: z.boolean(),
  profitTargetPct: z.number().min(0).max(100).nullable().optional(),
  dailyLossPct: z.number().min(0).max(100),
  maxLossPct: z.number().min(0).max(100),
  drawdownType: z.enum(["trailing", "static"]),
  minTradingDays: z.number().int().min(0),
  timeLimitDays: z.number().int().min(1).nullable().optional(),
  consistencyRule: z.record(z.string(), z.unknown()).nullable().optional(),
  profitSplitPct: z.number().min(0).max(100).nullable().optional(),
  payoutCycleDays: z.number().int().min(1).nullable().optional(),
  minPayoutAmount: z.number().min(0).nullable().optional(),
});

export const challengeTypeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  productType: z.enum(["standard", "promotional", "competition_linked", "instant_funded"]),
  accountSize: z.number().positive(),
  fee: z.number().min(0),
  currency: z.string().length(3),
  leverageCap: z.number().int().positive(),
  permittedInstruments: z.array(z.string()).min(1),
  kycTiming: z.enum(["at_creation", "after_evaluation", "at_first_payout"]),
  phases: z.array(phaseSchema).min(1),
});
