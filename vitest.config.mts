import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Once, before everything: check the test database is up and migrate it.
    globalSetup: ["tests/global-setup.ts"],
    // Before every test file: point DATABASE_URL at the test database, then
    // register the reset that wipes all data before each test.
    setupFiles: ["tests/setup-env.ts", "tests/setup-db.ts"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
