import { describe, expect, it } from "vitest";
import { hasConsistentMismatch } from "./login-geo";

describe("hasConsistentMismatch", () => {
  it("needs at least 3 resolved samples", () => {
    expect(hasConsistentMismatch("GB", ["DE", "DE"])).toBe(false);
  });
  it("is false once any recent sign-in matches home", () => {
    expect(hasConsistentMismatch("GB", ["DE", "GB", "DE"])).toBe(false);
  });
  it("is true once enough samples all differ from home", () => {
    expect(hasConsistentMismatch("GB", ["DE", "FR", "DE"])).toBe(true);
  });
  it("ignores case", () => {
    expect(hasConsistentMismatch("gb", ["de", "de", "fr"])).toBe(true);
  });
  it("a single trip abroad (still below the sample minimum) doesn't trip it", () => {
    expect(hasConsistentMismatch("GB", ["DE"])).toBe(false);
  });
});
