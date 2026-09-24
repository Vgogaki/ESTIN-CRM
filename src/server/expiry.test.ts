import { describe, expect, it } from "vitest";
import { daysRemaining, isPhaseExpired } from "./expiry";

const day = 24 * 60 * 60 * 1000;
const started = new Date("2026-01-01T00:00:00.000Z");

describe("isPhaseExpired", () => {
  it("never expires when there is no time limit", () => {
    expect(isPhaseExpired({ timeLimitDays: null, phaseStartedAt: started, now: new Date("2099-01-01T00:00:00.000Z") })).toBe(false);
  });

  it("does not expire the moment before the deadline", () => {
    const now = new Date(started.getTime() + 5 * day - 1);
    expect(isPhaseExpired({ timeLimitDays: 5, phaseStartedAt: started, now })).toBe(false);
  });

  it("expires exactly at the deadline", () => {
    const now = new Date(started.getTime() + 5 * day);
    expect(isPhaseExpired({ timeLimitDays: 5, phaseStartedAt: started, now })).toBe(true);
  });

  it("expires well after the deadline", () => {
    const now = new Date(started.getTime() + 20 * day);
    expect(isPhaseExpired({ timeLimitDays: 5, phaseStartedAt: started, now })).toBe(true);
  });

  it("does not expire on day zero", () => {
    const now = new Date(started.getTime() + 1000);
    expect(isPhaseExpired({ timeLimitDays: 5, phaseStartedAt: started, now })).toBe(false);
  });
});

describe("daysRemaining", () => {
  it("returns null when there is no time limit", () => {
    expect(daysRemaining({ timeLimitDays: null, phaseStartedAt: started, now: started })).toBeNull();
  });

  it("returns the full limit right at phase start", () => {
    expect(daysRemaining({ timeLimitDays: 5, phaseStartedAt: started, now: started })).toBe(5);
  });

  it("counts down as time passes, rounding up a partial day", () => {
    const now = new Date(started.getTime() + 2 * day + 1000);
    expect(daysRemaining({ timeLimitDays: 5, phaseStartedAt: started, now })).toBe(3);
  });

  it("floors at zero once the deadline has passed", () => {
    const now = new Date(started.getTime() + 20 * day);
    expect(daysRemaining({ timeLimitDays: 5, phaseStartedAt: started, now })).toBe(0);
  });
});
