import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

export const TEST_DATABASE_DIR = path.join(tmpdir(), "neetcode-tracker-tests");
const SUFFIX = ".test.db";

export const newTestDatabasePath = () => path.join(TEST_DATABASE_DIR, `${randomUUID()}${SUFFIX}`);

export function assertTestDatabasePath(file: string | undefined): asserts file is string {
  const refuse = (why: string) =>
    new Error(
      `Refusing to run: the test suite may only use a throwaway test database ` +
        `(a *${SUFFIX} file directly inside ${TEST_DATABASE_DIR}). ${why}`,
    );

  if (!file) throw refuse("No database path was given.");
  if (!path.isAbsolute(file)) throw refuse("The database path is not absolute.");

  const resolved = path.resolve(file);
  if (path.dirname(resolved) !== TEST_DATABASE_DIR) throw refuse(`"${resolved}" is not inside the test folder.`);
  if (!resolved.endsWith(SUFFIX)) throw refuse(`"${path.basename(resolved)}" does not end in ${SUFFIX}.`);
}
