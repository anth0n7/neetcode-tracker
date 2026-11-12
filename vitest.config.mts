import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Points DATABASE_URL at the DEV database before any test runs.
    setupFiles: ["tests/setup-env.ts"],
    // Several test files share the dev database, so run them one at a time.
    fileParallelism: false,
  },
});
