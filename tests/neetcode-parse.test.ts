import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNeetcodeBundle } from "@/lib/neetcode-parse";

const sample = readFileSync(new URL("./fixtures/neetcode-bundle-sample.txt", import.meta.url), "utf8");

const entry = (fields: string) => `x=[{problem:"A",${fields}}]`;
const full = 'pattern:"Stack",link:"a/",difficulty:"Easy",neetcode250:!0,ncLink:"b/"';

describe("parseNeetcodeBundle", () => {
  it("keeps only the NeetCode 250 entries, in bundle order", () => {
    expect(parseNeetcodeBundle(sample).map((e) => e.title)).toEqual([
      "Concatenation of Array",
      "Contains Duplicate",
      "Valid Anagram",
    ]);
  });

  it("numbers entries from 1, with id equal to position", () => {
    expect(parseNeetcodeBundle(sample).map((e) => [e.id, e.position])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("takes the slug from link and the URL from ncLink, since they differ", () => {
    expect(parseNeetcodeBundle(sample)[1]).toEqual({
      id: 2,
      position: 2,
      title: "Contains Duplicate",
      slug: "contains-duplicate",
      url: "https://neetcode.io/problems/duplicate-integer",
      pattern: "Arrays & Hashing",
      difficulty: "Easy",
    });
  });

  it("returns an empty list when no entry is flagged neetcode250", () => {
    expect(parseNeetcodeBundle('x=[{problem:"A",pattern:"Stack",link:"a/",ncLink:"a/",difficulty:"Easy"}]')).toEqual([]);
  });

  it("fails when a flagged entry is missing a required field", () => {
    expect(() => parseNeetcodeBundle(entry('pattern:"Stack",link:"a/",difficulty:"Easy",neetcode250:!0'))).toThrow(
      'entry "A" is missing "ncLink"',
    );
  });

  it("fails on a difficulty other than Easy, Medium or Hard", () => {
    expect(() => parseNeetcodeBundle(entry(full.replace("Easy", "Trivial")))).toThrow(
      'entry "A" has bad difficulty "Trivial"',
    );
  });

  it("fails on a duplicate slug", () => {
    const twice = `x=[{problem:"A",${full}},{problem:"B",${full}}]`;
    expect(() => parseNeetcodeBundle(twice)).toThrow('duplicate slug "a"');
  });

  it("reads quotes escaped inside a title", () => {
    const quoted = `x=[{problem:"Say \\"hi\\"",${full}}]`;
    expect(parseNeetcodeBundle(quoted)[0].title).toBe('Say "hi"');
  });
});
