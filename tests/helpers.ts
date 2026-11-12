// Shared helpers for the database tests.
import { TransactionRollbackError } from "drizzle-orm";
import { problems } from "@/db/schema";
import { db } from "@/lib/db";
import type { Conn } from "@/lib/attempts";
import { addDays } from "@/lib/scheduler";

// Run a test body inside a database transaction that is ALWAYS rolled back, so
// the test can write whatever it likes and leave the dev database untouched.
// (Library code that opens its own transaction becomes a "savepoint" inside this one.)
export async function withRollback(body: (tx: Conn) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await body(tx);
      tx.rollback();
    });
  } catch (e) {
    // Rolling back throws a special error on purpose. Anything else (including
    // a failed assertion inside `body`) is a real failure and is re-thrown.
    if (!(e instanceof TransactionRollbackError)) throw e;
  }
}

// Test problems use ids far above the real 1-250 and the fixture's 9001-9005.
let nextProblemId = 990_001;

// Insert a throwaway problem and return its id.
export async function makeProblem(
  tx: Conn,
  o: { pattern?: string; difficulty?: string; position?: number; title?: string } = {},
): Promise<number> {
  const id = nextProblemId++;
  await tx.insert(problems).values({
    id,
    position: o.position ?? id,
    title: o.title ?? `Test problem ${id}`,
    slug: `test-problem-${id}`,
    url: `https://example.com/${id}`,
    pattern: o.pattern ?? "T-Pattern-A",
    difficulty: o.difficulty ?? "Medium",
  });
  return id;
}

// A fixed pretend "today" so tests don't depend on the real date.
export const TODAY = "2026-06-15";
export const day = (offset: number) => addDays(TODAY, offset);
