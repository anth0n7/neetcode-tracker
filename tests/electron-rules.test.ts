import path from "node:path";
import { describe, expect, it } from "vitest";
import { databasePath, linkTarget } from "@/electron/rules.mjs";

const USER_DATA = "/Users/someone/Library/Application Support/NeetCode Tracker";
const APP = "http://127.0.0.1:52345";

describe("databasePath", () => {
  it("uses the real database in the app's data folder by default", () => {
    expect(databasePath({}, USER_DATA)).toBe(`${USER_DATA}/data/neetcode-tracker.db`);
  });

  it("uses DATABASE_PATH when it is set (trial mode)", () => {
    expect(databasePath({ DATABASE_PATH: "/tmp/sandbox.db" }, USER_DATA)).toBe("/tmp/sandbox.db");
  });

  it("resolves a relative override to an absolute path", () => {
    expect(databasePath({ DATABASE_PATH: "data/sandbox.db" }, USER_DATA)).toBe(path.resolve("data/sandbox.db"));
  });

  it("ignores an empty override", () => {
    expect(databasePath({ DATABASE_PATH: "" }, USER_DATA)).toBe(`${USER_DATA}/data/neetcode-tracker.db`);
  });
});

describe("linkTarget", () => {
  it("keeps the app's own pages in the window", () => {
    expect(linkTarget(`${APP}/today`, APP)).toBe("app");
    expect(linkTarget(`${APP}/problems/1?tab=history`, APP)).toBe("app");
  });

  it("sends other websites to the browser", () => {
    expect(linkTarget("https://neetcode.io/problems/duplicate-integer", APP)).toBe("browser");
    expect(linkTarget("http://example.com/", APP)).toBe("browser");
  });

  it("treats another port on this machine as another website", () => {
    expect(linkTarget("http://127.0.0.1:3000/", APP)).toBe("browser");
  });

  it("blocks anything that is not a web link", () => {
    expect(linkTarget("file:///etc/passwd", APP)).toBe("block");
    expect(linkTarget("javascript:alert(1)", APP)).toBe("block");
    expect(linkTarget("mailto:someone@example.com", APP)).toBe("block");
    expect(linkTarget("not a url", APP)).toBe("block");
  });
});
