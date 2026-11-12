// Runs ONCE before any test file. It makes sure the test database is up and
// has the current tables, so every test can assume a real, migrated Postgres.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { assertTestDatabaseUrl, TEST_DATABASE_URL } from "./test-db";

export default async function setup() {
  // Check the target BEFORE connecting to anything.
  assertTestDatabaseUrl(TEST_DATABASE_URL);

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    // Is it reachable, and did we really land in the test database?
    let name: string;
    try {
      name = (await pool.query("select current_database() as name")).rows[0].name;
    } catch {
      throw new Error(
        "Cannot reach the test database on localhost:5433.\n" +
          "Start Docker, then run: npm run test:db:up",
      );
    }
    if (name !== "neetcode_tracker_test") {
      throw new Error(`Connected to "${name}", not the test database. Stopping.`);
    }

    // Apply every migration in /drizzle. Already-applied ones are skipped, so
    // this is safe to run every time.
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
