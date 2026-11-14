import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { prepareDatabase } from "@/lib/startup";
import { TEST_DATABASE_DIR } from "./test-db";

const MIGRATIONS = path.resolve("drizzle");
const FIXTURE = path.resolve("data/fixture.json");

const open: Client[] = [];
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});

function freshDatabase(name = "app.test.db") {
  const dir = mkdtempSync(path.join(TEST_DATABASE_DIR, "startup-"));
  const file = path.join(dir, name);
  const client = createClient({ url: `file:${file}` });
  open.push(client);
  return { dir, file, client };
}

const backups = (dir: string) => (existsSync(path.join(dir, "backups")) ? readdirSync(path.join(dir, "backups")).sort() : []);
const count = async (client: Client, table: string) => Number((await client.execute(`select count(*) as n from ${table}`)).rows[0].n);

function migrationsWithOneMore() {
  const folder = path.join(mkdtempSync(path.join(TEST_DATABASE_DIR, "migrations-")), "drizzle");
  cpSync(MIGRATIONS, folder, { recursive: true });
  writeFileSync(path.join(folder, "0001_extra.sql"), "CREATE TABLE `extra` (`id` integer PRIMARY KEY NOT NULL);\n");
  const journalFile = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalFile, "utf8"));
  const last = journal.entries[journal.entries.length - 1];
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1, tag: "0001_extra" });
  writeFileSync(journalFile, JSON.stringify(journal));
  return folder;
}

describe("prepareDatabase", () => {
  it("turns an empty file into a migrated, seeded database, with nothing to back up", async () => {
    const { dir, file, client } = freshDatabase();

    await prepareDatabase({ client, file, migrationsFolder: MIGRATIONS, seedFile: FIXTURE, today: "2026-06-15" });

    expect(await count(client, "problems")).toBe(5);
    expect(await count(client, "attempts")).toBe(0);
    expect(backups(dir)).toEqual([]);
  });

  it("is safe to run again: same problems, your insight kept, and a daily backup taken", async () => {
    const { dir, file, client } = freshDatabase();
    const run = (today: string) =>
      prepareDatabase({ client, file, migrationsFolder: MIGRATIONS, seedFile: FIXTURE, today });

    await run("2026-06-15");
    await client.execute("update problems set insight = 'my own idea' where id = 9001");
    await run("2026-06-16");
    await run("2026-06-16");

    expect(await count(client, "problems")).toBe(5);
    const { rows } = await client.execute("select insight from problems where id = 9001");
    expect(rows[0].insight).toBe("my own idea");
    expect(backups(dir)).toEqual(["app.test-2026-06-16.db"]);
  });

  it("backs up before applying a new migration, even if today's backup exists", async () => {
    const { dir, file, client } = freshDatabase();
    const base = { client, file, seedFile: FIXTURE, today: "2026-06-16" };

    await prepareDatabase({ ...base, migrationsFolder: MIGRATIONS, today: "2026-06-15" });
    await prepareDatabase({ ...base, migrationsFolder: MIGRATIONS });
    expect(backups(dir)).toHaveLength(1);

    await prepareDatabase({ ...base, migrationsFolder: migrationsWithOneMore() });

    expect(backups(dir)).toHaveLength(2);
    expect(await count(client, "extra")).toBe(0);
    const beforeMigration = createClient({ url: `file:${path.join(dir, "backups", backups(dir)[1])}` });
    open.push(beforeMigration);
    const tables = await beforeMigration.execute("select name from sqlite_master where type = 'table' and name = 'extra'");
    expect(tables.rows).toEqual([]);
  });

  it("refuses to put the fixture into a database that is not a throwaway one, and writes nothing", async () => {
    const { file, client } = freshDatabase("app.db");

    await expect(
      prepareDatabase({ client, file, migrationsFolder: MIGRATIONS, seedFile: FIXTURE, today: "2026-06-15" }),
    ).rejects.toThrow(/refusing to seed the fixture/);

    const tables = await client.execute("select name from sqlite_master where type = 'table'");
    expect(tables.rows).toEqual([]);
  });
});
