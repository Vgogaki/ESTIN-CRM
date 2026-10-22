import { priceProviderFromEnv } from "./providers";
import { runPriceCycle } from "./price-service";
import { processStops } from "./trading";

/**
 * The background loop: every few seconds, fetch prices, check and store them, then
 * close any position whose stop-loss or take-profit the new price has reached.
 *
 * Off unless PRICE_DRIVER is set (tradermade or simulated), so nothing runs, and
 * nothing is stored, on a copy that hasn't asked for prices. Started once per server
 * process from src/instrumentation.ts. Several copies of the app can run it at once:
 * storing prices takes a database lock and duplicates are ignored, and closing a
 * position is idempotent.
 *
 * Failures are logged, not thrown, and logged sparingly: a provider outage would
 * otherwise write a line every two seconds.
 */
let started = false;

export function startPriceService(): void {
  if (started) return;
  let provider;
  try {
    provider = priceProviderFromEnv();
  } catch (err) {
    console.error("[price-service] not started:", err instanceof Error ? err.message : err);
    return;
  }
  if (!provider) return;
  started = true;

  const requested = Number(process.env.PRICE_POLL_MS);
  const everyMs = Number.isFinite(requested) && requested >= 500 ? requested : 2000;
  let busy = false;
  let consecutiveFailures = 0;

  console.log(`[price-service] started: ${provider.name}, every ${everyMs} ms`);
  const timer = setInterval(async () => {
    if (busy) return; // a slow provider must not pile up calls
    busy = true;
    try {
      await runPriceCycle(provider);
      await processStops();
      if (consecutiveFailures > 0) console.log(`[price-service] recovered after ${consecutiveFailures} failed poll(s)`);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      // Log the first failure, then the 10th, 100th... not every one.
      if (consecutiveFailures === 1 || consecutiveFailures === 10 || consecutiveFailures % 100 === 0) {
        console.error(`[price-service] poll failed (${consecutiveFailures} in a row):`, err instanceof Error ? err.message : err);
      }
    } finally {
      busy = false;
    }
  }, everyMs);
  timer.unref?.();
}
