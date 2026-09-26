import { PgBoss } from "pg-boss";
import { runExpirySweep } from "@/server/jobs/expire-accounts";
import { drainOutbox } from "@/server/email/outbox";

const EXPIRY_QUEUE = "account-expiry-sweep";
// Every 15 minutes — frequent enough that a closed account shows up
// promptly, infrequent enough not to matter if a run is briefly missed.
const EXPIRY_CRON = "*/15 * * * *";

const EMAIL_QUEUE = "email-outbox-drain";
const EMAIL_CRON = "* * * * *"; // every minute

let bossPromise: Promise<PgBoss> | null = null;

/**
 * First use of pg-boss in this codebase (CLAUDE.md's confirmed stack lists
 * it for scheduled jobs; module 3.5 is the first module that needs one).
 * pg-boss manages its own schema in the same Postgres database and is
 * safe to start from every server instance — schedule() upserts, and
 * multiple work() workers pulling the same queue is the intended,
 * exactly-once-delivery design (SKIP LOCKED under the hood), so this
 * doesn't need special handling if the app is ever scaled to more than
 * one instance.
 */
function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss(process.env.DATABASE_URL!);
      boss.on("error", (err) => console.error("[pg-boss]", err));

      await boss.start();
      await boss.createQueue(EXPIRY_QUEUE);
      await boss.schedule(EXPIRY_QUEUE, EXPIRY_CRON);
      await boss.work(EXPIRY_QUEUE, async () => {
        const result = await runExpirySweep();
        if (result.closed > 0) {
          console.log(
            `[account-expiry-sweep] closed ${result.closed} of ${result.checked} candidate account(s)`,
          );
        }
      });

      // Email outbox: retries anything that failed to send the first time.
      await boss.createQueue(EMAIL_QUEUE);
      await boss.schedule(EMAIL_QUEUE, EMAIL_CRON);
      await boss.work(EMAIL_QUEUE, async () => {
        const result = await drainOutbox();
        if (result.sent + result.failed > 0) {
          console.log(`[email-outbox] sent ${result.sent}, failed ${result.failed}`);
        }
      });

      return boss;
    })();
  }
  return bossPromise;
}

/** Called once from src/instrumentation.ts when the server process boots. */
export async function startScheduledJobs() {
  await getBoss();
}
