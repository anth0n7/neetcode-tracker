import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const problems = sqliteTable(
  "problems",
  {
    id: integer("id").primaryKey(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    url: text("url").notNull(),
    pattern: text("pattern").notNull(),
    difficulty: text("difficulty").notNull(),
    insight: text("insight"),
  },
  (t) => [
    check("problems_difficulty_check", sql`${t.difficulty} in ('Easy','Medium','Hard')`),
  ],
);

export const attempts = sqliteTable(
  "attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id),
    attemptedOn: text("attempted_on").notNull(),
    rating: text("rating").notNull(),
    minutes: integer("minutes"),
    insight: text("insight"),
  },
  (t) => [
    index("attempts_problem_id_idx").on(t.problemId),
    check("attempts_rating_check", sql`${t.rating} in ('easy','struggled','needed_solution')`),
  ],
);

export const reviewState = sqliteTable(
  "review_state",
  {
    problemId: integer("problem_id")
      .primaryKey()
      .references(() => problems.id),
    intervalDays: integer("interval_days").notNull(),
    easeFactor: integer("ease_factor").notNull(),
    repetitions: integer("repetitions").notNull(),
    nextReview: text("next_review").notNull(),
    lastReviewed: text("last_reviewed").notNull(),
    timesReviewed: integer("times_reviewed").notNull(),
  },
  (t) => [
    index("review_state_next_review_idx").on(t.nextReview),
    check("review_state_ease_factor_check", sql`${t.easeFactor} >= 130`),
    check("review_state_repetitions_check", sql`${t.repetitions} >= 0`),
  ],
);
