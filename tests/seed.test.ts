import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "./test-db";

const ROOT = process.cwd();
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

const SLOW = 30_000;

function runSeed(args: string[], extraEnv: Record<string, string> = {}) {
  const env = {
    ...process.env,
    NODE_ENV: "development" as const,
    DATABASE_URL: TEST_DATABASE_URL,
    ...extraEnv,
  };
  const result = spawnSync(TSX, ["scripts/seed.ts", ...args], { cwd: ROOT, encoding: "utf8", env });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

function tempFile(name: string, contents: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "seed-test-"));
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(contents));
  return file;
}

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
    runSeed(["data/fixture.json"]);
    await db.query("update problems set title = 'edited by hand' where id = 9002");
    expect((await db.query("select title from problems where id = 9002")).rows[0].title).toBe("edited by hand");

    runSeed(["data/fixture.json"]);

    const { rows } = await db.query("select title from problems where id = 9002");
    expect(rows[0].title).toBe("Fixture: Hashing B");
  }, SLOW);
});

describe("keeping fixture data out of the real database", () => {
  it("refuses to seed the fixture into a database that is not a throwaway one", async () => {
    const { code, output } = runSeed(["data/fixture.json"], {
      DATABASE_URL: "postgres://test:test@localhost:5433/neetcode_tracker_not_a_real_db",
    });
    expect(code).not.toBe(0);
    expect(output).toContain("refusing to seed the fixture");
    expect(await count()).toBe(0);
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
    const result = runSeed([
      tempFile("list.json", [entry({ id: 9100, slug: "new-one" }), entry({ id: 9101, slug: "x", difficulty: "?" })]),
    ]);
    expect(result.code).not.toBe(0);
    expect(await count()).toBe(0);
  }, SLOW);
});
