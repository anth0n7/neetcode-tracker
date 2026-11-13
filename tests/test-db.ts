export const TEST_DATABASE_URL = "postgres://test:test@localhost:5433/neetcode_tracker_test";

const ALLOWED_HOSTS = ["localhost", "127.0.0.1"];
const ALLOWED_PORT = "5433";
const ALLOWED_DATABASE = "neetcode_tracker_test";

export function assertTestDatabaseUrl(url: string | undefined): asserts url is string {
  const refuse = (why: string) =>
    new Error(
      `Refusing to run: the test suite may only use the test database ` +
        `(localhost:${ALLOWED_PORT}/${ALLOWED_DATABASE}). ${why}`,
    );

  if (!url) throw refuse("No database URL was given.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw refuse("The database URL could not be parsed.");
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) throw refuse(`Host "${parsed.hostname}" is not this machine.`);
  if (parsed.port !== ALLOWED_PORT) throw refuse(`Port "${parsed.port || "5432 (default)"}" is not ${ALLOWED_PORT}.`);
  if (parsed.pathname !== `/${ALLOWED_DATABASE}`) throw refuse(`Database "${parsed.pathname.slice(1)}" is not the test database.`);
}
