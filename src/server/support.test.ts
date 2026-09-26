import { describe, expect, it } from "vitest";
import { nextStatus } from "./support";

describe("nextStatus", () => {
  it("a trader message always returns the thread to staff (open)", () => {
    for (const s of ["open", "awaiting_trader", "resolved"] as const) {
      expect(nextStatus(s, "trader_message")).toBe("open");
    }
  });

  it("a trader reply reopens a resolved thread", () => {
    expect(nextStatus("resolved", "trader_message")).toBe("open");
  });

  it("an admin reply waits on the trader", () => {
    expect(nextStatus("open", "admin_reply")).toBe("awaiting_trader");
  });

  it("replying and resolving in one step resolves", () => {
    expect(nextStatus("open", "admin_reply_and_resolve")).toBe("resolved");
  });

  it("staff can resolve or reopen without a message", () => {
    expect(nextStatus("open", "admin_resolve")).toBe("resolved");
    expect(nextStatus("resolved", "admin_reopen")).toBe("open");
  });
});
