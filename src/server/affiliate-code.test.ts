import { describe, expect, it } from "vitest";
import { decideReferral, firstName, generateReferralCode, maskEmail, normalizeCode, referralLink, referralStage } from "./affiliate-code";

describe("generateReferralCode", () => {
  it("has the form EST- plus 8 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReferralCode()).toMatch(/^EST-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });
  it("never contains the look-alike characters I, O, 0 or 1", () => {
    for (let i = 0; i < 500; i++) expect(generateReferralCode().slice(4)).not.toMatch(/[IO01]/);
  });
  it("is driven by the random source (deterministic when given one)", () => {
    expect(generateReferralCode(() => 0)).toBe("EST-AAAAAAAA");
    expect(generateReferralCode((n) => n - 1)).toBe("EST-99999999");
  });
  it("does not repeat in a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateReferralCode());
    expect(seen.size).toBe(5000);
  });
  it("is accepted by the lookup rules", () => {
    expect(normalizeCode(generateReferralCode())).toMatch(/^EST-/);
  });
});

describe("referralLink", () => {
  it("puts the code on the portal sign-up page", () => {
    expect(referralLink("https://crm.example.com", "EST-ABC23456")).toBe("https://crm.example.com/portal/register?ref=EST-ABC23456");
  });
  it("copes with a trailing slash and odd characters", () => {
    expect(referralLink("https://crm.example.com/", "A B")).toBe("https://crm.example.com/portal/register?ref=A%20B");
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("alex.smith@gmail.com")).toBe("a***@gmail.com");
  });
  it("handles a one-letter name", () => {
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
  });
  it("hides anything that is not an email", () => {
    expect(maskEmail("nonsense")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
  });
});

describe("firstName", () => {
  it("is the first word only", () => {
    expect(firstName("Alex Demo Smith")).toBe("Alex");
    expect(firstName("  maria  ")).toBe("maria");
  });
  it("falls back to a dash", () => {
    expect(firstName("")).toBe("—");
    expect(firstName(null)).toBe("—");
  });
});

describe("referralStage", () => {
  it("is not signed up until a person exists", () => {
    expect(referralStage({ signedUp: false, purchased: false, funded: false })).toBe("not_signed_up");
  });
  it("moves forward and reports the furthest step", () => {
    expect(referralStage({ signedUp: true, purchased: false, funded: false })).toBe("registered");
    expect(referralStage({ signedUp: true, purchased: true, funded: false })).toBe("purchased");
    expect(referralStage({ signedUp: true, purchased: true, funded: true })).toBe("funded");
  });
});

describe("decideReferral (first introducer wins)", () => {
  it("creates when nobody has introduced them", () => {
    expect(decideReferral({ existingAffiliateId: null, candidateAffiliateId: "A", isSelf: false })).toEqual({ action: "create" });
  });
  it("keeps the same affiliate", () => {
    expect(decideReferral({ existingAffiliateId: "A", candidateAffiliateId: "A", isSelf: false })).toEqual({ action: "keep" });
  });
  it("ignores a second affiliate", () => {
    expect(decideReferral({ existingAffiliateId: "A", candidateAffiliateId: "B", isSelf: false })).toMatchObject({ action: "ignore" });
  });
  it("ignores an affiliate introducing themselves, even with no existing introducer", () => {
    expect(decideReferral({ existingAffiliateId: null, candidateAffiliateId: "A", isSelf: true })).toMatchObject({ action: "ignore" });
  });
});
