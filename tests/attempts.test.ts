// Tests for lib/attempts.ts against the dev database. Every test runs inside a
// transaction that is rolled back, so nothing is left behind.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attempts, problems, reviewState } from "@/db/schema";
import { deleteAttempt, logAttempt, setInsight, type AttemptInput } from "@/lib/attempts";
import { HttpError } from "@/lib/http";
import { day, makeProblem, withRollback } from "./helpers";

// Shorthand: an attempt `offset` days from the pretend today.
const input = (offset: number, rating: AttemptInput["rating"], extra: Partial<AttemptInput> = {}): AttemptInput => ({
  rating,
  minutes: null,
  insight: null,
  attemptedOn: day(offset),
  ...extra,
});

describe("logAttempt", () => {
  it("creates the attempt and the review state together", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      const { attemptId, reviewState: state } = await logAttempt(id, input(0, "needed_solution"), tx);

      expect(attemptId).toBeGreaterThan(0);
      expect(state).toMatchObject({ intervalDays: 2, nextReview: day(2), status: "in_review", timesReviewed: 1 });

      const rows = await tx.select().from(attempts).where(eq(attempts.problemId, id));
      expect(rows).toHaveLength(1);
      const [saved] = await tx.select().from(reviewState).where(eq(reviewState.problemId, id));
      expect(saved).toMatchObject({ intervalDays: 2, nextReview: day(2), lastReviewed: day(0), status: "in_review" });
    }));

  it("follows the rules across several attempts", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, input(0, "easy"), tx); // interval 7, next day 7
      const { reviewState: state } = await logAttempt(id, input(7, "easy"), tx); // due, so it counts: 14
      expect(state).toMatchObject({ intervalDays: 14, nextReview: day(21), timesReviewed: 2 });
    }));

  it("logs an early Easy without changing the schedule", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, input(0, "easy"), tx); // next review day 7
      const { reviewState: state } = await logAttempt(id, input(3, "easy"), tx);
      expect(state).toMatchObject({ intervalDays: 7, nextReview: day(7), timesReviewed: 2 });
      expect(await tx.select().from(attempts).where(eq(attempts.problemId, id))).toHaveLength(2);
    }));

  it("gives the same result when attempts are logged out of date order", () =>
    withRollback(async (tx) => {
      const a = await makeProblem(tx);
      await logAttempt(a, input(0, "needed_solution"), tx);
      const inOrder = (await logAttempt(a, input(5, "easy"), tx)).reviewState;

      const b = await makeProblem(tx);
      await logAttempt(b, input(5, "easy"), tx);
      const backdated = (await logAttempt(b, input(0, "needed_solution"), tx)).reviewState;

      expect(backdated).toEqual(inOrder);
    }));

  it("stores minutes and the attempt's own insight", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, input(0, "easy", { minutes: 25, insight: "use a hash map" }), tx);
      const [row] = await tx.select().from(attempts).where(eq(attempts.problemId, id));
      expect(row).toMatchObject({ minutes: 25, insight: "use a hash map", rating: "easy", attemptedOn: day(0) });
    }));

  it("copies a non-empty insight onto the problem", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, input(0, "easy", { insight: "two pointers" }), tx);
      const [p] = await tx.select().from(problems).where(eq(problems.id, id));
      expect(p.insight).toBe("two pointers");
    }));

  it("keeps the existing insight when the new attempt has none", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, input(0, "easy", { insight: "two pointers" }), tx);
      await logAttempt(id, input(7, "easy", { insight: null }), tx);
      const [p] = await tx.select().from(problems).where(eq(problems.id, id));
      expect(p.insight).toBe("two pointers");
    }));

  it("throws 404 for an unknown problem and writes nothing", () =>
    withRollback(async (tx) => {
      const error = await logAttempt(123_456_789, input(0, "easy"), tx).catch((e) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(404);
    }));
});

describe("deleteAttempt", () => {
  it("restores the previous schedule", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      await logAttempt(id, input(0, "easy"), tx);
      const second = await logAttempt(id, input(7, "struggled"), tx);
      expect(second.reviewState).toMatchObject({ intervalDays: 3 });

      const { reviewState: state } = await deleteAttempt(id, second.attemptId, tx);
      expect(state).toMatchObject({ intervalDays: 7, nextReview: day(7), timesReviewed: 1 });
    }));

  it("deleting the only attempt makes the problem unsolved again", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      const { attemptId } = await logAttempt(id, input(0, "easy"), tx);

      const { reviewState: state } = await deleteAttempt(id, attemptId, tx);
      expect(state).toBeNull();
      expect(await tx.select().from(reviewState).where(eq(reviewState.problemId, id))).toHaveLength(0);
      expect(await tx.select().from(attempts).where(eq(attempts.problemId, id))).toHaveLength(0);
    }));

  it("never changes the problem's insight", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      const { attemptId } = await logAttempt(id, input(0, "easy", { insight: "keep me" }), tx);
      await deleteAttempt(id, attemptId, tx);
      const [p] = await tx.select().from(problems).where(eq(problems.id, id));
      expect(p.insight).toBe("keep me");
    }));

  it("throws 404 when the attempt belongs to a different problem, and deletes nothing", () =>
    withRollback(async (tx) => {
      const mine = await makeProblem(tx);
      const other = await makeProblem(tx);
      const { attemptId } = await logAttempt(other, input(0, "easy"), tx);

      const error = await deleteAttempt(mine, attemptId, tx).catch((e) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(404);
      expect(await tx.select().from(attempts).where(eq(attempts.id, attemptId))).toHaveLength(1);
    }));

  it("throws 404 for an unknown attempt or problem", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      expect((await deleteAttempt(id, 123_456_789, tx).catch((e) => e)).status).toBe(404);
      expect((await deleteAttempt(123_456_789, 1, tx).catch((e) => e)).status).toBe(404);
    }));
});

describe("setInsight", () => {
  it("sets, replaces and clears the insight without logging an attempt", () =>
    withRollback(async (tx) => {
      const id = await makeProblem(tx);
      const read = async () => (await tx.select().from(problems).where(eq(problems.id, id)))[0].insight;

      await setInsight(id, "first idea", tx);
      expect(await read()).toBe("first idea");
      await setInsight(id, "better idea", tx);
      expect(await read()).toBe("better idea");
      await setInsight(id, null, tx);
      expect(await read()).toBeNull();
      expect(await tx.select().from(attempts).where(eq(attempts.problemId, id))).toHaveLength(0);
    }));

  it("throws 404 for an unknown problem", () =>
    withRollback(async (tx) => {
      expect((await setInsight(123_456_789, "x", tx).catch((e) => e)).status).toBe(404);
    }));
});
