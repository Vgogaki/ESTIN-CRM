import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { discountedFee } from "./offers";

const { Decimal } = Prisma;
const d = (n: number) => new Decimal(n);

describe("discountedFee", () => {
  it("applies a percent discount", () => {
    expect(discountedFee(d(300), "percent", d(20)).toNumber()).toBe(240);
  });

  it("applies a fixed discount", () => {
    expect(discountedFee(d(300), "fixed", d(50)).toNumber()).toBe(250);
  });

  it("floors a fixed discount at zero rather than going negative", () => {
    expect(discountedFee(d(100), "fixed", d(150)).toNumber()).toBe(0);
  });

  it("a 100% percent discount is free, not negative", () => {
    expect(discountedFee(d(300), "percent", d(100)).toNumber()).toBe(0);
  });

  it("a 0% discount changes nothing", () => {
    expect(discountedFee(d(300), "percent", d(0)).toNumber()).toBe(300);
  });
});
