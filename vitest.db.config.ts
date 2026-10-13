import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Database tests (`npm run test:db`): they exercise real transactions and row
 * locks against a real Postgres, so they cannot run as pure unit tests. Each
 * test file creates its own throwaway database from the migration files and
 * drops it afterwards (src/test/test-database.ts) — nothing touches your
 * development data. Needs the local database container running (`npm run db:up`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
