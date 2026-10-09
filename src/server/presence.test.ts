import { describe, expect, it } from "vitest";
import { presenceLabel, presenceState } from "./presence";

const NOW = new Date("2026-10-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("presenceState", () => {
  it("is online within three minutes, including a timestamp slightly in the future", () => {
    expect(presenceState(ago(0), NOW)).toBe("online");
    expect(presenceState(ago(3 * MIN), NOW)).toBe("online");
    expect(presenceState(ago(-20_000), NOW)).toBe("online");
  });
  it("is recent up to an hour, then away", () => {
    expect(presenceState(ago(3 * MIN + 1), NOW)).toBe("recent");
    expect(presenceState(ago(59 * MIN), NOW)).toBe("recent");
    expect(presenceState(ago(HOUR), NOW)).toBe("away");
  });
  it("is never when they haven't done anything yet", () => {
    expect(presenceState(null, NOW)).toBe("never");
  });
});

describe("presenceLabel", () => {
  it("reads naturally at each scale", () => {
    expect(presenceLabel(ago(30_000), NOW)).toBe("Active now");
    expect(presenceLabel(ago(12 * MIN), NOW)).toBe("Active 12 min ago");
    expect(presenceLabel(ago(5 * HOUR + 10 * MIN), NOW)).toBe("Active 5 h ago");
    expect(presenceLabel(ago(DAY), NOW)).toBe("Last seen 1 day ago");
    expect(presenceLabel(ago(3 * DAY), NOW)).toBe("Last seen 3 days ago");
    expect(presenceLabel(null, NOW)).toBe("Not signed in yet");
  });
});
