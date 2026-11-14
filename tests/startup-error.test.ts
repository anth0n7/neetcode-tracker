import { describe, expect, it } from "vitest";
import { describeStartupError, STARTUP_FAILED } from "@/lib/startup-error";

function sqliteError(code: string, message: string) {
  const inner = Object.assign(new Error(message), { code });
  return Object.assign(new Error(`${code}: ${message}`, { cause: inner }), { code });
}

describe("describeStartupError", () => {
  it("explains a damaged database file and keeps the original reason", () => {
    expect(describeStartupError(sqliteError("SQLITE_NOTADB", "file is not a database"))).toBe(
      "The database file is damaged or is not a database. Restore a backup (see the README). (SQLITE_NOTADB: file is not a database)",
    );
    expect(describeStartupError(sqliteError("SQLITE_CORRUPT", "database disk image is malformed"))).toMatch(
      /^The database file is damaged or is not a database\..*\(SQLITE_CORRUPT: database disk image is malformed\)$/,
    );
  });

  it("explains a full disk", () => {
    expect(describeStartupError(Object.assign(new Error("no space left on device"), { code: "ENOSPC" }))).toBe(
      "The disk is full. (ENOSPC: no space left on device)",
    );
  });

  it("explains a file the app may not read or write", () => {
    expect(describeStartupError(Object.assign(new Error("operation not permitted"), { code: "EPERM" }))).toBe(
      "The app is not allowed to read or write the database file. (EPERM: operation not permitted)",
    );
  });

  it("falls back to the error's own message", () => {
    expect(describeStartupError(new Error("DATABASE_PATH is not set"))).toBe("DATABASE_PATH is not set");
    expect(describeStartupError("something odd")).toBe("something odd");
  });

  it("labels the line the desktop app looks for", () => {
    expect(STARTUP_FAILED).toBe("STARTUP FAILED:");
  });
});
