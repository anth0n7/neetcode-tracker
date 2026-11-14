import path from "node:path";
import { count } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { problems } from "../db/schema";
import { databaseFile } from "../lib/database-file";
import { assertSeedAllowed, readSeedFile, upsertProblems } from "../lib/seed";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tsx scripts/seed.ts <file>");

  const entries = readSeedFile(file);
  assertSeedAllowed(file, databaseFile());

  const { db, getClient } = await import("../lib/db");
  const client = getClient();
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await upsertProblems(db, entries);
    const [{ n }] = await db.select({ n: count() }).from(problems);
    const name = path.basename(databaseFile());
    console.log(`seed: upserted ${entries.length} entries into ${name}; problems table now has ${n} rows`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(`seed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
