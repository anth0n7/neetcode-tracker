// The scheduling rules: given a problem's attempts, work out when to review it next.
//
// This file is "pure": it never touches the database or reads the clock.
// Everything it needs (including what "today" is) is passed in, which makes it
// easy to test. See docs/SPEC.md for the rules in table form.
//
// Dates are plain "YYYY-MM-DD" strings throughout, e.g. "2026-11-12".

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// How an attempt went.
export type Rating = "easy" | "struggled" | "needed_solution";

// Where a problem is in its review journey:
//   in_review - still working up the ladder of longer and longer gaps
//   mastered  - passed the 28-day review; waiting on one last 90-day recheck
//   retired   - passed the 90-day recheck; never due again
export type Status = "in_review" | "mastered" | "retired";

export type Difficulty = "Easy" | "Medium" | "Hard";

// The label shown in the UI. "unsolved" means no attempts exist at all.
export type DisplayStatus = "unsolved" | "in review" | "mastered" | "retired";

// One logged attempt at a problem (a row of the attempts table).
export type Attempt = { id: number; attemptedOn: string; rating: Rating };

// A problem's current schedule (a row of the review_state table).
export type ReviewState = {
  intervalDays: number; // the current gap between reviews, in days
  nextReview: string | null; // when it's next due; null only once retired
  lastReviewed: string; // date of the most recent attempt
  timesReviewed: number; // how many attempts have been logged
  status: Status;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// The gap after a first-ever Easy, and the smallest gap an Easy can give.
const FIRST_EASY_INTERVAL = 7;
// An Easy on a review that already had a 28-day gap earns "mastered".
const MASTERY_INTERVAL = 28;
// After mastery there is one final recheck this many days later.
const RECHECK_INTERVAL = 90;
// A bad attempt always sends the problem back to a short gap.
const FAIL_INTERVALS: Record<Exclude<Rating, "easy">, number> = {
  struggled: 3,
  needed_solution: 2,
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

// Turn "2026-11-12" into a timestamp, using UTC on purpose. Local time zones
// have daylight-saving days that are 23 or 25 hours long, which could make
// "add one day" land on the wrong date. UTC days are always exactly 24 hours.
function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// "2026-01-31" + 1 day = "2026-02-01". Negative numbers go backwards.
export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

// Days from a to b. Positive if b is later, negative if b is earlier.
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

// Apply ONE attempt to a problem's current schedule and return the new schedule.
// `prev` is null when this is the problem's very first attempt.
export function applyAttempt(prev: ReviewState | null, attempt: Attempt): ReviewState {
  const d = attempt.attemptedOn;

  // Every attempt, whatever its effect on the schedule, bumps the counter
  // and updates the "last reviewed" date.
  const counted = { lastReviewed: d, timesReviewed: (prev?.timesReviewed ?? 0) + 1 };

  // Struggled / Needed solution: forgetting something is real information, so
  // these ALWAYS reset the schedule, even when the problem wasn't due yet and
  // even if it was mastered or retired. The next review counts from the
  // attempt's own date.
  if (attempt.rating !== "easy") {
    const interval = FAIL_INTERVALS[attempt.rating];
    return { ...counted, intervalDays: interval, nextReview: addDays(d, interval), status: "in_review" };
  }

  // From here on the rating is Easy.

  // First attempt ever: there is no schedule yet, so an Easy always counts.
  if (prev === null) {
    return {
      ...counted,
      intervalDays: FIRST_EASY_INTERVAL,
      nextReview: addDays(d, FIRST_EASY_INTERVAL),
      status: "in_review",
    };
  }

  // An Easy only counts if the problem was actually due (the attempt is on or
  // after its next-review date). Doing it early is still logged, but it doesn't
  // change the schedule, so you can't speed up the ladder by re-doing problems
  // you've just seen. A retired problem has no next review, so it never counts.
  const due = prev.nextReview !== null && d >= prev.nextReview;
  if (!due) return { ...prev, ...counted };

  // Easy on the 90-day recheck: finished for good.
  if (prev.intervalDays === RECHECK_INTERVAL) {
    return { ...counted, intervalDays: RECHECK_INTERVAL, nextReview: null, status: "retired" };
  }

  // Easy on a review that was already at the 28-day gap: mastered. One last
  // recheck comes 90 days later.
  if (prev.intervalDays === MASTERY_INTERVAL) {
    return {
      ...counted,
      intervalDays: RECHECK_INTERVAL,
      nextReview: addDays(d, RECHECK_INTERVAL),
      status: "mastered",
    };
  }

  // Any other due Easy: double the gap, but never less than 7 days.
  // This gives the ladder 7 -> 14 -> 28 (after a reset: 2 or 3 -> 7).
  const interval = Math.max(FIRST_EASY_INTERVAL, prev.intervalDays * 2);
  return { ...counted, intervalDays: interval, nextReview: addDays(d, interval), status: "in_review" };
}

// Work out a problem's schedule from scratch by applying all its attempts in
// order. The database stores the result, but this is the source of truth:
// whenever an attempt is added or deleted we simply run this again, so a
// backdated or deleted attempt can never leave the schedule out of sync.
// No attempts means the problem is unsolved, so the result is null.
export function replay(attempts: Attempt[]): ReviewState | null {
  // Oldest first. Two attempts on the same day are ordered by id (the order
  // they were logged). We sort a copy so the caller's array is left alone.
  const ordered = [...attempts].sort(
    (a, b) => (a.attemptedOn < b.attemptedOn ? -1 : a.attemptedOn > b.attemptedOn ? 1 : a.id - b.id),
  );
  let state: ReviewState | null = null;
  for (const attempt of ordered) state = applyAttempt(state, attempt);
  return state;
}

// ---------------------------------------------------------------------------
// "Due today" logic
// ---------------------------------------------------------------------------

// Due means the next-review date is today or earlier. Retired problems have no
// next-review date, so they are never due. (Dates are YYYY-MM-DD strings, so
// comparing them as text gives the same answer as comparing them as dates.)
export function isDue(state: ReviewState, today: string): boolean {
  return state.nextReview !== null && state.nextReview <= today;
}

// How many days late a review is. 0 if it's due today (or not due yet).
export function daysOverdue(state: ReviewState, today: string): number {
  return state.nextReview === null ? 0 : Math.max(0, daysBetween(state.nextReview, today));
}

// Lower number = shown first. Hard problems come first on ties because
// they're the ones most likely to be forgotten.
const DIFFICULTY_RANK: Record<string, number> = { Hard: 0, Medium: 1, Easy: 2 };

// The minimum a problem needs to be sorted into the due list.
type Dueable = { state: ReviewState; difficulty: string; position: number };

// Sort order for the Today list, for use with array.sort():
//   1. most overdue first
//   2. then Hard, Medium, Easy
//   3. then by position in the NeetCode list, so the order is always the same
// A negative result means `a` goes before `b`.
export function compareDue(a: Dueable, b: Dueable, today: string): number {
  return (
    daysOverdue(b.state, today) - daysOverdue(a.state, today) ||
    (DIFFICULTY_RANK[a.difficulty] ?? 3) - (DIFFICULTY_RANK[b.difficulty] ?? 3) ||
    a.position - b.position
  );
}

// The label for the Problems screen and filters.
export function problemStatus(state: ReviewState | null): DisplayStatus {
  if (state === null) return "unsolved";
  return state.status === "in_review" ? "in review" : state.status;
}
