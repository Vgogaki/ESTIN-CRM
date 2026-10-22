import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { classifyQuote, type FilterState } from "./quote-filter";

const d = (v: string | number) => new Prisma.Decimal(v);
const T0 = new Date("2026-10-20T12:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const q = (bid: string, ask: string, s = 0) => ({ bid: d(bid), ask: d(ask), quoteTs: at(s) });
const LIMITS = { maxJumpPct: d("0.5"), maxSpreadPct: d("0.1") };
const state = (last: ReturnType<typeof q> | null, suspect: { id: string; bid: string; ask: string } | null = null): FilterState => ({
  lastAccepted: last,
  pendingSuspect: suspect ? { id: suspect.id, bid: d(suspect.bid), ask: d(suspect.ask) } : null,
});

describe("classifyQuote: plainly wrong prices are rejected", () => {
  it("rejects zero and negative prices", () => {
    expect(classifyQuote(q("0", "1.2"), state(null), LIMITS).status).toBe("rejected");
    expect(classifyQuote(q("1.2", "-1"), state(null), LIMITS).status).toBe("rejected");
  });
  it("rejects a crossed quote (ask below bid)", () => {
    const r = classifyQuote(q("1.2002", "1.2000"), state(null), LIMITS);
    expect(r).toMatchObject({ status: "rejected" });
    expect(r.reason).toMatch(/Crossed/);
  });
  it("rejects a spread that is too wide, accepts one right at the limit", () => {
    expect(classifyQuote(q("1.0000", "1.0020"), state(null), LIMITS).status).toBe("rejected"); // 0.2%
    expect(classifyQuote(q("1.0000", "1.0010"), state(null), LIMITS).status).toBe("accepted"); // ~0.1%
  });
  it("rejects a price older than one already accepted", () => {
    const r = classifyQuote(q("1.2000", "1.2001", -5), state(q("1.2000", "1.2001", 0)), LIMITS);
    expect(r).toMatchObject({ status: "rejected" });
    expect(r.reason).toMatch(/Out of order/);
  });
  it("accepts a price with the same timestamp as the last", () => {
    expect(classifyQuote(q("1.2001", "1.2002", 0), state(q("1.2000", "1.2001", 0)), LIMITS).status).toBe("accepted");
  });
});

describe("classifyQuote: normal movement", () => {
  it("accepts the very first price", () => {
    expect(classifyQuote(q("1.2000", "1.2001"), state(null), LIMITS)).toEqual({ status: "accepted", reason: null, confirmsTickId: null });
  });
  it("accepts a small move, and a move exactly at the limit", () => {
    const last = q("1.0000", "1.0000", 0);
    expect(classifyQuote(q("1.0020", "1.0020", 1), state(last), LIMITS).status).toBe("accepted");
    expect(classifyQuote(q("1.0050", "1.0050", 1), state(last), LIMITS).status).toBe("accepted"); // exactly 0.5%
  });
});

describe("classifyQuote: a big jump is held until the next price agrees", () => {
  const last = q("1.0000", "1.0001", 0);

  it("holds a jump larger than the limit as a suspect", () => {
    const r = classifyQuote(q("1.0200", "1.0201", 1), state(last), LIMITS);
    expect(r.status).toBe("suspect");
    expect(r.reason).toMatch(/held until the next price confirms/);
  });
  it("a bad spike that reverses is never accepted: the next price is back near the last good one", () => {
    const next = classifyQuote(q("1.0002", "1.0003", 2), state(last, { id: "s1", bid: "1.0200", ask: "1.0201" }), LIMITS);
    expect(next).toEqual({ status: "accepted", reason: null, confirmsTickId: null });
  });
  it("a real move is accepted once a second price agrees with the first, and says which it confirms", () => {
    const next = classifyQuote(q("1.0203", "1.0204", 2), state(last, { id: "s1", bid: "1.0200", ask: "1.0201" }), LIMITS);
    expect(next.status).toBe("accepted");
    expect(next.confirmsTickId).toBe("s1");
    expect(next.reason).toMatch(/Confirms/);
  });
  it("a second jump to somewhere else entirely is also held, not trusted", () => {
    const next = classifyQuote(q("1.0500", "1.0501", 2), state(last, { id: "s1", bid: "1.0200", ask: "1.0201" }), LIMITS);
    expect(next.status).toBe("suspect");
    expect(next.confirmsTickId).toBeNull();
  });
  it("works for a downward jump too", () => {
    expect(classifyQuote(q("0.9800", "0.9801", 1), state(last), LIMITS).status).toBe("suspect");
  });
  it("a wider limit lets the same move through (per-instrument setting)", () => {
    expect(classifyQuote(q("1.0200", "1.0201", 1), state(last), { ...LIMITS, maxJumpPct: d("3") }).status).toBe("accepted");
  });
});
