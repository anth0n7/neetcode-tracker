import { realpathSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attempts, problems, reviewState } from "@/db/schema";
import { logAttempt } from "@/lib/attempts";
import { db } from "@/lib/db";
import { TEST_DATABASE_DIR } from "./test-db";

describe("the test database", () => {
  it("is the test database, and logAttempt saves an attempt and its schedule", async () => {
    const { rows } = await db.run(sql`pragma database_list`);
    const file = realpathSync(String(rows[0].file));
    expect(path.dirname(file)).toBe(realpathSync(TEST_DATABASE_DIR));
    expect(file).toMatch(/\.test\.db$/);

    await db.insert(problems).values({
      id: 1,
      position: 1,
      title: "Example",
      slug: "example",
      url: "https://example.com/1",
      pattern: "Example Pattern",
      difficulty: "Easy",
    });

    const result = await logAttempt(1, {
      rating: "easy",
      minutes: null,
      insight: null,
      attemptedOn: "2026-01-01",
    });
    expect(result.reviewState).toMatchObject({ intervalDays: 1, easeFactor: 260, repetitions: 1, nextReview: "2026-01-02" });

    expect(await db.select().from(attempts).where(eq(attempts.problemId, 1))).toHaveLength(1);
    const [saved] = await db.select().from(reviewState).where(eq(reviewState.problemId, 1));
    expect(saved).toMatchObject({ intervalDays: 1, easeFactor: 260, nextReview: "2026-01-02", timesReviewed: 1 });
  });

  it("starts the next test with empty tables (the data was reset)", async () => {
    expect(await db.select().from(problems)).toHaveLength(0);
    expect(await db.select().from(attempts)).toHaveLength(0);
    expect(await db.select().from(reviewState)).toHaveLength(0);
  });
});
