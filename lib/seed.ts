import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { problems } from "@/db/schema";
import type { Conn } from "./attempts";

const REAL_FILE = "neetcode250.json";
const REAL_COUNT = 250;
const FIXTURE_FILE = "fixture.json";
const FIELDS = ["id", "position", "title", "slug", "url", "pattern", "difficulty"] as const;
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export type SeedEntry = {
  id: number;
  position: number;
  title: string;
  slug: string;
  url: string;
  pattern: string;
  difficulty: string;
};

export function parseSeedEntries(raw: unknown, file: string): SeedEntry[] {
  if (!Array.isArray(raw)) throw new Error("seed file must be a JSON array");
  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();
  raw.forEach((e, i) => {
    for (const f of FIELDS) {
      const v = e?.[f];
      if (v === undefined || v === null || v === "") throw new Error(`entry ${i} is missing "${f}"`);
    }
    if (!Number.isInteger(e.id) || !Number.isInteger(e.position)) {
      throw new Error(`entry ${i}: id and position must be integers`);
    }
    if (!DIFFICULTIES.includes(e.difficulty)) throw new Error(`entry ${i}: bad difficulty "${e.difficulty}"`);
    if (seenIds.has(e.id)) throw new Error(`duplicate id ${e.id}`);
    if (seenSlugs.has(e.slug)) throw new Error(`duplicate slug ${e.slug}`);
    seenIds.add(e.id);
    seenSlugs.add(e.slug);
  });
  if (path.basename(file) === REAL_FILE && raw.length !== REAL_COUNT) {
    throw new Error(`${REAL_FILE} must have exactly ${REAL_COUNT} entries, found ${raw.length}`);
  }
  return raw as SeedEntry[];
}

export function readSeedFile(file: string): SeedEntry[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`cannot read ${file}`);
  }
  return parseSeedEntries(JSON.parse(text), file);
}

export function isThrowawayDatabase(databaseFile: string): boolean {
  const name = path.basename(databaseFile);
  return name === "dev.db" || name.endsWith(".test.db");
}

export function assertSeedAllowed(seedFile: string, databaseFile: string): void {
  if (path.basename(seedFile) === FIXTURE_FILE && !isThrowawayDatabase(databaseFile)) {
    throw new Error(
      `refusing to seed the fixture into "${path.basename(databaseFile)}" (only dev.db or *.test.db databases)`,
    );
  }
}

export async function upsertProblems(conn: Conn, entries: SeedEntry[]): Promise<void> {
  await conn.transaction(async (tx) => {
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
}
