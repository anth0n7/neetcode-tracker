import { describe, expect, it } from "vitest";
import { filterProblems, parseFilterParams, toSearchString } from "@/lib/problem-filters";

const rows = [
  { id: 1, title: "Contains Duplicate", pattern: "Arrays & Hashing", difficulty: "Easy", status: "unsolved" },
  { id: 2, title: "Two Sum", pattern: "Arrays & Hashing", difficulty: "Easy", status: "in review" },
  { id: 3, title: "Valid Palindrome", pattern: "Two Pointers", difficulty: "Easy", status: "mastered" },
  { id: 4, title: "3Sum", pattern: "Two Pointers", difficulty: "Medium", status: "in review" },
  { id: 5, title: "Trapping Rain Water", pattern: "Two Pointers", difficulty: "Hard", status: "unsolved" },
];
const ids = (list: { id: number }[]) => list.map((r) => r.id);

const PATTERNS = ["Arrays & Hashing", "Two Pointers"];

describe("filterProblems", () => {
  it("returns every row in order when no filter is set", () => {
    expect(ids(filterProblems(rows, {}))).toEqual([1, 2, 3, 4, 5]);
  });

  it("filters by pattern", () => {
    expect(ids(filterProblems(rows, { pattern: "Two Pointers" }))).toEqual([3, 4, 5]);
  });

  it("filters by difficulty", () => {
    expect(ids(filterProblems(rows, { difficulty: "Medium" }))).toEqual([4]);
  });

  it("filters by status", () => {
    expect(ids(filterProblems(rows, { status: "in review" }))).toEqual([2, 4]);
  });

  it("matches the title search anywhere in the title, ignoring case", () => {
    expect(ids(filterProblems(rows, { q: "SUM" }))).toEqual([2, 4]);
    expect(ids(filterProblems(rows, { q: "rain" }))).toEqual([5]);
  });

  it("combines every filter with AND", () => {
    expect(ids(filterProblems(rows, { pattern: "Two Pointers", difficulty: "Easy", status: "mastered", q: "palin" }))).toEqual([3]);
    expect(filterProblems(rows, { pattern: "Arrays & Hashing", difficulty: "Hard" })).toEqual([]);
  });

  it("does not change the rows it was given", () => {
    const copy = structuredClone(rows);
    filterProblems(rows, { q: "sum" });
    expect(rows).toEqual(copy);
  });
});

describe("parseFilterParams", () => {
  it("reads valid values", () => {
    expect(
      parseFilterParams(
        { pattern: "Two Pointers", difficulty: "Hard", status: "in review", q: "water" },
        PATTERNS,
      ),
    ).toEqual({ pattern: "Two Pointers", difficulty: "Hard", status: "in review", q: "water" });
  });

  it("ignores a difficulty, status or pattern it does not know, and keeps the rest", () => {
    expect(
      parseFilterParams({ pattern: "Not A Pattern", difficulty: "Trivial", status: "done", q: "sum" }, PATTERNS),
    ).toEqual({ q: "sum" });
  });

  it("matches difficulty and status exactly, so wrong case is ignored", () => {
    expect(parseFilterParams({ difficulty: "easy", status: "Mastered" }, PATTERNS)).toEqual({});
  });

  it("trims the search text and drops it when blank", () => {
    expect(parseFilterParams({ q: "  graph  " }, PATTERNS)).toEqual({ q: "graph" });
    expect(parseFilterParams({ q: "   " }, PATTERNS)).toEqual({});
  });

  it("uses the first value when a param is repeated", () => {
    expect(parseFilterParams({ difficulty: ["Hard", "Easy"], q: ["a", "b"] }, PATTERNS)).toEqual({ difficulty: "Hard", q: "a" });
  });

  it("returns no filters for an empty query", () => {
    expect(parseFilterParams({}, PATTERNS)).toEqual({});
  });
});

describe("toSearchString", () => {
  it("is empty when no filter is set", () => {
    expect(toSearchString({})).toBe("");
  });

  it("leaves out empty values", () => {
    expect(toSearchString({ pattern: "", q: "sum" })).toBe("?q=sum");
  });

  it("escapes characters that would break the URL", () => {
    expect(toSearchString({ pattern: "Arrays & Hashing" })).toBe("?pattern=Arrays+%26+Hashing");
  });

  it("round-trips through parseFilterParams", () => {
    const filters = { pattern: "Arrays & Hashing", difficulty: "Easy", status: "in review", q: "two sum" };
    const params = Object.fromEntries(new URLSearchParams(toSearchString(filters)));
    expect(parseFilterParams(params, PATTERNS)).toEqual(filters);
  });
});
