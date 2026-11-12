// Runs before every test file. It forces DATABASE_URL to the DEV database, so
// no test can ever reach the real one through lib/db.ts, whatever else is set.
import { readFileSync } from "node:fs";
import path from "node:path";

const text = readFileSync(path.join(process.cwd(), ".env.development.local"), "utf8");
const url = text.match(/^DATABASE_URL=(.+)$/m)?.[1].trim();

if (!url || !new URL(url).pathname.endsWith("_dev")) {
  throw new Error("tests/setup-env.ts: .env.development.local must point at a *_dev database");
}
process.env.DATABASE_URL = url;
