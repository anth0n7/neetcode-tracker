import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { problems } from "../db/schema";

const REAL_FILE = "neetcode250.json";
const REAL_COUNT = 250;
const FIELDS = ["id", "position", "title", "slug", "url", "pattern", "difficulty"] as const;
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

type Entry = {
  id: number;
  position: number;
  title: string;
  slug: string;
  url: string;
  pattern: string;
  difficulty: string;
};

function fail(msg: string): never {
  console.error(`seed: ${msg}`);
  process.exit(1);
}

function validate(raw: unknown, file: string): Entry[] {
  if (!Array.isArray(raw)) fail("seed file must be a JSON array");
  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();
  raw.forEach((e, i) => {
    for (const f of FIELDS) {
      const v = e?.[f];
      if (v === undefined || v === null || v === "") fail(`entry ${i} is missing "${f}"`);
    }
    if (!Number.isInteger(e.id) || !Number.isInteger(e.position)) fail(`entry ${i}: id and position must be integers`);
    if (!DIFFICULTIES.includes(e.difficulty)) fail(`entry ${i}: bad difficulty "${e.difficulty}"`);
    if (seenIds.has(e.id)) fail(`duplicate id ${e.id}`);
    if (seenSlugs.has(e.slug)) fail(`duplicate slug ${e.slug}`);
    seenIds.add(e.id);
    seenSlugs.add(e.slug);
  });
  if (path.basename(file) === REAL_FILE && raw.length !== REAL_COUNT) {
    fail(`${REAL_FILE} must have exactly ${REAL_COUNT} entries, found ${raw.length}`);
  }
  return raw as Entry[];
}

async function main() {
  const args = process.argv.slice(2);
  const dev = args.includes("--dev");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) fail("usage: tsx scripts/seed.ts <file> [--dev]");

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ${file}. ${path.basename(file) === REAL_FILE ? "The real list has not been fetched yet." : ""}`.trim());
  }
  const entries = validate(JSON.parse(text), file);

  loadEnvConfig(process.cwd(), dev);
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set");
  const dbName = new URL(url).pathname.slice(1);

  const isFixture = path.basename(file) === "fixture.json";
  const isThrowawayDb = dbName.endsWith("_dev") || dbName.endsWith("_test");
  if (isFixture && !isThrowawayDb) {
    fail(`refusing to seed the fixture into "${dbName}" (only *_dev or *_test databases)`);
  }
  if (!isFixture && dbName.endsWith("_dev") === false && dev) {
    fail(`--dev points at "${dbName}", which is not a *_dev database`);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  try {
    await db.transaction(async (tx) => {
      for (const e of entries) {
        await tx
          .insert(problems)
          .values(e)
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
    const [{ count }] = (await pool.query("select count(*)::int as count from problems")).rows;
    console.log(`seed: upserted ${entries.length} entries into ${dbName}; problems table now has ${count} rows`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
