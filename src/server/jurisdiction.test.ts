import { describe, expect, it } from "vitest";
import { matrixSettled } from "./jurisdiction";

describe("matrixSettled", () => {
  const s = (...statuses: ("pending" | "in_progress" | "done")[]) => statuses.map((status) => ({ status }));
  it("is settled only when all four inputs are done", () => {
    expect(matrixSettled(s("done", "done", "done", "done"))).toBe(true);
  });
  it("is not settled while any input is pending or in progress", () => {
    expect(matrixSettled(s("done", "done", "done", "in_progress"))).toBe(false);
    expect(matrixSettled(s("done", "done", "done", "pending"))).toBe(false);
  });
  it("is not settled when inputs are missing", () => {
    expect(matrixSettled(s("done", "done", "done"))).toBe(false);
  });
});
