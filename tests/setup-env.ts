import { assertTestDatabaseUrl, TEST_DATABASE_URL } from "./test-db";

process.env.DATABASE_URL = TEST_DATABASE_URL;
assertTestDatabaseUrl(process.env.DATABASE_URL);
