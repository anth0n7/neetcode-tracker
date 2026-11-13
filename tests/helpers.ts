import { TransactionRollbackError } from "drizzle-orm";
import { problems } from "@/db/schema";
import { db } from "@/lib/db";
import type { Conn } from "@/lib/attempts";
import { addDays } from "@/lib/scheduler";

export async function withRollback(body: (tx: Conn) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await body(tx);
      tx.rollback();
    });
  } catch (e) {
    if (!(e instanceof TransactionRollbackError)) throw e;
  }
}

let nextProblemId = 990_001;

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

export const TODAY = "2026-06-15";
export const day = (offset: number) => addDays(TODAY, offset);
