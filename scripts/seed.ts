// Loads a list of problems into the database.
//
// Usage: tsx scripts/seed.ts <file> [--dev]
//   <file>  the JSON list to load (data/neetcode250.json or data/fixture.json)
//   --dev   use the dev database (.env.development.local) instead of the real one
//
// Safe to run again and again: it "upserts" by id (inserts new problems,
// updates existing ones) and only writes the seed fields, so your attempts,
// review state and insights are never touched.
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { problems } from "../db/schema";

const REAL_FILE = "neetcode250.json";
const REAL_COUNT = 250;
// Every entry in the file must have all of these.
const FIELDS = ["id", "position", "title", "slug", "url", "pattern", "difficulty"] as const;
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

// What one entry in the JSON file looks like.
type Entry = {
  id: number;
  position: number;
  title: string;
  slug: string;
  url: string;
  pattern: string;
  difficulty: string;
};

// Print an error and stop. Returning `never` tells TypeScript that code after
// a call to fail() can't run.
function fail(msg: string): never {
  console.error(`seed: ${msg}`);
  process.exit(1);
}

// Check the file before touching the database, so a bad file can't
// half-load. Stops with a clear message on the first problem it finds.
function validate(raw: unknown, file: string): Entry[] {
  if (!Array.isArray(raw)) fail("seed file must be a JSON array");
  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();
  raw.forEach((e, i) => {
    // No field may be missing or empty.
    for (const f of FIELDS) {
      const v = e?.[f];
      if (v === undefined || v === null || v === "") fail(`entry ${i} is missing "${f}"`);
    }
    if (!Number.isInteger(e.id) || !Number.isInteger(e.position)) fail(`entry ${i}: id and position must be integers`);
    if (!DIFFICULTIES.includes(e.difficulty)) fail(`entry ${i}: bad difficulty "${e.difficulty}"`);
    // Ids and slugs must be unique (the database requires it too).
    if (seenIds.has(e.id)) fail(`duplicate id ${e.id}`);
    if (seenSlugs.has(e.slug)) fail(`duplicate slug ${e.slug}`);
    seenIds.add(e.id);
    seenSlugs.add(e.slug);
  });
  // The real list must be exactly 250 problems: catches a bad or partial download.
  if (path.basename(file) === REAL_FILE && raw.length !== REAL_COUNT) {
    fail(`${REAL_FILE} must have exactly ${REAL_COUNT} entries, found ${raw.length}`);
  }
  return raw as Entry[];
}

async function main() {
  // --- 1. Read the command line ---
  const args = process.argv.slice(2);
  const dev = args.includes("--dev");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) fail("usage: tsx scripts/seed.ts <file> [--dev]");

  // --- 2. Read and check the file ---
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ${file}. ${path.basename(file) === REAL_FILE ? "The real list has not been fetched yet." : ""}`.trim());
  }
  const entries = validate(JSON.parse(text), file);

  // --- 3. Work out which database we're pointed at ---
  // Next.js loads .env files for the app, but this script runs on its own, so
  // we load them here. `dev` picks .env.development.local over .env.local.
  loadEnvConfig(process.cwd(), dev);
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set");
  const dbName = new URL(url).pathname.slice(1); // "postgres://host/NAME" -> "NAME"

  // --- 4. Safety checks ---
  // The 5 fake fixture problems must never end up in the real database.
  const isFixture = path.basename(file) === "fixture.json";
  if (isFixture && !dbName.endsWith("_dev")) {
    fail(`refusing to seed the fixture into "${dbName}" (only *_dev databases)`);
  }
  // And --dev should really mean a dev database.
  if (!isFixture && dbName.endsWith("_dev") === false && dev) {
    fail(`--dev points at "${dbName}", which is not a *_dev database`);
  }

  // --- 5. Write to the database ---
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  try {
    // One transaction: either every entry is saved or none is.
    await db.transaction(async (tx) => {
      for (const e of entries) {
        await tx
          .insert(problems)
          .values(e)
          // If a problem with this id already exists, update it instead of
          // failing. Note `insight` is not in this list, so it's left alone.
          // `excluded.x` means "the value we tried to insert".
          .onConflictDoUpdate({
            target: problems.id,
            set: {
              position: sql`excluded.position`,
              title: sql`excluded.title`,
              slug: sql`excluded.slug`,
              url: sql`excluded.url`,
              pattern: sql`excluded.pattern`,
              difficulty: sql`excluded.difficulty`,
            },
          });
      }
    });
    // Report the table's real size, not just how many we sent, so a
    // leftover row would be obvious.
    const [{ count }] = (await pool.query("select count(*)::int as count from problems")).rows;
    console.log(`seed: upserted ${entries.length} entries into ${dbName}; problems table now has ${count} rows`);
  } finally {
    // Always close the connection, or the script would hang open.
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
