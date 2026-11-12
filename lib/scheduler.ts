// Pure scheduling logic. No database, no clock: "today" is always passed in.
// Dates are YYYY-MM-DD strings. See docs/SPEC.md for the rules.

export type Rating = "easy" | "struggled" | "needed_solution";
export type Status = "in_review" | "mastered" | "retired";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type DisplayStatus = "unsolved" | "in review" | "mastered" | "retired";

export type Attempt = { id: number; attemptedOn: string; rating: Rating };

export type ReviewState = {
  intervalDays: number;
  nextReview: string | null; // null only when retired
  lastReviewed: string;
  timesReviewed: number;
  status: Status;
};

const FIRST_EASY_INTERVAL = 7;
const MASTERY_INTERVAL = 28;
const RECHECK_INTERVAL = 90;
const FAIL_INTERVALS: Record<Exclude<Rating, "easy">, number> = {
  struggled: 3,
  needed_solution: 2,
};

// --- dates (UTC arithmetic only, so DST can never shift a day) ---

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Signed whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

// --- scheduling ---

export function applyAttempt(prev: ReviewState | null, attempt: Attempt): ReviewState {
  const d = attempt.attemptedOn;
  const counted = { lastReviewed: d, timesReviewed: (prev?.timesReviewed ?? 0) + 1 };

  if (attempt.rating !== "easy") {
    // Failures always apply, whether or not the problem was due.
    const interval = FAIL_INTERVALS[attempt.rating];
    return { ...counted, intervalDays: interval, nextReview: addDays(d, interval), status: "in_review" };
  }

  if (prev === null) {
    return {
      ...counted,
      intervalDays: FIRST_EASY_INTERVAL,
      nextReview: addDays(d, FIRST_EASY_INTERVAL),
      status: "in_review",
    };
  }

  // Easy only counts if the problem was due (never for a retired one).
  const due = prev.nextReview !== null && d >= prev.nextReview;
  if (!due) return { ...prev, ...counted };

  if (prev.intervalDays === RECHECK_INTERVAL) {
    return { ...counted, intervalDays: RECHECK_INTERVAL, nextReview: null, status: "retired" };
  }
  if (prev.intervalDays === MASTERY_INTERVAL) {
    return {
      ...counted,
      intervalDays: RECHECK_INTERVAL,
      nextReview: addDays(d, RECHECK_INTERVAL),
      status: "mastered",
    };
  }
  const interval = Math.max(FIRST_EASY_INTERVAL, prev.intervalDays * 2);
  return { ...counted, intervalDays: interval, nextReview: addDays(d, interval), status: "in_review" };
}

/** Rebuild a problem's review state from its attempts. No attempts -> null (unsolved). */
export function replay(attempts: Attempt[]): ReviewState | null {
  const ordered = [...attempts].sort(
    (a, b) => (a.attemptedOn < b.attemptedOn ? -1 : a.attemptedOn > b.attemptedOn ? 1 : a.id - b.id),
  );
  let state: ReviewState | null = null;
  for (const attempt of ordered) state = applyAttempt(state, attempt);
  return state;
}

// --- due logic ---

export function isDue(state: ReviewState, today: string): boolean {
  return state.nextReview !== null && state.nextReview <= today;
}

export function daysOverdue(state: ReviewState, today: string): number {
  return state.nextReview === null ? 0 : Math.max(0, daysBetween(state.nextReview, today));
}

const DIFFICULTY_RANK: Record<string, number> = { Hard: 0, Medium: 1, Easy: 2 };

type Dueable = { state: ReviewState; difficulty: string; position: number };

/** Most overdue first, then Hard -> Medium -> Easy, then list position. */
export function compareDue(a: Dueable, b: Dueable, today: string): number {
  return (
    daysOverdue(b.state, today) - daysOverdue(a.state, today) ||
    (DIFFICULTY_RANK[a.difficulty] ?? 3) - (DIFFICULTY_RANK[b.difficulty] ?? 3) ||
    a.position - b.position
  );
}

export function problemStatus(state: ReviewState | null): DisplayStatus {
  if (state === null) return "unsolved";
  return state.status === "in_review" ? "in review" : state.status;
}
