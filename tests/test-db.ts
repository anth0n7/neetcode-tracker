// The ONE database the test suite is allowed to use, and the guard that enforces it.
//
// It is a throwaway Postgres running in Docker (docker-compose.test.yml) on port
// 5433, completely separate from your dev (5432, neetcode_tracker_dev) and real
// (5432, neetcode_tracker) databases. The URL is fixed on purpose: there is no
// environment variable to override it, so nothing can point the tests elsewhere.
export const TEST_DATABASE_URL = "postgres://test:test@localhost:5433/neetcode_tracker_test";

const ALLOWED_HOSTS = ["localhost", "127.0.0.1"];
const ALLOWED_PORT = "5433";
const ALLOWED_DATABASE = "neetcode_tracker_test";

// Throws unless `url` is exactly the test database: this machine, port 5433,
// database "neetcode_tracker_test". Every part must match, so a URL that is only
// *similar* (the dev database, the right name on the wrong port, a remote host)
// is refused. The error never includes the URL, so no password can leak into logs.
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
  // An empty port means the default, 5432, which is where dev and real live.
  if (parsed.port !== ALLOWED_PORT) throw refuse(`Port "${parsed.port || "5432 (default)"}" is not ${ALLOWED_PORT}.`);
  if (parsed.pathname !== `/${ALLOWED_DATABASE}`) throw refuse(`Database "${parsed.pathname.slice(1)}" is not the test database.`);
}
