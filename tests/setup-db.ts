import { rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeEach } from "vitest";
import { assertTestDatabasePath } from "./test-db";

const file = process.env.DATABASE_PATH;
assertTestDatabasePath(file);
const client = createClient({ url: `file:${file}` });

await migrate(drizzle(client), { migrationsFolder: "./drizzle" });

beforeEach(async () => {
  await client.batch(
    ["delete from review_state", "delete from attempts", "delete from problems", "delete from sqlite_sequence"],
    "write",
  );
});

afterAll(() => {
  client.close();
  rmSync(file, { force: true });
});
