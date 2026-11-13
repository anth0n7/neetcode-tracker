import { describe, expect, it } from "vitest";
import {
  attemptRequest,
  dueCount,
  hideRow,
  RATING_BUTTONS,
  ratingFromKey,
  showRow,
  undoRequest,
  visibleRows,
} from "@/lib/today-list";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
const ids = (list: { id: number }[]) => list.map((r) => r.id);

describe("hiding and restoring rows", () => {
  it("rating a row hides it and lowers the due count by one", () => {
    const items = rows(3);
    const hidden = hideRow(new Set(), 2);

    expect(ids(visibleRows(items, hidden, false))).toEqual([1, 3]);
    expect(dueCount(items, hidden)).toBe(2);
  });

  it("undo puts the row back in its original position, even after other rows left", () => {
    const items = rows(4);
    let hidden = hideRow(new Set(), 2);
    hidden = hideRow(hidden, 3);
    hidden = showRow(hidden, 2);

    expect(ids(visibleRows(items, hidden, false))).toEqual([1, 2, 4]);
    expect(dueCount(items, hidden)).toBe(3);
  });

  it("a failed request restores the row the same way as undo", () => {
    const items = rows(2);
    const hidden = showRow(hideRow(new Set(), 1), 1);

    expect(ids(visibleRows(items, hidden, false))).toEqual([1, 2]);
  });

  it("does not change the set it was given", () => {
    const hidden = new Set([1]);
    hideRow(hidden, 2);
    showRow(hidden, 1);

    expect([...hidden]).toEqual([1]);
  });
});

describe("show all", () => {
  it("shows only the first 10 rows by default", () => {
    expect(ids(visibleRows(rows(12), new Set(), false))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("shows every row when show all is on", () => {
    expect(visibleRows(rows(12), new Set(), true)).toHaveLength(12);
  });

  it("pulls the next rows into the first 10 as rows are rated", () => {
    const hidden = hideRow(new Set(), 1);

    expect(ids(visibleRows(rows(12), hidden, false))).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("respects an explicit limit", () => {
    expect(ids(visibleRows(rows(5), new Set(), false, 2))).toEqual([1, 2]);
  });
});

describe("rating buttons and shortcuts", () => {
  it("orders the buttons from worst to best, keyed 1 to 3", () => {
    expect(RATING_BUTTONS).toEqual([
      { rating: "needed_solution", label: "Needed solution", key: "1" },
      { rating: "struggled", label: "Struggled", key: "2" },
      { rating: "easy", label: "Easy", key: "3" },
    ]);
  });

  it("maps keys 1, 2 and 3 to the ratings", () => {
    expect(ratingFromKey({ key: "1" })).toBe("needed_solution");
    expect(ratingFromKey({ key: "2" })).toBe("struggled");
    expect(ratingFromKey({ key: "3" })).toBe("easy");
  });

  it("ignores other keys", () => {
    expect(ratingFromKey({ key: "4" })).toBeNull();
    expect(ratingFromKey({ key: "a" })).toBeNull();
  });

  it("ignores a key pressed with Cmd, Ctrl or Alt so browser shortcuts still work", () => {
    expect(ratingFromKey({ key: "1", metaKey: true })).toBeNull();
    expect(ratingFromKey({ key: "2", ctrlKey: true })).toBeNull();
    expect(ratingFromKey({ key: "3", altKey: true })).toBeNull();
  });
});

describe("API requests", () => {
  it("logs an attempt with a POST of the rating only, so the server uses today", () => {
    expect(attemptRequest(7, "struggled")).toEqual({
      url: "/api/problems/7/attempts",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: "struggled" }),
      },
    });
  });

  it("undoes by deleting the attempt that was just logged", () => {
    expect(undoRequest(7, 42)).toEqual({
      url: "/api/problems/7/attempts/42",
      init: { method: "DELETE" },
    });
  });
});
