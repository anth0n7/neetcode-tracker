// The database code that changes things: logging an attempt, deleting one, and
// editing an insight.
//
// The key idea: the attempts table is the truth, and review_state is just a
// saved result. After ANY change to a problem's attempts we run replay() over all
// of them and save what it returns. That means a backdated attempt, a deleted
// attempt or a mistaken click can never leave the schedule out of sync.
import { eq, and } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { attempts, problems, reviewState } from "@/db/schema";
import { db } from "./db";
import { HttpError } from "./http";
import { replay, type Rating, type ReviewState } from "./scheduler";

// Either the normal database connection or an open transaction. Every function
// below takes one as an optional last argument (defaulting to the real
// connection) so tests can pass a transaction they roll back afterwards.
export type Conn = PgDatabase<NodePgQueryResultHKT, typeof schema>;

// A validated attempt (see lib/validate.ts), ready to save.
export type AttemptInput = {
  rating: Rating;
  minutes: number | null;
  insight: string | null;
  attemptedOn: string; // YYYY-MM-DD
};

const notFound = (what: string) => new HttpError(404, `${what} not found`);

// Lock the problem's row until the transaction ends, or fail with a 404 if there
// is no such problem. The lock makes two simultaneous requests for the same
// problem take turns, so neither can replay a half-updated list of attempts.
async function lockProblem(tx: Conn, problemId: number): Promise<void> {
  const rows = await tx.select({ id: problems.id }).from(problems).where(eq(problems.id, problemId)).for("update");
  if (rows.length === 0) throw notFound("Problem");
}

// Recompute the problem's schedule from all its attempts and save it.
// No attempts left means the problem is unsolved, so its review_state row is removed.
async function rebuildReviewState(tx: Conn, problemId: number): Promise<ReviewState | null> {
  const rows = await tx.select().from(attempts).where(eq(attempts.problemId, problemId));
  const state = replay(rows.map((r) => ({ id: r.id, attemptedOn: r.attemptedOn, rating: r.rating as Rating })));

  if (state === null) {
    await tx.delete(reviewState).where(eq(reviewState.problemId, problemId));
  } else {
    // Insert the row, or update it if the problem already has one.
    await tx
      .insert(reviewState)
      .values({ problemId, ...state })
      .onConflictDoUpdate({ target: reviewState.problemId, set: state });
  }
  return state;
}

// Save a new attempt and update the schedule, all in one transaction: either
// both happen or neither does.
export async function logAttempt(
  problemId: number,
  input: AttemptInput,
  conn: Conn = db,
): Promise<{ attemptId: number; reviewState: ReviewState | null }> {
  return conn.transaction(async (tx) => {
    await lockProblem(tx, problemId);

    const [saved] = await tx
      .insert(attempts)
      .values({
        problemId,
        attemptedOn: input.attemptedOn,
        rating: input.rating,
        minutes: input.minutes,
        insight: input.insight,
      })
      .returning({ id: attempts.id });

    // A new non-empty insight becomes the problem's current insight. An attempt
    // with no insight leaves the existing one alone.
    if (input.insight !== null) {
      await tx.update(problems).set({ insight: input.insight }).where(eq(problems.id, problemId));
    }

    return { attemptId: saved.id, reviewState: await rebuildReviewState(tx, problemId) };
  });
}

// Delete one attempt (the "Undo" button, or a row in the attempt history) and
// rebuild the schedule from what's left. The problem's insight is deliberately
// NOT rolled back: it may have been edited by hand since.
export async function deleteAttempt(
  problemId: number,
  attemptId: number,
  conn: Conn = db,
): Promise<{ reviewState: ReviewState | null }> {
  return conn.transaction(async (tx) => {
    await lockProblem(tx, problemId);

    // Matching on BOTH ids means you can't delete another problem's attempt by
    // putting the wrong problem in the URL.
    const deleted = await tx
      .delete(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.problemId, problemId)))
      .returning({ id: attempts.id });
    if (deleted.length === 0) throw notFound("Attempt");

    return { reviewState: await rebuildReviewState(tx, problemId) };
  });
}

// Edit the insight directly, without logging an attempt. null clears it.
export async function setInsight(problemId: number, insight: string | null, conn: Conn = db): Promise<void> {
  const updated = await conn
    .update(problems)
    .set({ insight })
    .where(eq(problems.id, problemId))
    .returning({ id: problems.id });
  if (updated.length === 0) throw notFound("Problem");
}
