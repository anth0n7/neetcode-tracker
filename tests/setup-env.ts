import { assertTestDatabasePath, newTestDatabasePath } from "./test-db";

process.env.DATABASE_PATH = newTestDatabasePath();
assertTestDatabasePath(process.env.DATABASE_PATH);
