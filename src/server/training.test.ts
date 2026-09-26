import { describe, expect, it } from "vitest";
import { slugify, validateVideoUrl } from "./training";

describe("slugify", () => {
  it("makes a clean url slug", () => {
    expect(slugify("  Getting Started: Your 1st Trade!  ")).toBe("getting-started-your-1st-trade");
  });
  it("strips accents and keeps it short", () => {
    expect(slugify("Πώς λειτουργεί")).toBe("");
    expect(slugify("Café rules")).toBe("cafe-rules");
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});

describe("validateVideoUrl", () => {
  it("accepts https and empty", () => {
    expect(validateVideoUrl("https://example.com/v")).toBe("https://example.com/v");
    expect(validateVideoUrl("  ")).toBeNull();
    expect(validateVideoUrl(null)).toBeNull();
  });
  it("rejects non-https and junk (no javascript: or http links)", () => {
    expect(() => validateVideoUrl("http://example.com")).toThrow();
    expect(() => validateVideoUrl("javascript:alert(1)")).toThrow();
    expect(() => validateVideoUrl("not a url")).toThrow();
  });
});
