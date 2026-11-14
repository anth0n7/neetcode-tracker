import { readFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/db/schema";
import { backupDatabase } from "./backup";
import { databaseFile } from "./database-file";
import { assertSeedAllowed, readSeedFile, upsertProblems } from "./seed";
import { todayLocal } from "./today";

const REAL_SEED_FILE = "data/neetcode250.json";

async function hasPendingMigrations(client: Client, migrationsFolder: string): Promise<boolean> {
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: unknown[];
  };
  const table = await client.execute(
    "select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
  );
  if (table.rows.length === 0) return journal.entries.length > 0;
  const applied = await client.execute("select count(*) as n from __drizzle_migrations");
  return journal.entries.length > Number(applied.rows[0].n);
}

export async function prepareDatabase(o: {
  client: Client;
  file: string;
  migrationsFolder: string;
  seedFile: string;
  today: string;
}): Promise<void> {
  assertSeedAllowed(o.seedFile, o.file);
  const entries = readSeedFile(o.seedFile);

  await o.client.execute("PRAGMA foreign_keys = ON");
  await backupDatabase(o.client, o.file, o.today, {
    force: await hasPendingMigrations(o.client, o.migrationsFolder),
  });

  const db = drizzle(o.client, { schema });
  await migrate(db, { migrationsFolder: o.migrationsFolder });
  await upsertProblems(db, entries);
}

export async function prepareDatabaseFromEnv(): Promise<void> {
  const { getClient } = await import("./db");
  const client = getClient();
  await prepareDatabase({
    client,
    file: databaseFile(),
    migrationsFolder: path.resolve("drizzle"),
    seedFile: path.resolve(/*turbopackIgnore: true*/ process.env.SEED_FILE ?? REAL_SEED_FILE),
    today: todayLocal(),
  });
}
