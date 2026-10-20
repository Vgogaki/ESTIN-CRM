import { describe, expect, it } from "vitest";
import { canHandleTasks, KIND_LABEL } from "./tasks";

describe("canHandleTasks", () => {
  it("lets anyone who can act on something take a task", () => {
    expect(canHandleTasks(["traders.view", "kyc.decide"])).toBe(true);
    expect(canHandleTasks(["traders.view", "payouts.approve"])).toBe(true);
    expect(canHandleTasks(["traders.view", "support.manage"])).toBe(true);
  });
  it("keeps the read-only role to looking", () => {
    expect(canHandleTasks(["traders.view", "kyc.view", "payouts.view", "reports.view"])).toBe(false);
    expect(canHandleTasks([])).toBe(false);
  });
});

describe("KIND_LABEL", () => {
  it("has plain-language text for every kind of task", () => {
    expect(Object.values(KIND_LABEL).every((s) => s.length > 3)).toBe(true);
    expect(KIND_LABEL.pass_review).toBe("Pass review");
  });
});
