// Tests for scripts/seed.ts.
//
// These run the real script as a command (the way you would from a terminal)
// and then look at the database. They use the TEST database only (see
// tests/test-db.ts): the script is always handed the test database's URL, and
// the tests read it back through the same URL.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "./test-db";

const ROOT = process.cwd();
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

// Each test starts a fresh process, which takes about a second.
const SLOW = 30_000;

// Run `tsx scripts/seed.ts <args>` and capture what it printed and its exit code.
// `extraEnv` can override environment variables for this one run.
function runSeed(args: string[], extraEnv: Record<string, string> = {}) {
  const env = {
    ...process.env,
    // Vitest sets NODE_ENV=test, which would make the script look for "test" env
    // files. Override it so the script behaves as it does in a normal terminal.
    NODE_ENV: "development" as const,
    // Always point the script at the test database. A variable that is already
    // set wins over the .env files, so the script never reads the dev/real URLs.
    DATABASE_URL: TEST_DATABASE_URL,
    ...extraEnv,
  };
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

// A connection to the test database, to look at what the script wrote.
// (The data is wiped before every test by tests/setup-db.ts.)
const db = new Pool({ connectionString: TEST_DATABASE_URL });
afterAll(async () => {
  await db.end();
});

const count = async () => (await db.query("select count(*)::int as n from problems")).rows[0].n as number;

describe("seeding the fixture into a throwaway database", () => {
  it("is safe to run twice: same rows, no duplicates", async () => {
    expect(runSeed(["data/fixture.json"]).code).toBe(0);
    const first = await count();
    expect(first).toBe(5);
    expect(runSeed(["data/fixture.json"]).code).toBe(0);
    expect(await count()).toBe(first);

    const fixtureRows = await db.query("select count(*)::int as n from problems where id between 9001 and 9005");
    expect(fixtureRows.rows[0].n).toBe(5);
  }, SLOW);

  it("never overwrites your insight", async () => {
    runSeed(["data/fixture.json"]);
    await db.query("update problems set insight = 'my own idea' where id = 9001");

    runSeed(["data/fixture.json"]);

    const { rows } = await db.query("select insight from problems where id = 9001");
    expect(rows[0].insight).toBe("my own idea");
  }, SLOW);

  it("does update the seed fields when the file changes", async () => {
    // Seed first: the database is empty at the start of every test, so there is
    // no row to edit until the script has created it.
    runSeed(["data/fixture.json"]);
    await db.query("update problems set title = 'edited by hand' where id = 9002");
    // Make sure the edit really happened, or this test would prove nothing.
    expect((await db.query("select title from problems where id = 9002")).rows[0].title).toBe("edited by hand");

    runSeed(["data/fixture.json"]);

    const { rows } = await db.query("select title from problems where id = 9002");
    expect(rows[0].title).toBe("Fixture: Hashing B");
  }, SLOW);
});

describe("keeping fixture data out of the real database", () => {
  it("refuses to seed the fixture into a database that is not a throwaway one", async () => {
    // We point the script at a database that doesn't exist (on the test
    // database's own port). If the safety check ever broke, the script would just
    // fail to connect: this test can never write to a dev or real database,
    // however badly the script misbehaves.
    const { code, output } = runSeed(["data/fixture.json"], {
      DATABASE_URL: "postgres://test:test@localhost:5433/neetcode_tracker_not_a_real_db",
    });
    expect(code).not.toBe(0);
    expect(output).toContain("refusing to seed the fixture");
    expect(await count()).toBe(0); // and nothing reached the test database either
  }, SLOW);
});

describe("checking the file before writing anything", () => {
  it("rejects an entry with a missing field", () => {
    const { id, ...withoutId } = entry();
    void id;
    const { code, output } = runSeed([tempFile("list.json", [withoutId])]);
    expect(code).not.toBe(0);
    expect(output).toContain('missing "id"');
  }, SLOW);

  it("rejects an unknown difficulty", () => {
    const { code, output } = runSeed([tempFile("list.json", [entry({ difficulty: "Brutal" })])]);
    expect(code).not.toBe(0);
    expect(output).toContain("bad difficulty");
  }, SLOW);

  it("rejects duplicate ids and duplicate slugs", () => {
    const dupId = runSeed([tempFile("list.json", [entry(), entry({ slug: "other" })])]);
    expect(dupId.output).toContain("duplicate id");
    const dupSlug = runSeed([tempFile("list.json", [entry(), entry({ id: 9002 })])]);
    expect(dupSlug.output).toContain("duplicate slug");
  }, SLOW);

  it("requires exactly 250 entries in neetcode250.json", () => {
    const { code, output } = runSeed([tempFile("neetcode250.json", [entry()])]);
    expect(code).not.toBe(0);
    expect(output).toContain("exactly 250");
  }, SLOW);

  it("a bad file writes nothing to the database", async () => {
    // The first entry is valid but the second isn't, so nothing should be saved.
    const result = runSeed([
      tempFile("list.json", [entry({ id: 9100, slug: "new-one" }), entry({ id: 9101, slug: "x", difficulty: "?" })]),
    ]);
    expect(result.code).not.toBe(0);
    expect(await count()).toBe(0);
  }, SLOW);
});
