import { describe, expect, it } from "vitest";
import { DEFAULT_INSTRUMENTS, specFrom } from "./instruments";
import { parseTraderMadeLive, priceProviderFromEnv, SimulatedProvider, TraderMadeProvider } from "./providers";

const specs = DEFAULT_INSTRUMENTS.map(specFrom);
const NOW = new Date("2026-10-20T12:00:00Z");

// The example response from TraderMade's own API description (docs: /live), plus one we don't trade and one error entry.
const LIVE = {
  endpoint: "live",
  quotes: [
    { ask: 1.18183, base_currency: "EUR", bid: 1.18181, mid: 1.18182, quote_currency: "USD" },
    { ask: 1.31705, base_currency: "GBP", bid: 1.31704, mid: 1.31705, quote_currency: "USD" },
    { ask: 8546.9, bid: 8546.1, instrument: "UK100", mid: 8546.5 },
    { ask: 0.9, base_currency: "EUR", bid: 0.89, quote_currency: "CHF", mid: 0.895 },
    { error: 400, instrument: "XYZ", message: "currency code is either invalid or not covered in the plan" },
  ],
  requested_time: "Fri, 13 Nov 2020 11:42:51 GMT",
  timestamp: 1605267771,
};

describe("parseTraderMadeLive", () => {
  it("reads forex pairs and CFDs, uses the response timestamp, and skips instruments we don't trade and error entries", () => {
    const q = parseTraderMadeLive(LIVE, specs, NOW);
    expect(q.map((x) => x.symbol)).toEqual(["EURUSD", "GBPUSD", "UK100"]);
    expect(q[0].bid.toString()).toBe("1.18181");
    expect(q[0].ask.toString()).toBe("1.18183");
    expect(q[2].bid.toString()).toBe("8546.1");
    expect(q[0].quoteTs.toISOString()).toBe(new Date(1605267771 * 1000).toISOString());
  });
  it("falls back to the time we received it if the response has no timestamp", () => {
    const q = parseTraderMadeLive({ quotes: LIVE.quotes }, specs, NOW);
    expect(q[0].quoteTs).toEqual(NOW);
  });
  it("ignores entries whose prices are not numbers", () => {
    const q = parseTraderMadeLive({ timestamp: 1, quotes: [{ base_currency: "EUR", quote_currency: "USD", bid: "1.1", ask: null }] }, specs, NOW);
    expect(q).toEqual([]);
  });
  it("refuses something that is not a price list at all", () => {
    expect(() => parseTraderMadeLive(null, specs, NOW)).toThrow();
    expect(() => parseTraderMadeLive({ error: "nope" }, specs, NOW)).toThrow(/no quotes/);
  });
  it("maps through a different provider symbol", () => {
    const s = specs.map((x) => (x.symbol === "US30" ? { ...x, providerSymbol: "DJI" } : x));
    const q = parseTraderMadeLive({ timestamp: 1, quotes: [{ instrument: "DJI", bid: 39000, ask: 39002, mid: 39001 }] }, s, NOW);
    expect(q[0].symbol).toBe("US30");
  });
});

describe("TraderMadeProvider", () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it("asks for all instruments in one call, with the key, and returns the quotes", async () => {
    let seen = "";
    const fetchFn = (async (url: string) => {
      seen = url;
      return new Response(JSON.stringify(LIVE), { status: 200 });
    }) as unknown as typeof fetch;
    const q = await new TraderMadeProvider("SECRETKEY", fetchFn).fetchQuotes(specs, NOW);
    expect(seen).toContain("/live?currency=EURUSD%2CGBPUSD");
    expect(seen).toContain("api_key=SECRETKEY");
    expect(q.length).toBe(3);
  });
  it("never puts the key in an error message", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed for https://marketdata.tradermade.com/api/v1/live?api_key=SECRETKEY");
    }) as unknown as typeof fetch;
    await expect(new TraderMadeProvider("SECRETKEY", down).fetchQuotes(specs, NOW)).rejects.toThrow(/Could not reach TraderMade/);
    try {
      await new TraderMadeProvider("SECRETKEY", down).fetchQuotes(specs, NOW);
    } catch (e) {
      expect(String(e)).not.toContain("SECRETKEY");
    }
  });
  it("reports a bad status without the URL", async () => {
    const bad = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(new TraderMadeProvider("SECRETKEY", bad).fetchQuotes(specs, NOW)).rejects.toThrow(/status 401/);
  });
  it("makes no call with nothing to ask for", async () => {
    expect(await new TraderMadeProvider("k", ok(LIVE)).fetchQuotes([], NOW)).toEqual([]);
  });
});

describe("SimulatedProvider", () => {
  it("gives a sensible bid and ask for every instrument, ask above bid", async () => {
    const q = await new SimulatedProvider(1).fetchQuotes(specs, NOW);
    expect(q.length).toBe(specs.length);
    for (const x of q) expect(x.ask.greaterThan(x.bid)).toBe(true);
  });
  it("is repeatable with the same seed, and steps are small", async () => {
    const a = new SimulatedProvider(7);
    const b = new SimulatedProvider(7);
    const qa = await a.fetchQuotes(specs, NOW);
    const qb = await b.fetchQuotes(specs, NOW);
    expect(qa.map((x) => x.bid.toString())).toEqual(qb.map((x) => x.bid.toString()));
    const eur = qa.find((x) => x.symbol === "EURUSD")!;
    expect(eur.bid.minus("1.18").abs().lessThan("0.01")).toBe(true);
  });
  it("can be told to land exactly on a price, once", async () => {
    const p = new SimulatedProvider(3);
    await p.fetchQuotes(specs, NOW);
    p.force("EURUSD", 1.2);
    const q = (await p.fetchQuotes(specs, NOW)).find((x) => x.symbol === "EURUSD")!;
    expect(q.bid.plus(q.ask).dividedBy(2).toFixed(4)).toBe("1.2000");
  });
});

describe("priceProviderFromEnv", () => {
  it("is off unless asked for", () => {
    expect(priceProviderFromEnv({})).toBeNull();
    expect(priceProviderFromEnv({ PRICE_DRIVER: "" })).toBeNull();
    expect(priceProviderFromEnv({ PRICE_DRIVER: "nonsense" })).toBeNull();
  });
  it("builds the simulated one", () => {
    expect(priceProviderFromEnv({ PRICE_DRIVER: "simulated" })?.name).toBe("simulated");
  });
  it("TraderMade needs its key, and says so", () => {
    expect(() => priceProviderFromEnv({ PRICE_DRIVER: "tradermade" })).toThrow(/TRADERMADE_API_KEY/);
    expect(priceProviderFromEnv({ PRICE_DRIVER: "tradermade", TRADERMADE_API_KEY: "k" })?.name).toBe("tradermade");
  });
});
