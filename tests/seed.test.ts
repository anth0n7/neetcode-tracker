// Tests for scripts/seed.ts.
//
// These run the real script as a command (the way you would from a terminal)
// and then look at the database. They use the DEV database, which holds only
// fake fixture problems (ids 9001-9005), so they never touch your real data.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

// Each test starts a fresh process, which takes about a second.
const SLOW = 30_000;

// Run `tsx scripts/seed.ts <args>` and capture what it printed and its exit code.
// `extraEnv` can override environment variables for this one run.
function runSeed(args: string[], extraEnv: Record<string, string> = {}) {
  // Vitest sets NODE_ENV=test, which would make the script look for "test" env
  // files. Override it so the script loads its env files as it does in a normal
  // terminal (the --dev flag, not NODE_ENV, picks which file).
  const env = { ...process.env, NODE_ENV: "development" as const, ...extraEnv };
  const result = spawnSync(TSX, ["scripts/seed.ts", ...args], { cwd: ROOT, encoding: "utf8", env });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

// Write a temporary JSON file for the script to read.
function tempFile(name: string, contents: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "seed-test-"));
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(contents));
  return file;
}

// A valid entry to start from; tests break one field at a time.
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 9001,
  position: 1,
  title: "Fixture: Hashing A",
  slug: "fixture-hashing-a",
  url: "https://example.com/fixture/hashing-a",
  pattern: "Fixture Hashing",
  difficulty: "Easy",
  ...overrides,
});

// Read DATABASE_URL straight out of an env file. (Next's own env loader picks
// different files when running under Vitest, so we read them ourselves.)
function urlFrom(envFile: string): string {
  const text = readFileSync(path.join(ROOT, envFile), "utf8");
  const match = text.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`DATABASE_URL not found in ${envFile}`);
  return match[1].trim();
}

// Connect to the dev and real databases directly, to inspect their contents.
const devUrl = urlFrom(".env.development.local");
const realUrl = urlFrom(".env.local");

const dev = new Pool({ connectionString: devUrl });
const real = new Pool({ connectionString: realUrl });

const count = async (pool: Pool) =>
  (await pool.query("select count(*)::int as n from problems")).rows[0].n as number;

beforeAll(() => {
  // If this ever fails, the tests would be pointing at the wrong database.
  expect(new URL(devUrl).pathname).toMatch(/_dev$/);
  expect(new URL(realUrl).pathname).not.toMatch(/_dev$/);
});

afterAll(async () => {
  await dev.end();
  await real.end();
});

describe("seeding the fixture into the dev database", () => {
  it("is safe to run twice: same rows, no duplicates", async () => {
    expect(runSeed(["data/fixture.json", "--dev"]).code).toBe(0);
    const first = await count(dev);
    expect(runSeed(["data/fixture.json", "--dev"]).code).toBe(0);
    expect(await count(dev)).toBe(first);

    const fixtureRows = await dev.query("select count(*)::int as n from problems where id between 9001 and 9005");
    expect(fixtureRows.rows[0].n).toBe(5);
  }, SLOW);

  it("never overwrites your insight", async () => {
    runSeed(["data/fixture.json", "--dev"]);
    await dev.query("update problems set insight = 'my own idea' where id = 9001");

    runSeed(["data/fixture.json", "--dev"]);

    const { rows } = await dev.query("select insight from problems where id = 9001");
    expect(rows[0].insight).toBe("my own idea");
    await dev.query("update problems set insight = null where id = 9001"); // tidy up
  }, SLOW);

  it("does update the seed fields when the file changes", async () => {
    await dev.query("update problems set title = 'edited by hand' where id = 9002");
    runSeed(["data/fixture.json", "--dev"]);
    const { rows } = await dev.query("select title from problems where id = 9002");
    expect(rows[0].title).toBe("Fixture: Hashing B");
  }, SLOW);
});

describe("keeping fixture data out of the real database", () => {
  it("refuses to seed the fixture into a database that is not a *_dev one", async () => {
    // We point the script at a database that doesn't exist. (Variables that are
    // already set win over the .env files.) If the safety check ever broke, the
    // script would just fail to connect: this test can never write to your real
    // database, however badly the script misbehaves.
    const before = await count(real);
    const { code, output } = runSeed(["data/fixture.json"], {
      DATABASE_URL: "postgres://localhost:5432/neetcode_tracker_not_a_real_db",
    });
    expect(code).not.toBe(0);
    expect(output).toContain("refusing to seed the fixture");
    expect(await count(real)).toBe(before);
  }, SLOW);
});

describe("checking the file before writing anything", () => {
  it("rejects an entry with a missing field", () => {
    const { id, ...withoutId } = entry();
    void id;
    const { code, output } = runSeed([tempFile("list.json", [withoutId]), "--dev"]);
    expect(code).not.toBe(0);
    expect(output).toContain('missing "id"');
  }, SLOW);

  it("rejects an unknown difficulty", () => {
    const { code, output } = runSeed([tempFile("list.json", [entry({ difficulty: "Brutal" })]), "--dev"]);
    expect(code).not.toBe(0);
    expect(output).toContain("bad difficulty");
  }, SLOW);

  it("rejects duplicate ids and duplicate slugs", () => {
    const dupId = runSeed([tempFile("list.json", [entry(), entry({ slug: "other" })]), "--dev"]);
    expect(dupId.output).toContain("duplicate id");
    const dupSlug = runSeed([tempFile("list.json", [entry(), entry({ id: 9002 })]), "--dev"]);
    expect(dupSlug.output).toContain("duplicate slug");
  }, SLOW);

  it("requires exactly 250 entries in neetcode250.json", () => {
    const { code, output } = runSeed([tempFile("neetcode250.json", [entry()]), "--dev"]);
    expect(code).not.toBe(0);
    expect(output).toContain("exactly 250");
  }, SLOW);

  it("a bad file writes nothing to the database", async () => {
    const before = await count(dev);
    // The first entry is valid but the second isn't, so nothing should be saved.
    runSeed([tempFile("list.json", [entry({ id: 9100, slug: "new-one" }), entry({ id: 9101, slug: "x", difficulty: "?" })]), "--dev"]);
    expect(await count(dev)).toBe(before);
  }, SLOW);
});
