import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertTestDatabasePath, newTestDatabasePath, TEST_DATABASE_DIR } from "./test-db";

describe("assertTestDatabasePath", () => {
  it("accepts a throwaway test database file", () => {
    expect(() => assertTestDatabasePath(newTestDatabasePath())).not.toThrow();
    expect(() => assertTestDatabasePath(path.join(TEST_DATABASE_DIR, "anything.test.db"))).not.toThrow();
  });

  it("gives every test file its own database", () => {
    expect(newTestDatabasePath()).not.toBe(newTestDatabasePath());
  });

  it.each([
    ["the dev database", path.resolve("data/dev.db")],
    ["the sandbox database", path.resolve("data/sandbox.db")],
    [
      "the real database",
      path.join(process.env.HOME ?? "/Users/someone", "Library/Application Support/NeetCode Tracker/data/neetcode-tracker.db"),
    ],
    ["a test-named file outside the test folder", path.resolve("data/x.test.db")],
    ["a file in a subfolder of the test folder", path.join(TEST_DATABASE_DIR, "nested", "x.test.db")],
    ["a path that climbs out of the test folder", `${TEST_DATABASE_DIR}/../x.test.db`],
    ["a file in the test folder without the test suffix", path.join(TEST_DATABASE_DIR, "real.db")],
    ["a folder whose name only starts with the test folder's name", `${TEST_DATABASE_DIR}-other/x.test.db`],
    ["a relative path", "x.test.db"],
  ])("rejects %s", (_label, file) => {
    expect(() => assertTestDatabasePath(file)).toThrow(/test database/i);
  });

  it("rejects a missing path", () => {
    expect(() => assertTestDatabasePath(undefined)).toThrow(/test database/i);
    expect(() => assertTestDatabasePath("")).toThrow(/test database/i);
  });
});
