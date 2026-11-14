import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { databaseFile } from "./database-file";

type Database = LibSQLDatabase<typeof schema> & { $client: Client };

const globalForDb = globalThis as unknown as { sqliteClient?: Client; sqliteDb?: Database };

export function getClient(): Client {
  if (!globalForDb.sqliteClient) {
    const file = databaseFile();
    mkdirSync(path.dirname(file), { recursive: true });
    globalForDb.sqliteClient = createClient({ url: `file:${file}` });
  }
  return globalForDb.sqliteClient;
}

function getDb(): Database {
  return (globalForDb.sqliteDb ??= drizzle(getClient(), { schema }));
}

// Opening the file is deferred to first use: `next build` imports every route
// module to collect its config, and no database exists or should be created then.
export const db = new Proxy({} as Database, {
  get(_target, key) {
    const real = getDb();
    const value = Reflect.get(real, key);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
