import "dotenv/config";
import { db } from "../src/server/db";
import { createChallengeType, publishChallengeType } from "../src/server/challenge-types";
import { createOrder } from "../src/server/orders";
import { createAffiliate } from "../src/server/affiliates";
import { createCompetition, setCompetitionStatus } from "../src/server/competitions";
import { createCampaign } from "../src/server/offers";
import { createThread } from "../src/server/support";
import { createArticle, setPublished } from "../src/server/training";
import { raiseFlag } from "../src/server/risk";

/**
 * Fills an EMPTY database with obviously fake demo data, so a hosted review
 * copy (docs/hosting-review.md) shows a working system without any real
 * person's data ever leaving the founder's machine.
 *
 * Safety rails, deliberately strict:
 *  - runs only with ALLOW_DEMO_SEED=yes
 *  - refuses if the database contains ANY person who isn't a demo person
 *    (@demo.estin.test), so it can never be pointed at real data by mistake
 *  - does nothing if demo data is already there (safe to run on every start)
 * Every email uses the reserved ".test" domain: nothing here can reach a real inbox.
 */
const DOMAIN = "demo.estin.test";
const IP = "203.0.113.10"; // documentation-only address range (RFC 5737)
const d = (n: number) => n.toFixed(2);

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "yes") {
    console.log("Demo seed skipped (ALLOW_DEMO_SEED is not 'yes').");
    return;
  }
  const real = await db.person.count({ where: { NOT: { email: { endsWith: `@${DOMAIN}` } } } });
  if (real > 0) {
    throw new Error(`Refusing to seed demo data: ${real} real (non-demo) person(s) already exist in this database.`);
  }
  if ((await db.person.count()) > 0) {
    console.log("Demo data already present — nothing to do.");
    return;
  }
  const admin = await db.adminUser.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("Run the base seed first (npm run db:seed): no admin account exists yet.");
  const adminId = admin.id;

  // --- Challenge products: the three launch tiers from decisions.md ---
  const tiers = [
    { name: "25K Challenge", size: 25000, fee: 200 },
    { name: "50K Challenge", size: 50000, fee: 300 },
    { name: "100K Challenge", size: 100000, fee: 500 },
  ];
  const types: Record<string, string> = {};
  for (const t of tiers) {
    const created = await createChallengeType(
      {
        name: t.name,
        description: "Demo product — launch tier",
        productType: "standard",
        accountSize: t.size,
        fee: t.fee,
        currency: "EUR",
        leverageCap: 100,
        permittedInstruments: ["EURUSD", "GBPUSD", "XAUUSD", "US30"],
        kycTiming: "after_evaluation",
        phases: [
          { order: 1, label: "Evaluation", isFunded: false, profitTargetPct: 10, dailyLossPct: 5, maxLossPct: 10, drawdownType: "trailing", minTradingDays: 3 },
          { order: 2, label: "Funded", isFunded: true, dailyLossPct: 5, maxLossPct: 10, drawdownType: "trailing", minTradingDays: 0, profitSplitPct: 80, payoutCycleDays: 14, minPayoutAmount: 50 },
        ],
      },
      adminId,
    );
    await publishChallengeType(created.id, adminId);
    types[t.name] = created.id;
  }

  // --- Traders, each with one account, via the real order intake ---
  // A different documentation-range address per trader: sharing one would make the
  // multiple-account detector (rightly) link everyone to everyone.
  let nextHost = 20;
  const buy = async (ref: string, name: string, slug: string, country: string, tier: string, extra: { affiliateCode?: string; card?: string } = {}) => {
    const t = tiers.find((x) => x.name === tier)!;
    const { account } = await createOrder({
      orderRef: `DEMO-${ref}`,
      fullName: name,
      email: `${slug}@${DOMAIN}`,
      country,
      challengeTypeId: types[tier],
      amountPaid: t.fee,
      currency: "EUR",
      paymentProvider: "demo",
      affiliateCode: extra.affiliateCode ?? null,
      paymentInstrumentRef: extra.card ?? null,
      ipAddress: `203.0.113.${nextHost++}`,
    });
    return { account, size: t.size, personEmail: `${slug}@${DOMAIN}` };
  };
  const setEquity = (id: string, size: number, equity: number, peak: number, days: number) =>
    db.account.update({ where: { id }, data: { equity: d(equity), balance: d(equity), dayStartEquity: d(equity), peakEquity: d(peak), tradingDays: days } });

  // Affiliate first, so a later order can be attributed to it.
  await createAffiliate({ name: "Demo Partner", email: `partner@${DOMAIN}`, code: "DEMO10", commissionPct: "10", note: "Demo affiliate", adminId, ipAddress: IP });

  const alex = await buy("001", "Alex Demo", "alex", "CY", "50K Challenge");
  await setEquity(alex.account.id, alex.size, 52000, 52400, 4); // evaluation, healthy, +4%

  const bianca = await buy("002", "Bianca Demo", "bianca", "GB", "25K Challenge");
  await setEquity(bianca.account.id, bianca.size, 22300, 25000, 2); // below the 10% limit: breached
  await db.account.update({ where: { id: bianca.account.id }, data: { status: "breached", phase: "closed", endedAt: new Date(), closeReason: "Maximum loss limit breached (demo)" } });

  const chris = await buy("003", "Chris Demo", "chris", "DE", "100K Challenge");
  await setEquity(chris.account.id, chris.size, 110500, 110500, 6); // hit the target
  await db.account.update({ where: { id: chris.account.id }, data: { status: "passed", phase: "pass_review" } });

  const dana = await buy("004", "Dana Demo", "dana", "CY", "50K Challenge");
  await setEquity(dana.account.id, dana.size, 53500, 53500, 12);
  const fundedPhase = await db.challengePhase.findFirstOrThrow({ where: { challengeTypeId: types["50K Challenge"], isFunded: true } });
  await db.account.update({ where: { id: dana.account.id }, data: { phase: "funded", currentPhaseId: fundedPhase.id } });
  await db.person.update({ where: { email: dana.personEmail }, data: { kycStatus: "verified" } });
  await db.withdrawal.create({ data: { accountId: dana.account.id, profit: "3500.00", splitPct: "80.00", amount: "2800.00", status: "pending" } });

  const elias = await buy("005", "Elias Demo", "elias", "FR", "25K Challenge");
  await setEquity(elias.account.id, elias.size, 25400, 25400, 1);
  await db.person.update({ where: { email: elias.personEmail }, data: { kycStatus: "submitted" } });

  const fiona = await buy("006", "Fiona Demo", "fiona", "GR", "25K Challenge");
  await setEquity(fiona.account.id, fiona.size, 26200, 26200, 9);
  const funded25 = await db.challengePhase.findFirstOrThrow({ where: { challengeTypeId: types["25K Challenge"], isFunded: true } });
  await db.account.update({ where: { id: fiona.account.id }, data: { phase: "funded", currentPhaseId: funded25.id } }); // funded but KYC not done: shows in Pending tasks

  // Two people paying with the same card: the multiple-account detector links them.
  const gus = await buy("007", "Gus Demo", "gus", "IE", "25K Challenge", { card: "demo-card-fingerprint-1" });
  await setEquity(gus.account.id, gus.size, 25100, 25100, 1);
  const hana = await buy("008", "Hana Demo", "hana", "IE", "25K Challenge", { card: "demo-card-fingerprint-1", affiliateCode: "DEMO10" });
  await setEquity(hana.account.id, hana.size, 24800, 25000, 1);

  // --- Staff-side context ---
  const dana2 = await db.person.findUniqueOrThrow({ where: { email: dana.personEmail } });
  await db.note.create({ data: { personId: dana2.id, authorAdminId: adminId, text: "Demo note: identity documents checked, payout request looks routine." } });
  const bianca2 = await db.person.findUniqueOrThrow({ where: { email: bianca.personEmail } });
  await raiseFlag({ personId: bianca2.id, severity: "low", summary: "Demo flag: two breaches in a short period, worth a look.", adminId, ipAddress: IP });

  // --- Offers ---
  const now = Date.now();
  await createCampaign({
    name: "Comeback 20%",
    code: "COMEBACK20",
    discountType: "percent",
    discountValue: 20,
    audience: "breached_traders",
    challengeTypeFamilyId: null,
    validFrom: new Date(now - 86_400_000),
    validTo: new Date(now + 60 * 86_400_000),
    maxUses: 50,
    sendDelayDays: 3,
    adminId,
    ipAddress: IP,
  });

  // --- A free-entry competition with a few entrants ---
  const comp = await createCompetition({
    name: "Demo Cup",
    startDate: new Date(now - 3 * 86_400_000),
    endDate: new Date(now + 27 * 86_400_000),
    entryFee: 0,
    currency: "EUR",
    entrantCap: null,
    demoAccountSize: 10000,
    minTradesToQualify: 5,
    rankingMetric: "return_pct",
    tieBreakerRule: "Earliest to reach the qualifying return wins (demo rule).",
    prizeLadder: [
      { rank: 1, type: "cash", description: "€500", cashValue: 500 },
      { rank: 2, type: "free_challenge", description: "Free 25K Challenge" },
    ],
    adminId,
    ipAddress: IP,
  });
  await setCompetitionStatus({ competitionId: comp.id, status: "active", adminId, ipAddress: IP });
  const entrants: [string, number, number][] = [[alex.personEmail, 10850, 14], [dana.personEmail, 10420, 9], [gus.personEmail, 11200, 3], [hana.personEmail, 9900, 7]];
  for (const [email, equity, trades] of entrants) {
    const p = await db.person.findUniqueOrThrow({ where: { email } });
    await db.competitionEntry.create({ data: { competitionId: comp.id, personId: p.id, entryPaidAmount: "0.00", equity: d(equity), tradesCount: trades } });
  }

  // --- A support conversation and a training article ---
  const alexP = await db.person.findUniqueOrThrow({ where: { email: alex.personEmail } });
  await createThread({
    personId: alexP.id,
    subject: "Question about the trailing loss limit",
    category: "account",
    body: "Hi, does the trailing maximum loss limit move up when my open trades are in profit? (Demo message.)",
    files: [],
    ipAddress: IP,
  });
  const article = await createArticle({
    section: "risk_management",
    title: "Staying inside your daily loss limit",
    summary: "A short guide to the daily loss rule.",
    body: "Your daily loss limit is measured from your equity at the start of the trading day.\n\nWatch open positions as well as closed trades: the limit is checked against equity. (Demo article.)",
    videoUrl: null,
    sortOrder: 0,
    adminId,
    ipAddress: IP,
  });
  await setPublished({ id: article.id, published: true, adminId, ipAddress: IP });

  console.log("Demo data created: 3 challenge products, 8 traders, 1 affiliate, 1 competition, 1 offer campaign, 1 support thread, 1 article.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
