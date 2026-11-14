import { rmSync } from "node:fs";
import path from "node:path";
import { addDays } from "../lib/scheduler";
import { todayLocal } from "../lib/today";

const FILE = path.resolve("data/sandbox.db");

const SAMPLE_ATTEMPTS: [problemId: number, daysAgo: number][] = [
  [1, 40], [1, 39], [1, 33], [1, 10],
  [2, 12], [2, 3],
  [3, 0], [3, 0],
  [4, 6], [5, 2], [6, 2], [7, 1],
  [8, 5], [8, 0],
  [9, 9], [10, 1], [11, 1], [12, 1],
];

async function main() {
  // Start from an empty file so running this twice does not double the sample attempts.
  rmSync(FILE, { force: true });
  process.env.DATABASE_PATH = FILE;

  const { db, getClient } = await import("../lib/db");
  const client = getClient();
  const { prepareDatabase } = await import("../lib/startup");
  const { logAttempt } = await import("../lib/attempts");
  const today = todayLocal();
  try {
    await prepareDatabase({
      client,
      file: FILE,
      migrationsFolder: path.resolve("drizzle"),
      seedFile: path.resolve("data/neetcode250.json"),
      today,
    });
    for (const [problemId, daysAgo] of SAMPLE_ATTEMPTS) {
      await logAttempt(problemId, { rating: "easy", minutes: null, insight: null, attemptedOn: addDays(today, -daysAgo) }, db);
    }
    console.log(`sandbox: ${FILE} now has the 250 problems and ${SAMPLE_ATTEMPTS.length} sample attempts`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
