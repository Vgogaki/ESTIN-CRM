import { describe, expect, it } from "vitest";
import { findLinks, hashFingerprint, type Evidence } from "./account-links";

function ev(parts: Partial<{ ips: string[]; docs: string[]; pay: string[] }> = {}): Evidence {
  return { ips: new Set(parts.ips), kycChecksums: new Set(parts.docs), paymentFingerprints: new Set(parts.pay) };
}

describe("findLinks", () => {
  it("finds nothing when people share nothing", () => {
    const m = new Map([["a", ev({ ips: ["1.1.1.1"] })], ["b", ev({ ips: ["2.2.2.2"] })]]);
    expect(findLinks("a", m)).toEqual([]);
  });

  it("links people sharing only an IP as a weak link", () => {
    const m = new Map([["a", ev({ ips: ["1.1.1.1"] })], ["b", ev({ ips: ["1.1.1.1"] })]]);
    const r = findLinks("a", m);
    expect(r).toHaveLength(1);
    expect(r[0].strength).toBe("weak");
    expect(r[0].signals).toEqual([{ type: "shared_ip", value: "1.1.1.1" }]);
  });

  it("treats a reused KYC document as strong", () => {
    const m = new Map([["a", ev({ docs: ["abc"] })], ["b", ev({ docs: ["abc"] })]]);
    expect(findLinks("a", m)[0].strength).toBe("strong");
  });

  it("treats a shared payment instrument as strong", () => {
    const m = new Map([["a", ev({ pay: ["f1"] })], ["b", ev({ pay: ["f1"] })]]);
    expect(findLinks("a", m)[0].strength).toBe("strong");
  });

  it("combines signals, and one strong signal makes the whole link strong", () => {
    const m = new Map([["a", ev({ ips: ["1.1.1.1"], docs: ["abc"] })], ["b", ev({ ips: ["1.1.1.1"], docs: ["abc"] })]]);
    const r = findLinks("a", m)[0];
    expect(r.signals).toHaveLength(2);
    expect(r.strength).toBe("strong");
  });

  it("ignores unknown / loopback addresses — they identify nobody", () => {
    const m = new Map([["a", ev({ ips: ["unknown", "127.0.0.1", "::1"] })], ["b", ev({ ips: ["unknown", "127.0.0.1", "::1"] })]]);
    expect(findLinks("a", m)).toEqual([]);
  });

  it("never links a person to themselves", () => {
    expect(findLinks("a", new Map([["a", ev({ ips: ["1.1.1.1"] })]]))).toEqual([]);
  });

  it("returns one link per other person", () => {
    const m = new Map([["a", ev({ ips: ["1.1.1.1"] })], ["b", ev({ ips: ["1.1.1.1"] })], ["c", ev({ ips: ["1.1.1.1"] })]]);
    expect(findLinks("a", m).map((l) => l.otherId).sort()).toEqual(["b", "c"]);
  });
});

describe("hashFingerprint", () => {
  it("is stable and never returns the raw token", () => {
    expect(hashFingerprint(" tok_123 ")).toBe(hashFingerprint("tok_123"));
    expect(hashFingerprint("tok_123")).not.toContain("tok_123");
  });
});
