// A small end-to-end example that proves the test-database setup works.
//
// Test 1 runs real backend logic (logAttempt) against the real test Postgres and
// COMMITS, with no rollback and no mocks. Test 2 then checks that the data from
// test 1 is gone, which shows the per-test reset in tests/setup-db.ts works.
// (Vitest runs the tests in a file from top to bottom, so the order is reliable.)
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attempts, problems, reviewState } from "@/db/schema";
import { logAttempt } from "@/lib/attempts";
import { db } from "@/lib/db";

describe("the test database", () => {
  it("is the test database, and logAttempt saves an attempt and its schedule", async () => {
    // The app's own connection (lib/db.ts) must be talking to the test database.
    const { rows } = await db.execute(sql`select current_database() as name`);
    expect(rows[0].name).toBe("neetcode_tracker_test");

    await db.insert(problems).values({
      id: 1,
      position: 1,
      title: "Example",
      slug: "example",
      url: "https://example.com/1",
      pattern: "Example Pattern",
      difficulty: "Easy",
    });

    // First attempt, rated Easy: the schedule rules say 7 days.
    const result = await logAttempt(1, {
      rating: "easy",
      minutes: null,
      insight: null,
      attemptedOn: "2026-01-01",
    });
    expect(result.reviewState).toMatchObject({ intervalDays: 7, nextReview: "2026-01-08", status: "in_review" });

    // Read it back with separate queries: both rows were really saved.
    expect(await db.select().from(attempts).where(eq(attempts.problemId, 1))).toHaveLength(1);
    const [saved] = await db.select().from(reviewState).where(eq(reviewState.problemId, 1));
    expect(saved).toMatchObject({ intervalDays: 7, nextReview: "2026-01-08", timesReviewed: 1 });
  });

  it("starts the next test with empty tables (the data was reset)", async () => {
    expect(await db.select().from(problems)).toHaveLength(0);
    expect(await db.select().from(attempts)).toHaveLength(0);
    expect(await db.select().from(reviewState)).toHaveLength(0);
  });
});
