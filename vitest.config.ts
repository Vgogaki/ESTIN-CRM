import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests that need a real database run separately: `npm run test:db`
    // (see vitest.db.config.ts). `npm test` stays fast and needs no database.
    exclude: ["**/node_modules/**", "src/**/*.db.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
