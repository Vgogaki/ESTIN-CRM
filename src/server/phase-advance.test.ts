import { describe, expect, it } from "vitest";
import { planAdvance, type PhaseLite } from "./phase-advance";

const p1: PhaseLite = { id: "p1", order: 1, label: "Phase 1", isFunded: false };
const p2: PhaseLite = { id: "p2", order: 2, label: "Phase 2", isFunded: false };
const funded: PhaseLite = { id: "f", order: 3, label: "Funded", isFunded: true };

function input(overrides: Partial<Parameters<typeof planAdvance>[0]> = {}): Parameters<typeof planAdvance>[0] {
  return {
    accountPhase: "pass_review",
    accountStatus: "active",
    voided: false,
    currentPhaseId: "p1",
    phases: [funded, p1, p2],
    kycStatus: "verified",
    kycTiming: "after_evaluation",
    ...overrides,
  };
}

describe("planAdvance", () => {
  it("moves to the next phase by order, regardless of array order", () => {
    const r = planAdvance(input());
    expect(r).toEqual({ ok: true, target: p2 });
  });

  it("moves the last evaluation phase into the funded stage", () => {
    const r = planAdvance(input({ currentPhaseId: "p2" }));
    expect(r).toEqual({ ok: true, target: funded });
  });

  it("refuses anything that isn't in pass review", () => {
    for (const accountPhase of ["evaluation", "funded", "closed"] as const) {
      expect(planAdvance(input({ accountPhase })).ok).toBe(false);
    }
  });

  it("refuses a voided or non-active account", () => {
    expect(planAdvance(input({ voided: true })).ok).toBe(false);
    expect(planAdvance(input({ accountStatus: "breached" })).ok).toBe(false);
  });

  it("refuses when there is no further phase", () => {
    expect(planAdvance(input({ phases: [p1], currentPhaseId: "p1" })).ok).toBe(false);
  });

  it("refuses when the current phase isn't part of the challenge", () => {
    expect(planAdvance(input({ currentPhaseId: null })).ok).toBe(false);
  });

  it("won't fund an account whose KYC isn't verified when KYC is due before funding", () => {
    for (const kycTiming of ["at_creation", "after_evaluation"] as const) {
      const r = planAdvance(input({ currentPhaseId: "p2", kycStatus: "submitted", kycTiming }));
      expect(r.ok).toBe(false);
    }
  });

  it("does allow funding without KYC when KYC is deferred to first payout", () => {
    const r = planAdvance(input({ currentPhaseId: "p2", kycStatus: "not_started", kycTiming: "at_first_payout" }));
    expect(r.ok).toBe(true);
  });

  it("doesn't require KYC to move between evaluation phases", () => {
    const r = planAdvance(input({ kycStatus: "not_started" }));
    expect(r.ok).toBe(true);
  });
});
