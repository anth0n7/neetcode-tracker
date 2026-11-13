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

// The three database tables. Each one is defined once here; Drizzle turns this
// into the SQL migrations in /drizzle and gives the rest of the code typed access.
//
// Dates are YYYY-MM-DD strings everywhere (mode: "string"), never JS Dates,
// so time zones can't shift a day.

// Static data about each of the 250 problems. Loaded from the seed file.

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
    // Your one-line key insight. It belongs to you, not the seed file, so
    // re-running the seed script never overwrites it.
    insight: text("insight"),
  },
  // The database itself rejects any difficulty that isn't one of these three.
  (t) => [
    check("problems_difficulty_check", sql`${t.difficulty} in ('Easy','Medium','Hard')`),
  ],
);

// A log of every attempt. Rows are added or deleted but never edited, so this
// is the full history. The schedule is always rebuilt from these rows.
export const attempts = pgTable(
  "attempts",
  {
    id: serial("id").primaryKey(), // auto-numbered; also breaks ties between same-day attempts
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id),
    attemptedOn: date("attempted_on", { mode: "string" }).notNull(),
    rating: text("rating").notNull(),
    minutes: integer("minutes"),
    // The insight as you wrote it at this attempt (history only; the current
    // one lives on the problems table).
    insight: text("insight"),
  },
  // The index makes "all attempts for this problem" fast.
  (t) => [
    index("attempts_problem_id_idx").on(t.problemId),
    check("attempts_rating_check", sql`${t.rating} in ('easy','struggled','needed_solution')`),
  ],
);

// The current schedule for each problem that has been attempted at least once.
// This is a cache: it is always recomputed from the attempts table by
// replay() in lib/scheduler.ts, never edited by hand. Unsolved problems have
// no row here.
//
// It holds SM-2's three numbers (the gap, the ease factor and the number of
// passes in a row). There is no "status" column: whether a problem is "in review"
// or "mastered" is worked out from the gap (see problemStatus in lib/scheduler.ts).
export const reviewState = pgTable(
  "review_state",
  {
    problemId: integer("problem_id")
      .primaryKey()
      .references(() => problems.id),
    // The current gap between reviews, in whole days.
    intervalDays: integer("interval_days").notNull(),
    // SM-2's ease factor in HUNDREDTHS (250 = 2.50), so the maths stays exact.
    easeFactor: integer("ease_factor").notNull(),
    // How many passes in a row since the last failure (SM-2's "n").
    repetitions: integer("repetitions").notNull(),
    // Always set: SM-2 never retires a problem, it just waits longer.
    nextReview: date("next_review", { mode: "string" }).notNull(),
    lastReviewed: date("last_reviewed", { mode: "string" }).notNull(),
    timesReviewed: integer("times_reviewed").notNull(),
  },
  (t) => [
    // The index makes "what is due today?" fast.
    index("review_state_next_review_idx").on(t.nextReview),
    // Hard limits from the spec, enforced by the database as a safety net in case
    // code ever writes a bad schedule: the ease factor never goes below 1.30, and
    // the number of passes in a row can't be negative.
    check("review_state_ease_factor_check", sql`${t.easeFactor} >= 130`),
    check("review_state_repetitions_check", sql`${t.repetitions} >= 0`),
  ],
);
