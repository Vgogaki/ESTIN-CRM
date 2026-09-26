import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prizeCostCommitted, rankEntries, type PrizeLadderEntry } from "./competitions";

const { Decimal } = Prisma;
const d = (n: number) => new Decimal(n);

function entry(personId: string, equity: number, tradesCount: number) {
  return { personId, fullName: personId, equity: d(equity), tradesCount };
}

describe("rankEntries", () => {
  it("ranks qualified entrants by return %, best first", () => {
    const { ranked } = rankEntries({
      entries: [entry("a", 11000, 5), entry("b", 12000, 5), entry("c", 10500, 5)],
      demoAccountSize: d(10000),
      rankingMetric: "return_pct",
      minTradesToQualify: 3,
    });
    expect(ranked.map((r) => r.personId)).toEqual(["b", "a", "c"]);
    expect(ranked[0].rank).toBe(1);
  });

  it("ranks by absolute P&L when that's the metric", () => {
    const { ranked } = rankEntries({
      entries: [entry("a", 10500, 5), entry("b", 10800, 5)],
      demoAccountSize: d(10000),
      rankingMetric: "absolute_pnl",
      minTradesToQualify: 0,
    });
    expect(ranked[0].personId).toBe("b");
    expect(ranked[0].metricValue.toNumber()).toBe(800);
  });

  it("excludes entrants below the minimum trades to qualify from the ranked board", () => {
    const { ranked, notYetQualified } = rankEntries({
      entries: [entry("a", 15000, 1), entry("b", 11000, 5)],
      demoAccountSize: d(10000),
      rankingMetric: "return_pct",
      minTradesToQualify: 3,
    });
    // "a" has a single huge position but hasn't qualified — the anti-lottery control spec §7.2 describes.
    expect(ranked.map((r) => r.personId)).toEqual(["b"]);
    expect(notYetQualified.map((e) => e.personId)).toEqual(["a"]);
  });

  it("gives tied entrants the same rank, and the next distinct value skips ahead", () => {
    const { ranked } = rankEntries({
      entries: [entry("a", 11000, 5), entry("b", 11000, 5), entry("c", 10500, 5)],
      demoAccountSize: d(10000),
      rankingMetric: "return_pct",
      minTradesToQualify: 0,
    });
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it("qualifies at exactly the minimum trade count, not only above it", () => {
    const { ranked, notYetQualified } = rankEntries({
      entries: [entry("a", 11000, 3)],
      demoAccountSize: d(10000),
      rankingMetric: "return_pct",
      minTradesToQualify: 3,
    });
    expect(ranked).toHaveLength(1);
    expect(notYetQualified).toHaveLength(0);
  });
});

describe("prizeCostCommitted", () => {
  it("sums only cash prize entries", () => {
    const ladder: PrizeLadderEntry[] = [
      { rank: 1, type: "cash", description: "First place cash", cashValue: 1000 },
      { rank: 2, type: "funded_account", description: "Funded account" },
      { rank: 3, type: "cash", description: "Third place cash", cashValue: 250 },
    ];
    expect(prizeCostCommitted(ladder).toNumber()).toBe(1250);
  });

  it("is zero when there are no cash prizes", () => {
    const ladder: PrizeLadderEntry[] = [{ rank: 1, type: "free_challenge", description: "Free challenge" }];
    expect(prizeCostCommitted(ladder).toNumber()).toBe(0);
  });
});
