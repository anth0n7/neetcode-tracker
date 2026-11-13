// The scheduling rules: given a problem's attempts, work out when to review it next.
//
// This uses SM-2 ("SuperMemo 2", 1987), a classic spaced-repetition algorithm.
// The idea: each time you remember something, wait LONGER before the next review;
// each time you forget, start the waiting over. How fast the wait grows depends on
// the "ease factor": a number that rises when problems feel easy and falls when
// they feel hard.
//
// This file is "pure": it never touches the database or reads the clock.
// Everything it needs (including what "today" is) is passed in, which makes it
// easy to test. See docs/SPEC.md ("Scheduling rules (SM-2)") for the full rules.
//
// Dates are plain "YYYY-MM-DD" strings throughout, e.g. "2026-11-12".
//
// The ease factor is stored as a whole number of HUNDREDTHS: 250 means 2.50.
// Whole numbers keep the arithmetic exact. With decimals, 45 x 2.90 could come out
// as 130.49999 and round the wrong way; with integers it is exactly 130.5.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// How an attempt went.
export type Rating = "easy" | "struggled" | "needed_solution";

export type Difficulty = "Easy" | "Medium" | "Hard";

// The label shown in the UI. "unsolved" means no attempts exist at all.
// "mastered" is only a label (see MASTERED_INTERVAL); it does not change the schedule.
export type DisplayStatus = "unsolved" | "in review" | "mastered";

// One logged attempt at a problem (a row of the attempts table).
export type Attempt = { id: number; attemptedOn: string; rating: Rating };

// A problem's current schedule (a row of the review_state table).
export type ReviewState = {
  intervalDays: number; // the current gap between reviews, in whole days
  easeFactor: number; // how fast the gap grows, in hundredths (250 = 2.50)
  repetitions: number; // passes in a row since the last failure (SM-2's "n")
  nextReview: string; // when it is next due
  lastReviewed: string; // date of the most recent attempt
  timesReviewed: number; // how many attempts have been logged (all of them)
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// SM-2 grades every answer from 0 to 5. We only have three buttons, so each one
// stands for one grade. (Original meanings: 5 = perfect response; 3 = correct, but
// recalled with serious difficulty; 1 = incorrect, but remembered once the answer
// was seen.)
const QUALITY: Record<Rating, number> = {
  easy: 5,
  struggled: 3,
  needed_solution: 1,
};

// A grade of 3 or more counts as remembering ("a pass"); below 3 is a failure.
const PASS_QUALITY = 3;

// Every problem starts with an ease factor of 2.50, and it can never fall below 1.30.
const INITIAL_EASE_FACTOR = 250;
const MIN_EASE_FACTOR = 130;

// The first two gaps are fixed: 1 day, then 6 days. After that the gap grows by
// multiplying by the ease factor.
const FIRST_INTERVAL = 1;
const SECOND_INTERVAL = 6;

// A problem whose gap has reached 28 days or more is shown as "mastered".
const MASTERED_INTERVAL = 28;

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

// gap x ease factor, rounded to the nearest whole day, with exact halves rounding
// UP. The ease factor is in hundredths, so we work in whole numbers: adding 50
// before dividing by 100 is "round half up" without any decimals.
// Example: 45 days x 290 = 13050; (13050 + 50) / 100 = 131 (that is 130.5, rounded up).
function multiplyAndRound(intervalDays: number, easeFactor: number): number {
  return Math.floor((intervalDays * easeFactor + 50) / 100);
}

// The SM-2 formula for the new ease factor:
//   EF' = EF + (0.1 - (5 - q) x (0.08 + (5 - q) x 0.02))
// written in hundredths, so the change is 10 - (5 - q) x (8 + (5 - q) x 2).
// That is +10 (+0.10) for Easy (q = 5) and -14 (-0.14) for Struggled (q = 3).
// The result never drops below the floor of 1.30.
function nextEaseFactor(easeFactor: number, quality: number): number {
  const miss = 5 - quality; // how far from a perfect answer
  const change = 10 - miss * (8 + miss * 2);
  return Math.max(MIN_EASE_FACTOR, easeFactor + change);
}

// Apply ONE attempt to a problem's current schedule and return the new schedule.
// `prev` is null when this is the problem's very first attempt.
export function applyAttempt(prev: ReviewState | null, attempt: Attempt): ReviewState {
  const d = attempt.attemptedOn;

  // Every attempt, whatever its effect on the schedule, bumps the counter
  // and records the date.
  const counted = { lastReviewed: d, timesReviewed: (prev?.timesReviewed ?? 0) + 1 };

  // Rule 1: a repeat on the same day. If the problem already has an attempt on
  // this date, the new one is only recorded: the FIRST attempt of the day decides.
  // (A repeat pass would be "early" anyway; this is what makes a repeat failure
  // harmless too.)
  if (prev && prev.lastReviewed === d) return { ...prev, ...counted };

  const quality = QUALITY[attempt.rating];

  // Rule 2: a failure. Start the problem over: no passes in a row and a gap of 1
  // day. The ease factor is left as it is (SM-2 step 6: "without changing the
  // E-Factor"); a brand new problem keeps the starting 2.50. A failure ALWAYS
  // applies, even before the problem was due: forgetting something early is still
  // real information. The next review counts from the attempt's own date.
  if (quality < PASS_QUALITY) {
    return {
      ...counted,
      intervalDays: FIRST_INTERVAL,
      easeFactor: prev?.easeFactor ?? INITIAL_EASE_FACTOR,
      repetitions: 0,
      nextReview: addDays(d, FIRST_INTERVAL),
    };
  }

  // Rule 3: an early pass. If the problem was not due yet, the attempt is saved
  // but the schedule doesn't change, so re-doing a problem you just saw can't
  // push its gaps out or inflate its ease factor.
  if (prev && d < prev.nextReview) return { ...prev, ...counted };

  // Rule 4: a pass that counts (the first attempt, or the problem was due).
  // The gap depends on how many passes in a row came BEFORE this one:
  //   none yet -> 1 day;  one -> 6 days;  more -> previous gap x ease factor.
  // That multiplication uses the ease factor from BEFORE this review's update.
  let intervalDays: number;
  if (!prev || prev.repetitions === 0) intervalDays = FIRST_INTERVAL;
  else if (prev.repetitions === 1) intervalDays = SECOND_INTERVAL;
  else intervalDays = multiplyAndRound(prev.intervalDays, prev.easeFactor);

  return {
    ...counted,
    intervalDays,
    easeFactor: nextEaseFactor(prev?.easeFactor ?? INITIAL_EASE_FACTOR, quality),
    repetitions: (prev?.repetitions ?? 0) + 1,
    nextReview: addDays(d, intervalDays),
  };
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

// Due means the next-review date is today or earlier. Every problem that has been
// attempted is eventually due again: SM-2 never retires a problem, the gaps just
// keep growing. (Dates are YYYY-MM-DD strings, so comparing them as text gives
// the same answer as comparing them as dates.)
export function isDue(state: ReviewState, today: string): boolean {
  return state.nextReview <= today;
}

// How many days late a review is. 0 if it's due today (or not due yet).
export function daysOverdue(state: ReviewState, today: string): number {
  return Math.max(0, daysBetween(state.nextReview, today));
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

// The label for the Problems screen and filters. It is worked out from the
// schedule, not stored: a gap of 28+ days is "mastered", anything shorter is
// still "in review".
export function problemStatus(state: ReviewState | null): DisplayStatus {
  if (state === null) return "unsolved";
  return state.intervalDays >= MASTERED_INTERVAL ? "mastered" : "in review";
}
