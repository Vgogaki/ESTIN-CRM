import { describe, expect, it } from "vitest";
import { generate } from "otplib";
import { generateTotpSecret, totpEnrollmentUri, verifyTotpToken } from "./totp";

const NOW = 1_800_000_000; // a fixed moment, so the test never depends on where a 30-second boundary falls

describe("verifyTotpToken", () => {
  const secret = generateTotpSecret();

  it("accepts the current code", async () => {
    expect(await verifyTotpToken(await generate({ secret, epoch: NOW }), secret, NOW)).toBe(true);
  });
  it("accepts the code from one step earlier or later (clock drift)", async () => {
    expect(await verifyTotpToken(await generate({ secret, epoch: NOW - 30 }), secret, NOW)).toBe(true);
    expect(await verifyTotpToken(await generate({ secret, epoch: NOW + 30 }), secret, NOW)).toBe(true);
  });
  it("rejects a code two or more steps away", async () => {
    expect(await verifyTotpToken(await generate({ secret, epoch: NOW - 90 }), secret, NOW)).toBe(false);
    expect(await verifyTotpToken(await generate({ secret, epoch: NOW + 90 }), secret, NOW)).toBe(false);
  });
  it("rejects a wrong code, a code for a different secret, and junk", async () => {
    const other = generateTotpSecret();
    expect(await verifyTotpToken("000000", secret, NOW)).toBe(false);
    expect(await verifyTotpToken(await generate({ secret: other, epoch: NOW }), secret, NOW)).toBe(false);
    expect(await verifyTotpToken("not-a-code", secret, NOW)).toBe(false);
    expect(await verifyTotpToken("", secret, NOW)).toBe(false);
  });
});

describe("totpEnrollmentUri", () => {
  it("names the issuer and the account so the app labels it clearly", () => {
    const uri = totpEnrollmentUri("JBSWY3DPEHPK3PXP", "someone@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("ESTIN%20CRM");
    expect(uri).toContain("someone%40example.com");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
  });
});
