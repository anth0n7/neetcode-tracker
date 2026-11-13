// Tests for the shape of the review_state table after the switch to SM-2.
//
// They look at the real test database (after tests/global-setup.ts has applied
// every migration in /drizzle), so they prove the migrations produce the table the
// spec describes, not just that the TypeScript schema file says so.
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { problems, reviewState } from "@/db/schema";
import { db } from "@/lib/db";

// One row per column of review_state: its name, type and whether NULL is allowed.
async function reviewStateColumns() {
  const { rows } = await db.execute(sql`
    select column_name as name, data_type as type, is_nullable as nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'review_state'
    order by ordinal_position`);
  return rows as { name: string; type: string; nullable: "YES" | "NO" }[];
}

describe("review_state after the SM-2 migration", () => {
  it("has exactly the columns the spec lists, and no status column", async () => {
    const names = (await reviewStateColumns()).map((c) => c.name).sort();
    expect(names).toEqual(
      ["ease_factor", "interval_days", "last_reviewed", "next_review", "problem_id", "repetitions", "times_reviewed"].sort(),
    );
  });

  it("stores the ease factor and repetitions as required whole numbers", async () => {
    const cols = Object.fromEntries((await reviewStateColumns()).map((c) => [c.name, c]));
    expect(cols.ease_factor).toMatchObject({ type: "integer", nullable: "NO" });
    expect(cols.repetitions).toMatchObject({ type: "integer", nullable: "NO" });
  });

  it("always has a next review date (nothing is ever retired)", async () => {
    const cols = Object.fromEntries((await reviewStateColumns()).map((c) => [c.name, c]));
    expect(cols.next_review).toMatchObject({ type: "date", nullable: "NO" });
  });

  it("has no leftover check constraint about the old status values", async () => {
    const { rows } = await db.execute(sql`
      select pg_get_constraintdef(c.oid) as definition
      from pg_constraint c join pg_class t on t.oid = c.conrelid
      where t.relname = 'review_state' and c.contype = 'c'`);
    expect(rows.map((r) => String(r.definition)).join(" ")).not.toMatch(/retired|status/);
  });

  it("accepts a row in the new shape", async () => {
    await db.insert(problems).values({
      id: 1, position: 1, title: "T", slug: "t", url: "https://example.com", pattern: "P", difficulty: "Easy",
    });
    await db.insert(reviewState).values({
      problemId: 1,
      intervalDays: 6,
      easeFactor: 246,
      repetitions: 2,
      nextReview: "2026-01-08",
      lastReviewed: "2026-01-02",
      timesReviewed: 2,
    });
    const { rows } = await db.execute(sql`select ease_factor, repetitions from review_state where problem_id = 1`);
    expect(rows[0]).toMatchObject({ ease_factor: 246, repetitions: 2 });
  });

  it("rejects a row with no next review date", async () => {
    await db.insert(problems).values({
      id: 1, position: 1, title: "T", slug: "t", url: "https://example.com", pattern: "P", difficulty: "Easy",
    });
    // Drizzle wraps Postgres errors: the top-level message is "Failed query: ...",
    // and Postgres's own message (what we want to check) is in `cause`.
    const error = await db
      .execute(
        sql`insert into review_state (problem_id, interval_days, ease_factor, repetitions, last_reviewed, times_reviewed)
            values (1, 1, 250, 0, '2026-01-01', 1)`,
      )
      .catch((e) => e);
    expect(String(error?.cause?.message ?? "")).toMatch(/null value in column "next_review"/);
  });
});

// Hard limits from the spec that the database itself enforces, as a safety net in
// case code ever writes a bad schedule.
describe("review_state value checks", () => {
  // Try to save a schedule with these two numbers; return the error (or null if it saved).
  async function tryInsert(o: { easeFactor: number; repetitions: number }) {
    await db.insert(problems).values({
      id: 1, position: 1, title: "T", slug: "t", url: "https://example.com", pattern: "P", difficulty: "Easy",
    });
    return db
      .insert(reviewState)
      .values({
        problemId: 1,
        intervalDays: 1,
        easeFactor: o.easeFactor,
        repetitions: o.repetitions,
        nextReview: "2026-01-02",
        lastReviewed: "2026-01-01",
        timesReviewed: 1,
      })
      .then(() => null)
      .catch((e) => e);
  }
  const reason = (e: unknown) => String((e as { cause?: { message?: string } } | null)?.cause?.message ?? "");

  it("accepts the lowest allowed values (ease factor 1.30, 0 repetitions)", async () => {
    expect(await tryInsert({ easeFactor: 130, repetitions: 0 })).toBeNull();
  });

  it("rejects an ease factor below 1.30", async () => {
    const error = await tryInsert({ easeFactor: 129, repetitions: 0 });
    expect(reason(error)).toMatch(/review_state_ease_factor_check/);
  });

  it("rejects negative repetitions", async () => {
    const error = await tryInsert({ easeFactor: 250, repetitions: -1 });
    expect(reason(error)).toMatch(/review_state_repetitions_check/);
  });
});
