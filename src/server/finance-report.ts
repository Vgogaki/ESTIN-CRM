import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";

const { Decimal } = Prisma;
const zero = new Decimal(0);

/**
 * Module 5.5 — finance reporting and export (modules-to-design.md §5.3–5.5:
 * "fees received, refunds, chargebacks, payouts, by period and currency").
 *
 * Reports CASH ACTUALLY RECEIVED at purchase and payouts by the date they
 * were approved. It applies NO revenue-recognition rule — whether fees are
 * recognised at purchase or deferred is decisions.md #10, for the
 * accountant. Currencies are never added together. Refunds and chargebacks
 * (module 2.3) don't exist yet: no refund amount is stored and nothing sets
 * a refunded status, so they are reported as "not tracked" rather than as
 * a misleading zero.
 */
export type PaymentRow = {
  orderRef: string;
  createdAt: Date;
  amountPaid: Prisma.Decimal;
  currency: string;
  paymentProvider: string;
  status: string;
  affiliateCode: string | null;
  accountVoided: boolean;
  trader: string;
};

export type PayoutRow = {
  id: string;
  requestedAt: Date;
  decidedAt: Date | null;
  status: string;
  amount: Prisma.Decimal;
  profit: Prisma.Decimal;
  splitPct: Prisma.Decimal;
  currency: string;
  trader: string;
  orderRef: string;
  method: string | null;
  providerReference: string | null;
};

export type CurrencySummary = {
  currency: string;
  feesReceived: string;
  feeCount: number;
  payoutsApproved: string;
  payoutsApprovedCount: number;
  payoutsDeclinedCount: number;
  netPosition: string;
  feesByMonth: { month: string; fees: string; payouts: string }[];
};

/** Provider used by the admin test tool — real books shouldn't include synthetic orders. */
export const TEST_PROVIDER = "manual-test";

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Pure. Everything is bucketed in UTC (CLAUDE.md: all timestamps UTC). */
export function summarize(payments: PaymentRow[], payouts: PayoutRow[]): CurrencySummary[] {
  const currencies = new Set([...payments.map((p) => p.currency), ...payouts.map((p) => p.currency)]);

  return [...currencies].sort().map((currency) => {
    const paid = payments.filter((p) => p.currency === currency && p.status === "succeeded");
    const out = payouts.filter((p) => p.currency === currency);
    const approved = out.filter((p) => p.status === "approved" || p.status === "paid");

    const feesReceived = paid.reduce((s, p) => s.plus(p.amountPaid), zero);
    const payoutsApproved = approved.reduce((s, p) => s.plus(p.amount), zero);

    const months = new Map<string, { fees: Prisma.Decimal; payouts: Prisma.Decimal }>();
    const bucket = (k: string) => months.get(k) ?? months.set(k, { fees: zero, payouts: zero }).get(k)!;
    for (const p of paid) { const b = bucket(monthKey(p.createdAt)); b.fees = b.fees.plus(p.amountPaid); }
    for (const p of approved) { if (p.decidedAt) { const b = bucket(monthKey(p.decidedAt)); b.payouts = b.payouts.plus(p.amount); } }

    return {
      currency,
      feesReceived: feesReceived.toFixed(2),
      feeCount: paid.length,
      payoutsApproved: payoutsApproved.toFixed(2),
      payoutsApprovedCount: approved.length,
      payoutsDeclinedCount: out.filter((p) => p.status === "declined").length,
      netPosition: feesReceived.minus(payoutsApproved).toFixed(2),
      feesByMonth: [...months.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, fees: v.fees.toFixed(2), payouts: v.payouts.toFixed(2) })),
    };
  });
}

/**
 * A spreadsheet treats a cell starting with = + - @ as a formula. Names and
 * references in this data come from outside, so neutralise them (the
 * standard CSV-injection defence), then quote per RFC 4180.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function feesCsv(payments: PaymentRow[]): string {
  return toCsv(
    ["order_ref", "date_utc", "amount", "currency", "status", "provider", "affiliate_code", "account_voided", "trader"],
    payments.map((p) => [p.orderRef, p.createdAt.toISOString(), p.amountPaid.toFixed(2), p.currency, p.status, p.paymentProvider, p.affiliateCode, p.accountVoided ? "yes" : "no", p.trader]),
  );
}

export function payoutsCsv(payouts: PayoutRow[]): string {
  return toCsv(
    ["payout_id", "requested_utc", "decided_utc", "status", "profit", "split_pct", "amount", "currency", "trader", "account_order_ref", "method", "provider_reference"],
    payouts.map((p) => [p.id, p.requestedAt.toISOString(), p.decidedAt?.toISOString() ?? "", p.status, p.profit.toFixed(2), p.splitPct.toString(), p.amount.toFixed(2), p.currency, p.trader, p.orderRef, p.method, p.providerReference]),
  );
}

/** Period is inclusive of both days, in UTC. Payouts are placed by when they were requested for the ledger, and by decision date for the approved total. */
export function periodBounds(from: string, to: string): { start: Date; end: Date } {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new ValidationError("That isn't a valid period — check the dates.");
  }
  return { start, end };
}

export async function loadFinanceData(input: { from: string; to: string; includeTest: boolean }) {
  const { start, end } = periodBounds(input.from, input.to);

  const [payments, payoutRows] = await Promise.all([
    db.payment.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(input.includeTest ? {} : { paymentProvider: { not: TEST_PROVIDER } }),
      },
      include: { person: true, account: true },
      orderBy: { createdAt: "asc" },
    }),
    db.withdrawal.findMany({
      where: {
        OR: [
          { requestedAt: { gte: start, lte: end } },
          { decidedAt: { gte: start, lte: end } },
        ],
      },
      include: { account: { include: { person: true, challengeType: true } } },
      orderBy: { requestedAt: "asc" },
    }),
  ]);

  const excludedTest = input.includeTest
    ? 0
    : await db.payment.count({ where: { createdAt: { gte: start, lte: end }, paymentProvider: TEST_PROVIDER } });

  const paymentRows: PaymentRow[] = payments.map((p) => ({
    orderRef: p.orderRef,
    createdAt: p.createdAt,
    amountPaid: p.amountPaid,
    currency: p.currency,
    paymentProvider: p.paymentProvider,
    status: p.status,
    affiliateCode: p.affiliateCode,
    accountVoided: p.account.voidedAt !== null,
    trader: p.person.fullName,
  }));

  const payouts: PayoutRow[] = payoutRows.map((w) => ({
    id: w.id,
    requestedAt: w.requestedAt,
    decidedAt: w.decidedAt,
    status: w.status,
    amount: w.amount,
    profit: w.profit,
    splitPct: w.splitPct,
    currency: w.account.challengeType.currency,
    trader: w.account.person.fullName,
    orderRef: w.account.orderRef,
    method: w.method,
    providerReference: w.providerReference,
  }));

  // For the summary, an approved payout counts only if it was approved in
  // the period; the ledger keeps everything touched in the period.
  const approvedInPeriod = payouts.filter(
    (p) => !(p.status === "approved" || p.status === "paid") || (p.decidedAt !== null && p.decidedAt >= start && p.decidedAt <= end),
  );

  return { paymentRows, payouts, summary: summarize(paymentRows, approvedInPeriod), excludedTest };
}
