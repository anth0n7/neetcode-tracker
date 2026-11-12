import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http";
import {
  parseAttemptedOn,
  parseDueOptions,
  parseInsight,
  parseMinutes,
  parseProblemFilters,
  parseProblemId,
  parseRating,
} from "@/lib/validate";

// Run `fn` and return the HttpError it throws (the test fails if it doesn't throw one).
function httpError(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpError) return e;
    throw e;
  }
  throw new Error("expected an HttpError, but nothing was thrown");
}

const TODAY = "2026-11-12";

describe("parseProblemId", () => {
  it("accepts a positive whole number", () => {
    expect(parseProblemId("42")).toBe(42);
  });

  // An id that can't be a real problem is treated as "not found" (404), not a bad request.
  it.each(["abc", "0", "-3", "1.5", "", "12abc", " 7"])("rejects %j with 404", (raw) => {
    expect(httpError(() => parseProblemId(raw)).status).toBe(404);
  });
});

describe("parseRating", () => {
  it.each(["easy", "struggled", "needed_solution"])("accepts %s", (r) => {
    expect(parseRating(r)).toBe(r);
  });

  it.each([undefined, null, "", "Easy", "hard", 3])("rejects %j with 400", (r) => {
    expect(httpError(() => parseRating(r)).status).toBe(400);
  });
});

describe("parseAttemptedOn", () => {
  it("defaults to today when omitted", () => {
    expect(parseAttemptedOn(undefined, TODAY)).toBe(TODAY);
    expect(parseAttemptedOn(null, TODAY)).toBe(TODAY);
  });

  it("accepts today and past dates", () => {
    expect(parseAttemptedOn("2026-11-12", TODAY)).toBe("2026-11-12");
    expect(parseAttemptedOn("2026-01-01", TODAY)).toBe("2026-01-01");
  });

  it("rejects a future date with 400", () => {
    expect(httpError(() => parseAttemptedOn("2026-11-13", TODAY)).status).toBe(400);
  });

  // The right shape isn't enough: Feb 30 doesn't exist.
  it.each(["11/12/2026", "2026-1-5", "2026-13-01", "2026-02-30", "not a date", 20261112, ""])(
    "rejects %j with 400",
    (raw) => {
      expect(httpError(() => parseAttemptedOn(raw, TODAY)).status).toBe(400);
    },
  );
});

describe("parseMinutes", () => {
  it("treats missing as null", () => {
    expect(parseMinutes(undefined)).toBeNull();
    expect(parseMinutes(null)).toBeNull();
  });

  it("accepts non-negative whole numbers", () => {
    expect(parseMinutes(0)).toBe(0);
    expect(parseMinutes(25)).toBe(25);
  });

  it.each([-1, 2.5, "10", NaN, 100_000])("rejects %j with 400", (raw) => {
    expect(httpError(() => parseMinutes(raw)).status).toBe(400);
  });
});

describe("parseInsight", () => {
  it("trims whitespace", () => {
    expect(parseInsight("  use a hash map  ")).toBe("use a hash map");
  });

  it("turns empty, blank or missing into null", () => {
    expect(parseInsight("")).toBeNull();
    expect(parseInsight("   ")).toBeNull();
    expect(parseInsight(undefined)).toBeNull();
    expect(parseInsight(null)).toBeNull();
  });

  it("rejects non-strings and very long text with 400", () => {
    expect(httpError(() => parseInsight(5)).status).toBe(400);
    expect(httpError(() => parseInsight("x".repeat(501))).status).toBe(400);
  });

  it("accepts text right at the limit", () => {
    expect(parseInsight("x".repeat(500))).toHaveLength(500);
  });
});

describe("parseDueOptions", () => {
  it("defaults to the configured limit (10) and all=false", () => {
    expect(parseDueOptions(new URLSearchParams())).toEqual({ limit: 10, all: false });
  });

  it("reads limit and all", () => {
    expect(parseDueOptions(new URLSearchParams("limit=3"))).toEqual({ limit: 3, all: false });
    expect(parseDueOptions(new URLSearchParams("all=true"))).toEqual({ limit: 10, all: true });
  });

  it.each(["limit=0", "limit=-1", "limit=abc", "limit=1.5", "all=maybe"])("rejects %s with 400", (qs) => {
    expect(httpError(() => parseDueOptions(new URLSearchParams(qs))).status).toBe(400);
  });
});

describe("parseProblemFilters", () => {
  it("returns an empty object when nothing is given", () => {
    expect(parseProblemFilters(new URLSearchParams())).toEqual({});
  });

  it("reads all four filters", () => {
    const f = parseProblemFilters(
      new URLSearchParams({ pattern: "Sliding Window", difficulty: "Hard", status: "in review", q: "  two  " }),
    );
    expect(f).toEqual({ pattern: "Sliding Window", difficulty: "Hard", status: "in review", q: "two" });
  });

  it("ignores blank values", () => {
    expect(parseProblemFilters(new URLSearchParams("pattern=&q=%20"))).toEqual({});
  });

  it("rejects an unknown difficulty or status with 400", () => {
    expect(httpError(() => parseProblemFilters(new URLSearchParams("difficulty=Brutal"))).status).toBe(400);
    expect(httpError(() => parseProblemFilters(new URLSearchParams("status=done"))).status).toBe(400);
  });
});
