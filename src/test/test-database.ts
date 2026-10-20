import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * A throwaway Postgres database for tests that need real transactions and row
 * locks. Built by running the project's own migration files in order, so it has
 * exactly the production schema, including the append-only audit trigger and
 * the one-pending-payout-per-account index.
 *
 * Safety: refuses to run unless DATABASE_URL points at this machine, and only
 * ever creates and drops a database it named itself ("estin_test_...").
 */
export type TestDatabase = { url: string; drop: () => Promise<void> };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export async function createTestDatabase(): Promise<TestDatabase> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set — start the local database (npm run db:up) and check .env.");

  const baseUrl = new URL(base);
  if (!LOCAL_HOSTS.has(baseUrl.hostname)) {
    throw new Error(`Refusing to run database tests against "${baseUrl.hostname}": they only run against a local database.`);
  }

  const name = `estin_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const testUrl = new URL(base);
  testUrl.pathname = `/${name}`;

  const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const client = new Client({ connectionString: testUrl.toString() });
  await client.connect();
  try {
    for (const folder of folders) {
      const sql = readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }

  return {
    url: testUrl.toString(),
    drop: async () => {
      const cleanup = new Client({ connectionString: base });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
