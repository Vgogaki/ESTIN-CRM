import { describe, expect, it } from "vitest";
import { checkBasicAuth, constantTimeEqual, gateDecision } from "./review-gate";

const basic = (user: string, pass: string) => "Basic " + btoa(`${user}:${pass}`);

describe("constantTimeEqual", () => {
  it("matches equal strings and rejects any difference, including length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("checkBasicAuth", () => {
  it("accepts the right credentials", () => {
    expect(checkBasicAuth(basic("reviewer", "s3cret"), "reviewer", "s3cret")).toBe(true);
  });
  it("accepts a password that itself contains a colon", () => {
    expect(checkBasicAuth(basic("reviewer", "a:b:c"), "reviewer", "a:b:c")).toBe(true);
  });
  it("rejects a wrong user, a wrong password, and both", () => {
    expect(checkBasicAuth(basic("other", "s3cret"), "reviewer", "s3cret")).toBe(false);
    expect(checkBasicAuth(basic("reviewer", "nope"), "reviewer", "s3cret")).toBe(false);
    expect(checkBasicAuth(basic("x", "y"), "reviewer", "s3cret")).toBe(false);
  });
  it("rejects missing, malformed and non-Basic headers", () => {
    expect(checkBasicAuth(null, "u", "p")).toBe(false);
    expect(checkBasicAuth("Bearer abc", "u", "p")).toBe(false);
    expect(checkBasicAuth("Basic !!!not-base64!!!", "u", "p")).toBe(false);
    expect(checkBasicAuth("Basic " + btoa("no-colon-here"), "u", "p")).toBe(false);
  });
});

describe("gateDecision", () => {
  const base = { enabled: true, user: "u", pass: "p", pathname: "/admin" };
  it("does nothing when switched off (local development)", () => {
    expect(gateDecision({ ...base, enabled: false, header: null })).toBe("allow");
  });
  it("challenges when on and no credentials are sent", () => {
    expect(gateDecision({ ...base, header: null })).toBe("challenge");
  });
  it("lets the right credentials through, and challenges wrong ones", () => {
    expect(gateDecision({ ...base, header: basic("u", "p") })).toBe("allow");
    expect(gateDecision({ ...base, header: basic("u", "wrong") })).toBe("challenge");
  });
  it("fails closed when on but the username or password is missing", () => {
    expect(gateDecision({ ...base, user: undefined, header: basic("u", "p") })).toBe("misconfigured");
    expect(gateDecision({ ...base, pass: "", header: basic("u", "") })).toBe("misconfigured");
  });
  it("leaves only the health-check path open", () => {
    expect(gateDecision({ ...base, pathname: "/api/health", header: null })).toBe("allow");
    expect(gateDecision({ ...base, pathname: "/api/health/extra", header: null })).toBe("challenge");
    expect(gateDecision({ ...base, pathname: "/api/admin/auth/login", header: null })).toBe("challenge");
  });
});
