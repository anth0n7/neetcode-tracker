export type Rating = "easy" | "struggled" | "needed_solution";

export type Difficulty = "Easy" | "Medium" | "Hard";

export type DisplayStatus = "unsolved" | "in review" | "mastered";

export type Attempt = { id: number; attemptedOn: string; rating: Rating };

export type ReviewState = {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  nextReview: string;
  lastReviewed: string;
  timesReviewed: number;
};

const QUALITY: Record<Rating, number> = {
  easy: 5,
  struggled: 3,
  needed_solution: 1,
};

const PASS_QUALITY = 3;

const INITIAL_EASE_FACTOR = 250;
const MIN_EASE_FACTOR = 130;

const FIRST_INTERVAL = 1;
const SECOND_INTERVAL = 6;

const MASTERED_INTERVAL = 28;

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

function multiplyAndRound(intervalDays: number, easeFactor: number): number {
  return Math.floor((intervalDays * easeFactor + 50) / 100);
}

function nextEaseFactor(easeFactor: number, quality: number): number {
  const miss = 5 - quality;
  const change = 10 - miss * (8 + miss * 2);
  return Math.max(MIN_EASE_FACTOR, easeFactor + change);
}

export function applyAttempt(prev: ReviewState | null, attempt: Attempt): ReviewState {
  const d = attempt.attemptedOn;

  const counted = { lastReviewed: d, timesReviewed: (prev?.timesReviewed ?? 0) + 1 };

  if (prev && prev.lastReviewed === d) return { ...prev, ...counted };

  const quality = QUALITY[attempt.rating];

  if (quality < PASS_QUALITY) {
    return {
      ...counted,
      intervalDays: FIRST_INTERVAL,
      easeFactor: prev?.easeFactor ?? INITIAL_EASE_FACTOR,
      repetitions: 0,
      nextReview: addDays(d, FIRST_INTERVAL),
    };
  }

  if (prev && d < prev.nextReview) return { ...prev, ...counted };

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

export function replay(attempts: Attempt[]): ReviewState | null {
  const ordered = [...attempts].sort(
    (a, b) => (a.attemptedOn < b.attemptedOn ? -1 : a.attemptedOn > b.attemptedOn ? 1 : a.id - b.id),
  );
  let state: ReviewState | null = null;
  for (const attempt of ordered) state = applyAttempt(state, attempt);
  return state;
}

export function isDue(state: ReviewState, today: string): boolean {
  return state.nextReview <= today;
}

export function daysOverdue(state: ReviewState, today: string): number {
  return Math.max(0, daysBetween(state.nextReview, today));
}

const DIFFICULTY_RANK: Record<string, number> = { Hard: 0, Medium: 1, Easy: 2 };

type Dueable = { state: ReviewState; difficulty: string; position: number };

export function compareDue(a: Dueable, b: Dueable, today: string): number {
  return (
    daysOverdue(b.state, today) - daysOverdue(a.state, today) ||
    (DIFFICULTY_RANK[a.difficulty] ?? 3) - (DIFFICULTY_RANK[b.difficulty] ?? 3) ||
    a.position - b.position
  );
}

export function problemStatus(state: ReviewState | null): DisplayStatus {
  if (state === null) return "unsolved";
  return state.intervalDays >= MASTERED_INTERVAL ? "mastered" : "in review";
}
