import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { problems, reviewState } from "@/db/schema";
import { db } from "@/lib/db";

async function reviewStateColumns() {
  const { rows } = await db.run(sql`pragma table_info('review_state')`);
  return rows.map((r) => ({
    name: String(r.name),
    type: String(r.type).toLowerCase(),
    nullable: r.notnull ? ("NO" as const) : ("YES" as const),
  }));
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
    expect(cols.next_review).toMatchObject({ type: "text", nullable: "NO" });
  });

  it("has no leftover check constraint about the old status values", async () => {
    const { rows } = await db.run(sql`select sql as definition from sqlite_master where name = 'review_state'`);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].definition)).not.toMatch(/retired|status/);
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
    const { rows } = await db.run(sql`select ease_factor, repetitions from review_state where problem_id = 1`);
    expect(rows[0]).toMatchObject({ ease_factor: 246, repetitions: 2 });
  });

  it("rejects a row with no next review date", async () => {
    await db.insert(problems).values({
      id: 1, position: 1, title: "T", slug: "t", url: "https://example.com", pattern: "P", difficulty: "Easy",
    });
    const error = await db
      .run(
        sql`insert into review_state (problem_id, interval_days, ease_factor, repetitions, last_reviewed, times_reviewed)
            values (1, 1, 250, 0, '2026-01-01', 1)`,
      )
      .catch((e) => e);
    expect(String(error?.cause?.message ?? "")).toMatch(/NOT NULL constraint failed: review_state\.next_review/);
  });
});

describe("review_state value checks", () => {
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
