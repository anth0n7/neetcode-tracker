import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl, TEST_DATABASE_URL } from "./test-db";

describe("assertTestDatabaseUrl", () => {
  it("accepts the test database", () => {
    expect(() => assertTestDatabaseUrl(TEST_DATABASE_URL)).not.toThrow();
    expect(() => assertTestDatabaseUrl("postgres://test:test@127.0.0.1:5433/neetcode_tracker_test")).not.toThrow();
  });

  it.each([
    ["the dev database", "postgres://localhost:5432/neetcode_tracker_dev"],
    ["the real database", "postgres://localhost:5432/neetcode_tracker"],
    ["the test database name on the dev server's port", "postgres://test:test@localhost:5432/neetcode_tracker_test"],
    ["the test port with the dev database name", "postgres://test:test@localhost:5433/neetcode_tracker_dev"],
    ["a database name that only ends in _test", "postgres://test:test@localhost:5433/other_app_test"],
    ["a longer name starting with the test name", "postgres://test:test@localhost:5433/neetcode_tracker_test2"],
    ["a remote host", "postgres://test:test@db.example.com:5433/neetcode_tracker_test"],
    ["a host that merely contains localhost", "postgres://test:test@localhost.evil.com:5433/neetcode_tracker_test"],
    ["no port (defaults to 5432)", "postgres://test:test@localhost/neetcode_tracker_test"],
  ])("rejects %s", (_label, url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow(/test database/i);
  });

  it("rejects a missing or unparseable URL", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/test database/i);
    expect(() => assertTestDatabaseUrl("")).toThrow(/test database/i);
    expect(() => assertTestDatabaseUrl("not a url")).toThrow(/test database/i);
  });

  it("never echoes the password in its error message", () => {
    try {
      assertTestDatabaseUrl("postgres://someone:hunter2@db.example.com:5433/neetcode_tracker_test");
    } catch (e) {
      expect(String(e)).not.toContain("hunter2");
      return;
    }
    throw new Error("expected the guard to throw");
  });
});
