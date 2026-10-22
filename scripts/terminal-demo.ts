import "dotenv/config";
import { Prisma } from "@prisma/client";
import { db } from "../src/server/db";
import { SimulatedProvider } from "../src/server/trading/providers";
import { runPriceCycle, seedInstruments, getFreshPrices } from "../src/server/trading/price-service";
import { closePosition, getAccountSnapshot, placeMarketOrder, processStops } from "../src/server/trading/trading";

/**
 * Watch the simulated trading engine work, from the command line (no screen yet):
 *   prices arrive and are checked, a trade opens, equity moves with the price, a
 *   stop-loss is hit, a bad price spike is refused, a trade is closed by hand.
 *
 * It WRITES DATA (a demo challenge, trader, account, prices and positions), so it
 * only runs against a database that is clearly a test one: a name containing
 * "estin_test_", or when ALLOW_TERMINAL_DEMO=yes is set deliberately.
 *
 *   npx tsx scripts/terminal-demo.ts
 */
const dbName = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] ?? "";
if (!dbName.includes("estin_test_") && process.env.ALLOW_TERMINAL_DEMO !== "yes") {
  console.error(`Refusing to run against "${dbName}": it writes demo data. Use a throwaway database, or set ALLOW_TERMINAL_DEMO=yes if you really mean it.`);
  process.exit(1);
}

// A weekday midday so the markets are open, whatever day you run this.
const now0 = new Date();
const daysToTuesday = (2 - now0.getUTCDay() + 7) % 7 || 7;
let clock = new Date(Date.UTC(now0.getUTCFullYear(), now0.getUTCMonth(), now0.getUTCDate() + daysToTuesday, 12, 0, 0)); // next Tuesday, midday UTC
const tick = (s = 2) => (clock = new Date(clock.getTime() + s * 1000));

const money = (v: Prisma.Decimal | string) => `${new Prisma.Decimal(v).toFixed(2)} EUR`;
const line = (s: string) => console.log(s);
const heading = (s: string) => console.log(`\n=== ${s}`);

async function main() {
  await seedInstruments();
  const provider = new SimulatedProvider(2026);

  const ct = await db.challengeType.create({
    data: { familyId: `demo-${Date.now()}`, version: 1, name: "Demo 100K", accountSize: 100000, fee: 500, leverageCap: 100, permittedInstruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"], active: true },
  });
  const person = await db.person.create({ data: { fullName: "Demo Trader", email: `demo-${Date.now()}@terminal.test`, country: "CY" } });
  const account = await db.account.create({
    data: { personId: person.id, challengeTypeId: ct.id, orderRef: `demo-${Date.now()}`, equity: 100000, balance: 100000, dayStartEquity: 100000, peakEquity: 100000 },
  });
  const ids = { accountId: account.id, personId: person.id, ipAddress: "127.0.0.1" };

  heading("1. Prices arrive (simulated feed), are checked and stored");
  for (let i = 0; i < 3; i++) {
    const r = await runPriceCycle(provider, tick());
    line(`   poll ${i + 1}: accepted ${r.accepted}, held as suspect ${r.suspect}, rejected ${r.rejected}, unchanged ${r.unchanged}`);
  }
  const prices = await getFreshPrices(clock);
  const q = prices.quotes.EURUSD;
  line(`   EURUSD  bid ${q.bid}  ask ${q.ask}   (stored as price #${q.tickId.slice(-6)})`);

  heading("2. Open a trade: buy 1 lot EURUSD, stop-loss 20 pips below, take-profit 200 pips above");
  const sl = q.ask.minus("0.0020");
  const tp = q.ask.plus("0.0200");
  const pos = await placeMarketOrder({ ...ids, symbol: "EURUSD", side: "buy", lots: 1, stopLoss: sl.toString(), takeProfit: tp.toString(), now: clock });
  line(`   filled at ${pos.openPrice} (the ask, so the trade starts a spread down); margin held ${money(pos.marginUsed)}`);
  line(`   stop-loss ${sl}   take-profit ${tp}`);

  heading("3. The price moves: equity follows");
  for (const mid of [1.1850, 1.1880, 1.1920]) {
    provider.force("EURUSD", mid);
    await runPriceCycle(provider, tick(8));
    await runPriceCycle(provider, tick(2)); // a second price confirms a larger move
    const s = await getAccountSnapshot(account.id, clock);
    line(`   EURUSD ${mid.toFixed(4)}  ->  floating ${money(s.floatingPnl)}   equity ${money(s.equity)}   free margin ${money(s.freeMargin)}`);
  }

  heading("4. A bad price spike (EURUSD jumps 5% for one tick, then snaps back) is NOT used");
  provider.force("EURUSD", 1.2500);
  const spike = await runPriceCycle(provider, tick(8));
  provider.force("EURUSD", 1.1921);
  await runPriceCycle(provider, tick(2));
  const used = (await getFreshPrices(clock)).mids.EURUSD;
  line(`   spike: accepted ${spike.accepted}, held as suspect ${spike.suspect}.  Price in use afterwards: ${used.toFixed(4)} (the spike never touched the account)`);
  await processStops(clock);
  line(`   position still open: ${(await db.tradePosition.findUniqueOrThrow({ where: { id: pos.id } })).status === "open"}`);

  heading("5. Price falls through the stop-loss: the trade is closed automatically");
  provider.force("EURUSD", 1.1790);
  await runPriceCycle(provider, tick(8));
  await runPriceCycle(provider, tick(2));
  const stopped = await processStops(clock);
  const closed = await db.tradePosition.findUniqueOrThrow({ where: { id: pos.id } });
  line(`   stops processed: ${stopped.closed} closed`);
  line(`   closed by ${closed.closeReason} at ${closed.closePrice} (the price that hit the stop, not the ${sl} level)`);
  line(`   profit/loss ${money(closed.grossPnl!)}`);
  line(`   balance now ${money((await db.account.findUniqueOrThrow({ where: { id: account.id } })).balance)}`);

  heading("6. A second trade, closed by hand");
  const pos2 = await placeMarketOrder({ ...ids, symbol: "XAUUSD", side: "sell", lots: 0.5, now: clock });
  provider.force("XAUUSD", 2331);
  await runPriceCycle(provider, tick(8));
  await runPriceCycle(provider, tick(2));
  const c2 = await closePosition({ accountId: account.id, positionId: pos2.id, actor: { type: "trader", personId: person.id }, now: clock });
  line(`   sold 0.5 lot gold at ${pos2.openPrice}, closed at ${c2.closePrice}: ${money(c2.grossPnl)}`);
  line(`   balance now ${money((await db.account.findUniqueOrThrow({ where: { id: account.id } })).balance)}`);

  heading("7. Every fill is traceable to a stored price");
  const row = await db.tradePosition.findUniqueOrThrow({ where: { id: pos.id } });
  const open = await db.priceTick.findUniqueOrThrow({ where: { id: row.openTickId } });
  const close = await db.priceTick.findUniqueOrThrow({ where: { id: row.closeTickId! } });
  line(`   opened on price #${open.id.slice(-6)}: ask ${open.ask} at ${open.receivedAt.toISOString()}`);
  line(`   closed on price #${close.id.slice(-6)}: bid ${close.bid} at ${close.receivedAt.toISOString()}`);

  const counts = await db.priceTick.groupBy({ by: ["status"], _count: { _all: true } });
  line(`\nStored prices: ${counts.map((c) => `${c._count._all} ${c.status}`).join(", ")}. None can be edited or deleted.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
