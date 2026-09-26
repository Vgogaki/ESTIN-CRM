import { describe, expect, it } from "vitest";
import { normalizeCountry, resolveAction } from "./countries";

describe("resolveAction", () => {
  it("allows a country that has no rule — no default list is shipped", () => {
    expect(resolveAction(null, "purchase")).toBe("allowed");
  });

  it("applies each stage independently", () => {
    const rule = { registration: "allowed", purchase: "blocked", trading: "allowed", payout: "review" } as const;
    expect(resolveAction(rule, "registration")).toBe("allowed");
    expect(resolveAction(rule, "purchase")).toBe("blocked");
    expect(resolveAction(rule, "payout")).toBe("review");
  });

  it("falls back to allowed for a stage the rule doesn't mention", () => {
    expect(resolveAction({ purchase: "blocked" }, "payout")).toBe("allowed");
  });
});

describe("normalizeCountry", () => {
  it("upper-cases and trims so cy, CY and ' cy ' are the same country", () => {
    expect(normalizeCountry(" cy ")).toBe("CY");
  });
});
