import { Pool } from "pg";
import { afterAll, beforeEach } from "vitest";
import { assertTestDatabaseUrl, TEST_DATABASE_URL } from "./test-db";

assertTestDatabaseUrl(TEST_DATABASE_URL);
const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });

beforeEach(async () => {
  const { rows } = await pool.query("select tablename from pg_tables where schemaname = 'public'");
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
