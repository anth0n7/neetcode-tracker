import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";

// Dates are YYYY-MM-DD strings everywhere (mode: "string"), never JS Dates,
// so time zones can't shift a day.

export const problems = pgTable(
  "problems",
  {
    id: integer("id").primaryKey(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    url: text("url").notNull(),
    pattern: text("pattern").notNull(),
    difficulty: text("difficulty").notNull(),
    // User-owned: never written by the seed script.
    insight: text("insight"),
  },
  (t) => [
    check("problems_difficulty_check", sql`${t.difficulty} in ('Easy','Medium','Hard')`),
  ],
);

export const attempts = pgTable(
  "attempts",
  {
    id: serial("id").primaryKey(),
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id),
    attemptedOn: date("attempted_on", { mode: "string" }).notNull(),
    rating: text("rating").notNull(),
    minutes: integer("minutes"),
    insight: text("insight"),
  },
  (t) => [
    index("attempts_problem_id_idx").on(t.problemId),
    check("attempts_rating_check", sql`${t.rating} in ('easy','struggled','needed_solution')`),
  ],
);

export const reviewState = pgTable(
  "review_state",
  {
    problemId: integer("problem_id")
      .primaryKey()
      .references(() => problems.id),
    intervalDays: integer("interval_days").notNull(),
    // null only when retired
    nextReview: date("next_review", { mode: "string" }),
    lastReviewed: date("last_reviewed", { mode: "string" }).notNull(),
    timesReviewed: integer("times_reviewed").notNull(),
    status: text("status").notNull(),
  },
  (t) => [
    index("review_state_next_review_idx").on(t.nextReview),
    check("review_state_status_check", sql`${t.status} in ('in_review','mastered','retired')`),
  ],
);
