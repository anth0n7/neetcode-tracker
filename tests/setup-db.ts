// Runs before every test file and registers a reset that runs before EVERY TEST:
// all data is deleted, so no test can see another test's leftovers. The tables
// themselves stay (they were migrated in tests/global-setup.ts).
import { Pool } from "pg";
import { afterAll, beforeEach } from "vitest";
import { assertTestDatabaseUrl, TEST_DATABASE_URL } from "./test-db";

assertTestDatabaseUrl(TEST_DATABASE_URL);
const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });

beforeEach(async () => {
  // Look up every table instead of listing them, so a table added later is
  // reset too. (Drizzle keeps its migration record in a different schema,
  // "drizzle", so it is not touched.) CASCADE handles the foreign keys, and
  // RESTART IDENTITY makes the auto-numbered ids start from 1 again.
  const { rows } = await pool.query("select tablename from pg_tables where schemaname = 'public'");
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
