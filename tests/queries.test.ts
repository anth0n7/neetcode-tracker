// Tests for lib/queries.ts (the read side) against the test database. Each test
// builds its own throwaway problems inside a transaction that is rolled back.
//
// The database may hold other problems too, so tests either look only at
// their own problems (by id or by a unique pattern name) or compare counts
// before and after adding theirs.
import { describe, expect, it } from "vitest";
import { logAttempt, type Conn, type AttemptInput } from "@/lib/attempts";
import { getDue, getProblem, getProgress, listProblems } from "@/lib/queries";
import { day, makeProblem, TODAY, withRollback } from "./helpers";

// Log an Easy at each of these day offsets, in order. The offsets below are
// chosen so every Easy lands on (or after) the date the previous one scheduled,
// so each one counts and the gap grows.
async function easyAt(tx: Conn, id: number, ...offsets: number[]) {
  for (const o of offsets) await logAttempt(id, attempt(o, "easy"), tx);
}
const attempt = (offset: number, rating: AttemptInput["rating"], insight: string | null = null): AttemptInput => ({
  rating,
  minutes: null,
  insight,
  attemptedOn: day(offset),
});

// Ready-made journeys, relative to today (offset 0). SM-2 gaps for all-Easy: 1, 6, 16, 45 days.
//   inReviewDue:    one Easy 10 days ago -> gap 1, next review 9 days ago (9 days overdue)
//   inReviewLater:  one Easy today       -> gap 1, next review tomorrow
//   mastered:       Easy at -33,-32,-26,-10 -> gap 45, next review in 35 days (mastered, not due)
//   masteredDue:    Easy at -100,-99,-93,-77 -> gap 45, next review 32 days ago (mastered and due again)
const inReviewDue = (tx: Conn, id: number) => easyAt(tx, id, -10);
const inReviewLater = (tx: Conn, id: number) => easyAt(tx, id, 0);
const mastered = (tx: Conn, id: number) => easyAt(tx, id, -33, -32, -26, -10);
const masteredDue = (tx: Conn, id: number) => easyAt(tx, id, -100, -99, -93, -77);

let patternCounter = 0;
const uniquePattern = () => `T-Pattern-${Date.now()}-${patternCounter++}`;

describe("listProblems", () => {
  // Builds 4 problems in one pattern: unsolved, in review (due), mastered, in review (not due yet).
  async function build(tx: Conn) {
    const pattern = uniquePattern();
    const unsolved = await makeProblem(tx, { pattern, difficulty: "Easy", title: "Alpha Sum" });
    const due = await makeProblem(tx, { pattern, difficulty: "Medium", title: "Beta Window" });
    const done = await makeProblem(tx, { pattern, difficulty: "Hard", title: "Gamma Graph" });
    const later = await makeProblem(tx, { pattern, difficulty: "Hard", title: "Delta Sum" });
    await inReviewDue(tx, due);
    await mastered(tx, done);
    await inReviewLater(tx, later);
    return { pattern, unsolved, due, done, later };
  }

  it("returns each problem with its status and schedule, in list order", () =>
    withRollback(async (tx) => {
      const p = await build(tx);
      const rows = await listProblems({ pattern: p.pattern }, TODAY, tx);

      expect(rows.map((r) => r.id)).toEqual([p.unsolved, p.due, p.done, p.later]);
      expect(rows.map((r) => r.status)).toEqual(["unsolved", "in review", "mastered", "in review"]);
      expect(rows[0]).toMatchObject({ nextReview: null, due: false, daysOverdue: 0, intervalDays: null });
      expect(rows[1]).toMatchObject({ nextReview: day(-9), due: true, daysOverdue: 9, intervalDays: 1 });
      expect(rows[2]).toMatchObject({ nextReview: day(35), due: false, intervalDays: 45 });
      expect(rows[3]).toMatchObject({ nextReview: day(1), due: false, intervalDays: 1 });
    }));

  it("filters by status", () =>
    withRollback(async (tx) => {
      const p = await build(tx);
      const ids = async (status: string) =>
        (await listProblems({ pattern: p.pattern, status }, TODAY, tx)).map((r) => r.id);
      expect(await ids("unsolved")).toEqual([p.unsolved]);
      expect(await ids("in review")).toEqual([p.due, p.later]);
      expect(await ids("mastered")).toEqual([p.done]);
    }));

  it("filters by difficulty and by pattern", () =>
    withRollback(async (tx) => {
      const p = await build(tx);
      const hard = await listProblems({ pattern: p.pattern, difficulty: "Hard" }, TODAY, tx);
      expect(hard.map((r) => r.id)).toEqual([p.done, p.later]);
      expect(await listProblems({ pattern: "no such pattern" }, TODAY, tx)).toEqual([]);
    }));

  it("searches titles, ignoring case", () =>
    withRollback(async (tx) => {
      const p = await build(tx);
      const found = await listProblems({ pattern: p.pattern, q: "sUm" }, TODAY, tx);
      expect(found.map((r) => r.id)).toEqual([p.unsolved, p.later]); // Alpha Sum, Delta Sum
    }));

  it("combines filters (all must match)", () =>
    withRollback(async (tx) => {
      const p = await build(tx);
      const rows = await listProblems(
        { pattern: p.pattern, difficulty: "Hard", status: "in review", q: "delta" },
        TODAY,
        tx,
      );
      expect(rows.map((r) => r.id)).toEqual([p.later]);
      const none = await listProblems({ pattern: p.pattern, difficulty: "Easy", status: "mastered" }, TODAY, tx);
      expect(none).toEqual([]);
    }));

  it("includes the saved insight", () =>
    withRollback(async (tx) => {
      const pattern = uniquePattern();
      const id = await makeProblem(tx, { pattern });
      await logAttempt(id, attempt(0, "easy", "use a stack"), tx);
      const [row] = await listProblems({ pattern }, TODAY, tx);
      expect(row.insight).toBe("use a stack");
    }));
});

describe("getProblem", () => {
  it("returns the problem, its schedule and its attempts newest first", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, { ...attempt(-10, "needed_solution"), minutes: 30 }, tx);
      await logAttempt(id, attempt(-8, "easy", "sort first"), tx);

      const p = await getProblem(id, TODAY, tx);
      expect(p).not.toBeNull();
      expect(p!.id).toBe(id);
      expect(p!.status).toBe("in review");
      expect(p!.attempts.map((a) => a.attemptedOn)).toEqual([day(-8), day(-10)]);
      expect(p!.attempts[1]).toMatchObject({ rating: "needed_solution", minutes: 30 });
      expect(p!.attempts[0]).toMatchObject({ rating: "easy", insight: "sort first" });
    }));

  // The schedule is shown the way API clients see it: the ease factor as a
  // decimal (2.6, not 260), the SM-2 fields present, and no status field.
  it("shows the schedule with a decimal ease factor, repetitions and no status", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, attempt(-10, "needed_solution"), tx); // fail: gap 1, EF 2.50
      await logAttempt(id, attempt(-8, "easy"), tx); // due, a pass: gap 1, EF 2.60, 1 pass in a row

      const p = await getProblem(id, TODAY, tx);
      expect(p!.reviewState).toEqual({
        intervalDays: 1,
        easeFactor: 2.6,
        repetitions: 1,
        nextReview: day(-7),
        lastReviewed: day(-8),
        timesReviewed: 2,
      });
    }));

  it("an unsolved problem has no attempts and no review state", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      const p = await getProblem(id, TODAY, tx);
      expect(p).toMatchObject({ status: "unsolved", attempts: [], reviewState: null });
    }));

  it("returns null for an unknown id", () =>
    withRollback(async (tx) => {
      expect(await getProblem(123_456_789, TODAY, tx)).toBeNull();
    }));
});

describe("getDue", () => {
  it("lists only due problems: not unsolved, not scheduled for the future", () =>
    withRollback(async (tx) => {
      const before = await getDue({ today: TODAY, limit: 100_000, all: true }, tx);
      const pattern = uniquePattern();
      const unsolved = await makeProblem(tx, { pattern });
      const due = await makeProblem(tx, { pattern });
      const later = await makeProblem(tx, { pattern });
      await inReviewDue(tx, due);
      await inReviewLater(tx, later);

      const after = await getDue({ today: TODAY, limit: 100_000, all: true }, tx);
      const ours = after.items.filter((i) => [unsolved, due, later].includes(i.id)).map((i) => i.id);
      expect(ours).toEqual([due]);
      expect(after.total).toBe(before.total + 1);
    }));

  it("includes a mastered problem when its next review comes due (nothing is ever retired)", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await masteredDue(tx, id); // gap 45, next review 32 days ago
      const { items } = await getDue({ today: TODAY, limit: 100_000, all: true }, tx);
      const row = items.find((i) => i.id === id);
      expect(row).toMatchObject({ status: "mastered", daysOverdue: 32 });
    }));

  it("is due on its review date, and not the day before", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await easyAt(tx, id, -1); // gap 1: next review = today
      const onTheDay = await getDue({ today: TODAY, limit: 100_000, all: true }, tx);
      expect(onTheDay.items.find((i) => i.id === id)).toMatchObject({ daysOverdue: 0 });
      const dayBefore = await getDue({ today: day(-1), limit: 100_000, all: true }, tx);
      expect(dayBefore.items.find((i) => i.id === id)).toBeUndefined();
    }));

  it("sorts most overdue first, then Hard, Medium, Easy", () =>
    withRollback(async (tx) => {
      const pattern = uniquePattern();
      // Overdue by 5 days: Easy, Hard, Medium. Overdue by 2 days: Hard.
      const easy5 = await makeProblem(tx, { pattern, difficulty: "Easy" });
      const hard5 = await makeProblem(tx, { pattern, difficulty: "Hard" });
      const med5 = await makeProblem(tx, { pattern, difficulty: "Medium" });
      const hard2 = await makeProblem(tx, { pattern, difficulty: "Hard" });
      for (const id of [easy5, hard5, med5]) await easyAt(tx, id, -6); // gap 1 -> 5 days overdue
      await easyAt(tx, hard2, -3); // 2 days overdue

      const { items } = await getDue({ today: TODAY, limit: 100_000, all: true }, tx);
      const ours = items.filter((i) => [easy5, hard5, med5, hard2].includes(i.id)).map((i) => i.id);
      expect(ours).toEqual([hard5, med5, easy5, hard2]);
    }));

  it("limits the list unless all is true, but total always counts everything", () =>
    withRollback(async (tx) => {
      const pattern = uniquePattern();
      for (let i = 0; i < 3; i++) await easyAt(tx, await makeProblem(tx, { pattern }), -10);

      const limited = await getDue({ today: TODAY, limit: 2, all: false }, tx);
      const everything = await getDue({ today: TODAY, limit: 2, all: true }, tx);
      expect(limited.items).toHaveLength(2);
      expect(limited.total).toBeGreaterThanOrEqual(3);
      expect(everything.items).toHaveLength(everything.total);
      expect(everything.total).toBe(limited.total);
    }));

  it("returns what the Today screen shows: title, pattern, days overdue and insight", () =>
    withRollback(async (tx) => {
      const pattern = uniquePattern();
      const id = await makeProblem(tx, { pattern, title: "Two Sum Test" });
      await logAttempt(id, attempt(-10, "easy", "complement in a map"), tx);
      const { items } = await getDue({ today: TODAY, limit: 100_000, all: true }, tx);
      expect(items.find((i) => i.id === id)).toMatchObject({
        title: "Two Sum Test",
        pattern,
        daysOverdue: 9,
        insight: "complement in a map",
        url: expect.stringContaining("example.com"),
      });
    }));
});

describe("getProgress", () => {
  it("counts solved, mastered and due per pattern (there is no retired count)", () =>
    withRollback(async (tx) => {
      const pattern = uniquePattern();
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await makeProblem(tx, { pattern }));
      // ids[0] stays unsolved
      await inReviewLater(tx, ids[1]);
      await inReviewDue(tx, ids[2]); // due
      await mastered(tx, ids[3]);
      await masteredDue(tx, ids[4]); // mastered AND due again

      const { patterns } = await getProgress(TODAY, tx);
      expect(patterns.find((p) => p.pattern === pattern)).toEqual({
        pattern,
        total: 5,
        solved: 4,
        mastered: 2,
        due: 2,
      });
    }));

  it("totals add up the same way, with no retired count", () =>
    withRollback(async (tx) => {
      const before = (await getProgress(TODAY, tx)).totals;
      const pattern = uniquePattern();
      const [a, b, c] = [await makeProblem(tx, { pattern }), await makeProblem(tx, { pattern }), await makeProblem(tx, { pattern })];
      await inReviewDue(tx, a);
      await mastered(tx, b);
      void c; // unsolved

      const after = (await getProgress(TODAY, tx)).totals;
      expect(after.problems - before.problems).toBe(3);
      expect(after.solved - before.solved).toBe(2);
      expect(after.mastered - before.mastered).toBe(1);
      expect(after.due - before.due).toBe(1);
      expect(after).not.toHaveProperty("retired");
    }));

  it("counts attempts from the last 7 days (today and the 6 days before)", () =>
    withRollback(async (tx) => {
      const before = (await getProgress(TODAY, tx)).totals.attemptsLast7Days;
      const id = await makeProblem(tx);
      // -7 is just outside the window; -6 and 0 are inside.
      await logAttempt(id, attempt(-7, "easy"), tx);
      await logAttempt(id, attempt(-6, "easy"), tx);
      await logAttempt(id, attempt(0, "easy"), tx);
      const after = (await getProgress(TODAY, tx)).totals.attemptsLast7Days;
      expect(after - before).toBe(2);
    }));

  it("lists patterns in NeetCode list order", () =>
    withRollback(async (tx) => {
      const first = uniquePattern();
      const second = uniquePattern();
      await makeProblem(tx, { pattern: first, position: 900_001 });
      await makeProblem(tx, { pattern: second, position: 900_002 });
      const names = (await getProgress(TODAY, tx)).patterns.map((p) => p.pattern);
      expect(names.indexOf(first)).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(first)).toBeLessThan(names.indexOf(second));
    }));
});
