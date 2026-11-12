// Runs before every test file. It points DATABASE_URL (which lib/db.ts reads) at
// the test database and re-checks it with the guard, so no test can reach the
// dev or real database through the app's own connection.
import { assertTestDatabaseUrl, TEST_DATABASE_URL } from "./test-db";

process.env.DATABASE_URL = TEST_DATABASE_URL;
assertTestDatabaseUrl(process.env.DATABASE_URL);
