import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { amountDueFor, CHECKOUT_TTL_MS, checkoutExpiry, chooseBestOffer, formatMoney, isCheckoutExpired } from "./checkout-pricing";
import { maxActiveAccounts, paymentMode, purchasesAvailable } from "./payments/driver";

const d = (v: string) => new Prisma.Decimal(v);

describe("amountDueFor", () => {
  it("is the normal fee when there is no offer", () => {
    expect(amountDueFor(d("300"), null).toString()).toBe("300");
  });
  it("is the offer price when there is one", () => {
    expect(amountDueFor(d("300"), { offerFee: d("225") }).toString()).toBe("225");
  });
  it("never charges more than the normal fee, even for an offer issued against a dearer version", () => {
    expect(amountDueFor(d("200"), { offerFee: d("260") }).toString()).toBe("200");
  });
  it("never goes below zero", () => {
    expect(amountDueFor(d("200"), { offerFee: d("-5") }).toString()).toBe("0");
  });
  it("is exact to the cent, with no floating-point error", () => {
    expect(amountDueFor(d("0.30"), { offerFee: d("0.1") }).plus(d("0.2")).toString()).toBe("0.3");
  });
});

describe("chooseBestOffer", () => {
  it("picks the cheapest of several", () => {
    const best = chooseBestOffer([{ id: "a", offerFee: d("250") }, { id: "b", offerFee: d("180") }, { id: "c", offerFee: d("210") }]);
    expect(best?.id).toBe("b");
  });
  it("is null with no offers", () => {
    expect(chooseBestOffer([])).toBeNull();
  });
});

describe("checkout timing", () => {
  const now = new Date("2026-10-22T10:00:00Z");
  it("expires after the set time", () => {
    expect(checkoutExpiry(now).getTime() - now.getTime()).toBe(CHECKOUT_TTL_MS);
  });
  it("is expired at and after the expiry, not before", () => {
    const exp = checkoutExpiry(now);
    expect(isCheckoutExpired(exp, new Date(exp.getTime() - 1))).toBe(false);
    expect(isCheckoutExpired(exp, exp)).toBe(true);
    expect(isCheckoutExpired(exp, new Date(exp.getTime() + 1))).toBe(true);
  });
});

describe("formatMoney", () => {
  it("groups thousands and always shows cents", () => {
    expect(formatMoney(d("1250"), "EUR")).toBe("1,250.00 EUR");
    expect(formatMoney(d("299.9"), "EUR")).toBe("299.90 EUR");
    expect(formatMoney(d("1234567.5"), "USD")).toBe("1,234,567.50 USD");
  });
});

describe("maxActiveAccounts (a setting, off by default)", () => {
  it("is no limit unless a positive whole number is set", () => {
    expect(maxActiveAccounts({})).toBeNull();
    expect(maxActiveAccounts({ MAX_ACTIVE_ACCOUNTS: "" })).toBeNull();
    expect(maxActiveAccounts({ MAX_ACTIVE_ACCOUNTS: "0" })).toBeNull();
    expect(maxActiveAccounts({ MAX_ACTIVE_ACCOUNTS: "abc" })).toBeNull();
    expect(maxActiveAccounts({ MAX_ACTIVE_ACCOUNTS: "-3" })).toBeNull();
    expect(maxActiveAccounts({ MAX_ACTIVE_ACCOUNTS: "2.5" })).toBeNull();
  });
  it("reads a positive whole number", () => {
    expect(maxActiveAccounts({ MAX_ACTIVE_ACCOUNTS: "5" })).toBe(5);
    expect(maxActiveAccounts({ MAX_ACTIVE_ACCOUNTS: " 3 " })).toBe(3);
  });
});

describe("payment mode (fails closed)", () => {
  it("is off unless explicitly set to demo", () => {
    expect(paymentMode({})).toBe("none");
    expect(paymentMode({ PAYMENT_DRIVER: "" })).toBe("none");
    expect(paymentMode({ PAYMENT_DRIVER: "stripe" })).toBe("none");
    expect(paymentMode({ PAYMENT_DRIVER: "DEMO" })).toBe("none");
  });
  it("is on for demo", () => {
    expect(paymentMode({ PAYMENT_DRIVER: "demo" })).toBe("demo");
    expect(purchasesAvailable({ PAYMENT_DRIVER: "demo" })).toBe(true);
    expect(purchasesAvailable({})).toBe(false);
  });
});
