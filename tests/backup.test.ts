import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { backupDatabase } from "@/lib/backup";
import { TEST_DATABASE_DIR } from "./test-db";

const open: Client[] = [];
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});

function connect(file: string) {
  const c = createClient({ url: `file:${file}` });
  open.push(c);
  return c;
}

async function databaseWithOneRow() {
  const dir = mkdtempSync(path.join(TEST_DATABASE_DIR, "backup-"));
  const file = path.join(dir, "app.db");
  const client = connect(file);
  await client.execute("create table notes (body text)");
  await client.execute("insert into notes (body) values ('keep me')");
  return { dir, file, client };
}

const backups = (dir: string) => (existsSync(path.join(dir, "backups")) ? readdirSync(path.join(dir, "backups")).sort() : []);

describe("backupDatabase", () => {
  it("copies the database into a backups folder beside it, named by date", async () => {
    const { dir, file, client } = await databaseWithOneRow();

    const saved = await backupDatabase(client, file, "2026-06-15");

    expect(saved).toBe(path.join(dir, "backups", "app-2026-06-15.db"));
    const copy = await connect(saved!).execute("select body from notes");
    expect(copy.rows.map((r) => r.body)).toEqual(["keep me"]);
  });

  it("takes at most one backup a day", async () => {
    const { dir, file, client } = await databaseWithOneRow();

    await backupDatabase(client, file, "2026-06-15");
    const second = await backupDatabase(client, file, "2026-06-15");

    expect(second).toBeNull();
    expect(backups(dir)).toEqual(["app-2026-06-15.db"]);
  });

  it("takes another backup the same day when forced", async () => {
    const { dir, file, client } = await databaseWithOneRow();

    await backupDatabase(client, file, "2026-06-15");
    await client.execute("insert into notes (body) values ('added later')");
    const forced = await backupDatabase(client, file, "2026-06-15", { force: true });

    expect(backups(dir)).toHaveLength(2);
    const copy = await connect(forced!).execute("select count(*) as n from notes");
    expect(copy.rows[0].n).toBe(2);
  });

  it("keeps only the 7 newest backups", async () => {
    const { dir, file, client } = await databaseWithOneRow();

    for (let day = 1; day <= 9; day++) await backupDatabase(client, file, `2026-06-0${day}`);

    expect(backups(dir)).toEqual([
      "app-2026-06-03.db",
      "app-2026-06-04.db",
      "app-2026-06-05.db",
      "app-2026-06-06.db",
      "app-2026-06-07.db",
      "app-2026-06-08.db",
      "app-2026-06-09.db",
    ]);
  });

  it("does not back up a database that has no tables yet", async () => {
    const dir = mkdtempSync(path.join(TEST_DATABASE_DIR, "backup-"));
    const file = path.join(dir, "app.db");

    expect(await backupDatabase(connect(file), file, "2026-06-15")).toBeNull();
    expect(backups(dir)).toEqual([]);
  });
});
