import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateCommission, nextCommissionStatus, normalizeCode, selfReferralFlag } from "./affiliates";

const d = (v: string) => new Prisma.Decimal(v);

describe("calculateCommission", () => {
  it("is a percentage of the amount paid", () => {
    expect(calculateCommission(d("500"), d("10")).toString()).toBe("50");
    expect(calculateCommission(d("299.99"), d("12.5")).toString()).toBe("37.5");
  });
  it("rounds half up to cents without float error", () => {
    // 0.1 + 0.2 style traps: 33.33 * 15% = 4.9995 -> 5.00 ; 10.05 * 10% = 1.005 -> 1.01
    expect(calculateCommission(d("33.33"), d("15")).toString()).toBe("5");
    expect(calculateCommission(d("10.05"), d("10")).toString()).toBe("1.01");
  });
  it("is zero on a zero payment", () => {
    expect(calculateCommission(d("0"), d("10")).toString()).toBe("0");
  });
});

describe("normalizeCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeCode("  partner22 ")).toBe("PARTNER22");
  });
  it("rejects short, long and odd codes", () => {
    expect(() => normalizeCode("ab")).toThrow();
    expect(() => normalizeCode("has space")).toThrow();
    expect(() => normalizeCode("x".repeat(33))).toThrow();
  });
});

describe("selfReferralFlag", () => {
  const affiliate = { email: "aff@example.com", personId: "p-aff" };
  const base = { affiliate, buyer: { id: "p-buyer", email: "buyer@example.com" }, buyerFingerprint: null, affiliateFingerprints: new Set<string>() };
  it("passes an unrelated buyer", () => {
    expect(selfReferralFlag(base)).toBeNull();
  });
  it("flags the affiliate's own trader profile", () => {
    expect(selfReferralFlag({ ...base, buyer: { id: "p-aff", email: "x@example.com" } })).toMatch(/own trader profile/);
  });
  it("flags the same email regardless of case", () => {
    expect(selfReferralFlag({ ...base, buyer: { id: "p-buyer", email: " AFF@example.com " } })).toMatch(/email/);
  });
  it("flags a shared payment instrument", () => {
    expect(selfReferralFlag({ ...base, buyerFingerprint: "fp1", affiliateFingerprints: new Set(["fp1"]) })).toMatch(/payment/);
    expect(selfReferralFlag({ ...base, buyerFingerprint: "fp2", affiliateFingerprints: new Set(["fp1"]) })).toBeNull();
  });
});

describe("nextCommissionStatus", () => {
  it("follows pending -> approved -> paid", () => {
    expect(nextCommissionStatus("pending", "approve")).toBe("approved");
    expect(nextCommissionStatus("approved", "pay")).toBe("paid");
  });
  it("can void before payment only", () => {
    expect(nextCommissionStatus("pending", "void")).toBe("voided");
    expect(nextCommissionStatus("approved", "void")).toBe("voided");
    expect(() => nextCommissionStatus("paid", "void")).toThrow();
  });
  it("can't skip approval or pay twice", () => {
    expect(() => nextCommissionStatus("pending", "pay")).toThrow();
    expect(() => nextCommissionStatus("paid", "pay")).toThrow();
    expect(() => nextCommissionStatus("voided", "approve")).toThrow();
  });
});
