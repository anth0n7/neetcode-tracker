import { eq, and } from "drizzle-orm";
import type { ResultSet } from "@libsql/client";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";
import { attempts, problems, reviewState } from "@/db/schema";
import { db } from "./db";
import { HttpError } from "./http";
import { replay, type Rating, type ReviewState } from "./scheduler";

export type Conn = BaseSQLiteDatabase<"async", ResultSet, typeof schema>;

// "immediate" takes SQLite's write lock before the first read, so two writes
// to the same problem cannot interleave between reading and rebuilding its state.
const WRITE = { behavior: "immediate" } as const;

export type AttemptInput = {
  rating: Rating;
  minutes: number | null;
  insight: string | null;
  attemptedOn: string;
};

const notFound = (what: string) => new HttpError(404, `${what} not found`);

async function requireProblem(tx: Conn, problemId: number): Promise<void> {
  const rows = await tx.select({ id: problems.id }).from(problems).where(eq(problems.id, problemId));
  if (rows.length === 0) throw notFound("Problem");
}

async function rebuildReviewState(tx: Conn, problemId: number): Promise<ReviewState | null> {
  const rows = await tx.select().from(attempts).where(eq(attempts.problemId, problemId));
  const state = replay(rows.map((r) => ({ id: r.id, attemptedOn: r.attemptedOn, rating: r.rating as Rating })));

  if (state === null) {
    await tx.delete(reviewState).where(eq(reviewState.problemId, problemId));
  } else {
    await tx
      .insert(reviewState)
      .values({ problemId, ...state })
      .onConflictDoUpdate({ target: reviewState.problemId, set: state });
  }
  return state;
}

export async function logAttempt(
  problemId: number,
  input: AttemptInput,
  conn: Conn = db,
): Promise<{ attemptId: number; reviewState: ReviewState | null }> {
  return conn.transaction(async (tx) => {
    await requireProblem(tx, problemId);

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

    if (input.insight !== null) {
      await tx.update(problems).set({ insight: input.insight }).where(eq(problems.id, problemId));
    }

    return { attemptId: saved.id, reviewState: await rebuildReviewState(tx, problemId) };
  }, WRITE);
}

export async function deleteAttempt(
  problemId: number,
  attemptId: number,
  conn: Conn = db,
): Promise<{ reviewState: ReviewState | null }> {
  return conn.transaction(async (tx) => {
    await requireProblem(tx, problemId);

    const deleted = await tx
      .delete(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.problemId, problemId)))
      .returning({ id: attempts.id });
    if (deleted.length === 0) throw notFound("Attempt");

    return { reviewState: await rebuildReviewState(tx, problemId) };
  }, WRITE);
}

export async function setInsight(problemId: number, insight: string | null, conn: Conn = db): Promise<void> {
  const updated = await conn
    .update(problems)
    .set({ insight })
    .where(eq(problems.id, problemId))
    .returning({ id: problems.id });
  if (updated.length === 0) throw notFound("Problem");
}
