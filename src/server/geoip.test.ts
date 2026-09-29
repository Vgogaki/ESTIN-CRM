import { describe, expect, it } from "vitest";
import { parseCountryCode } from "./geoip";

describe("parseCountryCode", () => {
  it("accepts a bare two-letter code, trimmed and uppercased", () => {
    expect(parseCountryCode("gb")).toBe("GB");
    expect(parseCountryCode("  Cy \n")).toBe("CY");
  });
  it("rejects anything that isn't exactly two letters", () => {
    for (const bad of ["", "g", "gbr", "12", "<html>", "not found", "g1"]) {
      expect(parseCountryCode(bad)).toBeNull();
    }
  });
});
