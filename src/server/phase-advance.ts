import type { AccountPhase, AccountStatus, KycStatus, KycTiming } from "@prisma/client";

export type PhaseLite = { id: string; order: number; label: string; isFunded: boolean };

export type AdvancePlan = { ok: true; target: PhaseLite } | { ok: false; reason: string };

/**
 * Pure decision for moving an account out of pass review into its next
 * challenge phase — the step that was missing between "target hit" (3.4)
 * and a funded account that can request a payout (5.1). No DB access.
 *
 * Funding is gated on KYC per the challenge type's own kycTiming: if KYC
 * is due at creation or after evaluation, an account can't be funded
 * without it (the "funded accounts without verified KYC" exception the
 * spec says should never exist, §5.2). Only at_first_payout defers that to
 * the payout gate.
 */
export function planAdvance(input: {
  accountPhase: AccountPhase;
  accountStatus: AccountStatus;
  voided: boolean;
  currentPhaseId: string | null;
  phases: PhaseLite[];
  kycStatus: KycStatus;
  kycTiming: KycTiming;
}): AdvancePlan {
  if (input.voided) return { ok: false, reason: "This account is voided." };
  if (input.accountStatus !== "active") return { ok: false, reason: "Only an active account can be advanced." };
  if (input.accountPhase !== "pass_review") {
    return { ok: false, reason: "Only an account in pass review can be advanced." };
  }

  const current = input.phases.find((p) => p.id === input.currentPhaseId);
  if (!current) return { ok: false, reason: "This account has no current phase to advance from." };

  const next = [...input.phases]
    .filter((p) => p.order > current.order)
    .sort((a, b) => a.order - b.order)[0];
  if (!next) return { ok: false, reason: "This challenge has no further phase." };

  if (next.isFunded && input.kycTiming !== "at_first_payout" && input.kycStatus !== "verified") {
    return { ok: false, reason: "KYC must be verified before this account can be funded." };
  }

  return { ok: true, target: next };
}
