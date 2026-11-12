import { describe, expect, it } from "vitest";
import { checkRequest, HttpError, type RequestInfo } from "@/lib/http";

// Build a request description, overriding only what the test cares about.
const req = (o: Partial<RequestInfo> = {}): RequestInfo => ({
  method: "GET",
  host: "localhost:3000",
  origin: null,
  secFetchSite: null,
  ...o,
});

function status(info: RequestInfo): number | null {
  try {
    checkRequest(info);
    return null; // allowed
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
}

describe("host check (applies to every request)", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "localhost:3001", "[::1]:3000", "localhost"])("allows %s", (host) => {
    expect(status(req({ host }))).toBeNull();
  });

  // A hostile site can point its own name at 127.0.0.1 ("DNS rebinding"); the
  // browser then sends that name as the Host, so we refuse any non-loopback host.
  it.each(["evil.example.com", "evil.example.com:3000", "192.168.0.76:3000", "localhost.evil.com"])(
    "rejects %s with 403",
    (host) => {
      expect(status(req({ host }))).toBe(403);
    },
  );

  it("rejects a request with no Host header", () => {
    expect(status(req({ host: null }))).toBe(403);
  });
});

describe("origin check (changes only)", () => {
  it.each(["POST", "PATCH", "DELETE"])("%s with no Origin (curl) is allowed", (method) => {
    expect(status(req({ method }))).toBeNull();
  });

  it("allows a same-origin browser request", () => {
    expect(status(req({ method: "POST", origin: "http://localhost:3000" }))).toBeNull();
    expect(status(req({ method: "DELETE", host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }))).toBeNull();
  });

  it("rejects a request from another website with 403", () => {
    expect(status(req({ method: "POST", origin: "https://evil.example.com" }))).toBe(403);
    expect(status(req({ method: "DELETE", origin: "http://localhost:4000" }))).toBe(403);
  });

  it("rejects an Origin that is localhost but a different port", () => {
    expect(status(req({ method: "PATCH", origin: "http://localhost:9999" }))).toBe(403);
  });

  it("rejects the literal Origin 'null' (sandboxed pages)", () => {
    expect(status(req({ method: "POST", origin: "null" }))).toBe(403);
  });

  it("rejects when the browser says the request is cross-site", () => {
    expect(status(req({ method: "POST", secFetchSite: "cross-site" }))).toBe(403);
  });

  it("allows same-origin and none for Sec-Fetch-Site", () => {
    expect(status(req({ method: "POST", secFetchSite: "same-origin" }))).toBeNull();
    expect(status(req({ method: "POST", secFetchSite: "none" }))).toBeNull();
  });

  it("does not apply the Origin rule to GET", () => {
    expect(status(req({ method: "GET", origin: "https://evil.example.com" }))).toBeNull();
  });
});
