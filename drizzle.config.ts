import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Settings for drizzle-kit, the tool that generates and applies migrations.
//
// Drizzle runs outside Next, so load the env file ourselves.
// DB_ENV=dev -> .env.development.local (neetcode_tracker_dev)
// otherwise  -> .env.local             (neetcode_tracker)
loadEnvConfig(process.cwd(), process.env.DB_ENV === "dev");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export default defineConfig({
  dialect: "postgresql",
  // Where the tables are defined, and where generated SQL migrations go.
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
