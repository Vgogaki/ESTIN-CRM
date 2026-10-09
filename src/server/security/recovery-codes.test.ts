import { describe, expect, it } from "vitest";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeTotp,
  normalizeRecoveryCode,
} from "./recovery-codes";

describe("generateRecoveryCode", () => {
  it("is 10 characters in two groups of five, never using the easily-misread I O 0 1", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRecoveryCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
  });
});

describe("generateRecoveryCodes", () => {
  it("makes 10 distinct codes by default", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
  });
});

describe("normalizeRecoveryCode", () => {
  it("accepts what a person might type: lowercase, spaces, missing dash", () => {
    expect(normalizeRecoveryCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeRecoveryCode(" ABCDE FGHJK ")).toBe("ABCDEFGHJK");
    expect(normalizeRecoveryCode("ABCDEFGHJK")).toBe("ABCDEFGHJK");
  });
  it("rejects anything that can't be a recovery code", () => {
    expect(normalizeRecoveryCode("123456")).toBeNull();
    expect(normalizeRecoveryCode("ABCDE-FGHJ")).toBeNull();
    expect(normalizeRecoveryCode("ABCDE-FGHJKL")).toBeNull();
    expect(normalizeRecoveryCode("ABCDE-FGHIO")).toBeNull(); // contains I and O
    expect(normalizeRecoveryCode("")).toBeNull();
  });
});

describe("hashRecoveryCode", () => {
  it("is stable, never contains the code, and differs per code", () => {
    expect(hashRecoveryCode("ABCDEFGHJK")).toBe(hashRecoveryCode("ABCDEFGHJK"));
    expect(hashRecoveryCode("ABCDEFGHJK")).not.toContain("ABCDEFGHJK");
    expect(hashRecoveryCode("ABCDEFGHJK")).not.toBe(hashRecoveryCode("ABCDEFGHJL"));
  });
});

describe("looksLikeTotp", () => {
  it("distinguishes a 6-digit authenticator code from a recovery code", () => {
    expect(looksLikeTotp("123456")).toBe(true);
    expect(looksLikeTotp(" 123456 ")).toBe(true);
    expect(looksLikeTotp("12345")).toBe(false);
    expect(looksLikeTotp("ABCDE-FGHJK")).toBe(false);
  });
});
