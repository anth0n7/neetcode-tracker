import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { assertTestDatabaseUrl, TEST_DATABASE_URL } from "./test-db";

export default async function setup() {
  assertTestDatabaseUrl(TEST_DATABASE_URL);

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
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

    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
