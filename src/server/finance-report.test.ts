import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { csvCell, feesCsv, periodBounds, summarize, toCsv, type PaymentRow, type PayoutRow } from "./finance-report";

const d = (n: number | string) => new Prisma.Decimal(n);

const pay = (o: Partial<PaymentRow> = {}): PaymentRow => ({
  orderRef: "O1", createdAt: new Date("2026-03-10T12:00:00Z"), amountPaid: d(300), currency: "EUR",
  paymentProvider: "stripe", status: "succeeded", affiliateCode: null, accountVoided: false, trader: "A", ...o,
});
const out = (o: Partial<PayoutRow> = {}): PayoutRow => ({
  id: "W1", requestedAt: new Date("2026-03-11T00:00:00Z"), decidedAt: new Date("2026-03-12T00:00:00Z"), status: "approved",
  amount: d(1000), profit: d(1250), splitPct: d(80), currency: "EUR", trader: "A", orderRef: "O1", method: null, providerReference: null, ...o,
});

describe("summarize", () => {
  it("totals fees and approved payouts and nets them", () => {
    const [s] = summarize([pay(), pay({ orderRef: "O2", amountPaid: d(200) })], [out()]);
    expect(s.feesReceived).toBe("500.00");
    expect(s.payoutsApproved).toBe("1000.00");
    expect(s.netPosition).toBe("-500.00");
  });

  it("never adds different currencies together", () => {
    const r = summarize([pay(), pay({ orderRef: "O2", currency: "USD", amountPaid: d(100) })], []);
    expect(r.map((x) => [x.currency, x.feesReceived])).toEqual([["EUR", "300.00"], ["USD", "100.00"]]);
  });

  it("counts only succeeded payments as fees received", () => {
    const [s] = summarize([pay(), pay({ orderRef: "O2", status: "failed" }), pay({ orderRef: "O3", status: "refunded" })], []);
    expect(s.feesReceived).toBe("300.00");
    expect(s.feeCount).toBe(1);
  });

  it("counts approved and paid payouts, but not pending or declined", () => {
    const [s] = summarize([], [out(), out({ id: "W2", status: "paid" }), out({ id: "W3", status: "pending", decidedAt: null }), out({ id: "W4", status: "declined" })]);
    expect(s.payoutsApprovedCount).toBe(2);
    expect(s.payoutsDeclinedCount).toBe(1);
    expect(s.payoutsApproved).toBe("2000.00");
  });

  it("buckets by UTC month, using the decision date for payouts", () => {
    const [s] = summarize(
      [pay({ createdAt: new Date("2026-01-31T23:59:59Z") }), pay({ orderRef: "O2", createdAt: new Date("2026-02-01T00:00:00Z") })],
      [out({ decidedAt: new Date("2026-02-15T00:00:00Z") })],
    );
    expect(s.feesByMonth).toEqual([
      { month: "2026-01", fees: "300.00", payouts: "0.00" },
      { month: "2026-02", fees: "300.00", payouts: "1000.00" },
    ]);
  });

  it("keeps cent precision", () => {
    const [s] = summarize([pay({ amountPaid: d("0.10") }), pay({ orderRef: "O2", amountPaid: d("0.20") })], []);
    expect(s.feesReceived).toBe("0.30");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("neutralises spreadsheet formulas but leaves real negative numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toContain("'=");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-500.00")).toBe("-500.00");
  });

  it("writes empty for null and undefined", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("a,b\r\n,\r\n");
  });

  it("exports a fees row with UTC ISO dates and a voided flag", () => {
    const csv = feesCsv([pay({ accountVoided: true })]);
    expect(csv.split("\r\n")[1]).toBe("O1,2026-03-10T12:00:00.000Z,300.00,EUR,succeeded,stripe,,yes,A");
  });
});

describe("periodBounds", () => {
  it("includes both end days in UTC", () => {
    const { start, end } = periodBounds("2026-03-01", "2026-03-31");
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-31T23:59:59.999Z");
  });

  it("rejects a reversed or invalid period", () => {
    expect(() => periodBounds("2026-04-01", "2026-03-01")).toThrow();
    expect(() => periodBounds("nope", "2026-03-01")).toThrow();
  });
});
