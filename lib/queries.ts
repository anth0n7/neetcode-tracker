// The database code that only reads: the problem list, one problem's detail,
// the due list, and progress counts.
//
// There are only 250 problems, so each function loads them all (joined with
// their review state) and then filters, sorts and counts in plain code. That is
// fast, and it means all the rules (what counts as due, what status means)
// come from lib/scheduler.ts in exactly one place, so the Today, Problems and
// Progress screens can never disagree with each other.
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { attempts, problems, reviewState } from "@/db/schema";
import { db } from "./db";
import { reviewStateToApi, type ApiReviewState } from "./api-shape";
import type { Conn } from "./attempts";
import {
  addDays,
  compareDue,
  daysOverdue,
  isDue,
  problemStatus,
  type DisplayStatus,
  type ReviewState,
} from "./scheduler";
import type { ProblemFilters } from "./validate";

// ---------------------------------------------------------------------------
// Shapes returned to the API
// ---------------------------------------------------------------------------

// One problem as the list and Today screens show it.
export type ProblemRow = {
  id: number;
  position: number;
  title: string;
  slug: string;
  url: string;
  pattern: string;
  difficulty: string;
  insight: string | null;
  status: DisplayStatus; // unsolved | in review | mastered
  nextReview: string | null;
  intervalDays: number | null;
  due: boolean; // due today or earlier
  daysOverdue: number; // 0 unless due and late
};

export type AttemptRow = {
  id: number;
  attemptedOn: string;
  rating: string;
  minutes: number | null;
  insight: string | null;
};

// A problem plus its full history, for the detail page.
export type ProblemDetail = ProblemRow & { attempts: AttemptRow[]; reviewState: ApiReviewState | null };

export type PatternProgress = {
  pattern: string;
  total: number;
  solved: number; // any problem with at least one attempt (includes mastered)
  mastered: number; // a gap of 28 days or more (still scheduled; it comes back when due)
  due: number;
};

export type Progress = {
  totals: {
    problems: number;
    solved: number;
    mastered: number;
    due: number;
    attemptsLast7Days: number;
  };
  patterns: PatternProgress[];
};

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

// A problem row plus its raw schedule, used internally so we can sort by it.
type Loaded = ProblemRow & { state: ReviewState | null };

// Turn one joined database row into a Loaded problem. The review_state columns
// are all null for a problem that has never been attempted.
function toLoaded(
  p: typeof problems.$inferSelect,
  r: typeof reviewState.$inferSelect | null,
  today: string,
): Loaded {
  const state: ReviewState | null = r && {
    intervalDays: r.intervalDays,
    easeFactor: r.easeFactor,
    repetitions: r.repetitions,
    nextReview: r.nextReview,
    lastReviewed: r.lastReviewed,
    timesReviewed: r.timesReviewed,
  };
  return {
    id: p.id,
    position: p.position,
    title: p.title,
    slug: p.slug,
    url: p.url,
    pattern: p.pattern,
    difficulty: p.difficulty,
    insight: p.insight,
    status: problemStatus(state),
    nextReview: state?.nextReview ?? null,
    intervalDays: state?.intervalDays ?? null,
    due: state ? isDue(state, today) : false,
    daysOverdue: state ? daysOverdue(state, today) : 0,
    state,
  };
}

// Every problem, in NeetCode list order, with its schedule (if it has one).
// A LEFT join keeps unsolved problems, whose review_state is missing.
async function loadAll(conn: Conn, today: string): Promise<Loaded[]> {
  const rows = await conn
    .select({ problem: problems, state: reviewState })
    .from(problems)
    .leftJoin(reviewState, eq(reviewState.problemId, problems.id))
    .orderBy(problems.position, problems.id);
  return rows.map((r) => toLoaded(r.problem, r.state, today));
}

// Drop the internal `state` field before returning a row to the API.
function publicRow(loaded: Loaded): ProblemRow {
  const { state, ...row } = loaded;
  void state; // deliberately dropped
  return row;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// The Problems screen: all problems, optionally narrowed by pattern, difficulty,
// status and a title search. Every filter given must match.
export async function listProblems(filters: ProblemFilters, today: string, conn: Conn = db): Promise<ProblemRow[]> {
  const needle = filters.q?.toLowerCase();
  const all = await loadAll(conn, today);
  return all
    .filter(
      (p) =>
        (!filters.pattern || p.pattern === filters.pattern) &&
        (!filters.difficulty || p.difficulty === filters.difficulty) &&
        (!filters.status || p.status === filters.status) &&
        (!needle || p.title.toLowerCase().includes(needle)),
    )
    .map(publicRow);
}

// One problem with its attempt history (newest first), or null if there's no such problem.
export async function getProblem(id: number, today: string, conn: Conn = db): Promise<ProblemDetail | null> {
  const [found] = await conn
    .select({ problem: problems, state: reviewState })
    .from(problems)
    .leftJoin(reviewState, eq(reviewState.problemId, problems.id))
    .where(eq(problems.id, id));
  if (!found) return null;

  const history = await conn
    .select()
    .from(attempts)
    .where(eq(attempts.problemId, id))
    // Same-day attempts: the one logged last (highest id) comes first.
    .orderBy(desc(attempts.attemptedOn), desc(attempts.id));

  const loaded = toLoaded(found.problem, found.state, today);
  return {
    ...publicRow(loaded),
    reviewState: reviewStateToApi(loaded.state),
    attempts: history.map((a) => ({
      id: a.id,
      attemptedOn: a.attemptedOn,
      rating: a.rating,
      minutes: a.minutes,
      insight: a.insight,
    })),
  };
}

// The Today screen: problems due today or earlier, most overdue first, then
// Hard before Medium before Easy. `total` is how many are due in all; `items`
// is cut to `limit` unless `all` is true.
export async function getDue(
  opts: { today: string; limit: number; all: boolean },
  conn: Conn = db,
): Promise<{ total: number; items: ProblemRow[] }> {
  const due = (await loadAll(conn, opts.today)).filter((p) => p.due);
  // compareDue needs each problem's schedule, so state is non-null for every due problem.
  due.sort((a, b) => compareDue({ ...a, state: a.state! }, { ...b, state: b.state! }, opts.today));
  const shown = opts.all ? due : due.slice(0, opts.limit);
  return { total: due.length, items: shown.map(publicRow) };
}

// The Progress screen: counts per pattern, plus overall totals and the number
// of attempts in the last 7 days (today and the 6 days before it).
export async function getProgress(today: string, conn: Conn = db): Promise<Progress> {
  const all = await loadAll(conn, today);

  // Group by pattern. `all` is already in list order, and a Map remembers the
  // order keys were first added, so patterns come out in NeetCode order.
  const byPattern = new Map<string, PatternProgress>();
  const totals = { problems: 0, solved: 0, mastered: 0, due: 0, attemptsLast7Days: 0 };

  for (const p of all) {
    const entry = byPattern.get(p.pattern) ?? {
      pattern: p.pattern,
      total: 0,
      solved: 0,
      mastered: 0,
      due: 0,
    };
    entry.total++;
    totals.problems++;
    if (p.status !== "unsolved") {
      entry.solved++;
      totals.solved++;
    }
    if (p.status === "mastered") {
      entry.mastered++;
      totals.mastered++;
    }
    if (p.due) {
      entry.due++;
      totals.due++;
    }
    byPattern.set(p.pattern, entry);
  }

  const [recent] = await conn
    .select({ n: count() })
    .from(attempts)
    .where(and(gte(attempts.attemptedOn, addDays(today, -6)), lte(attempts.attemptedOn, today)));
  totals.attemptsLast7Days = recent.n;

  return { totals, patterns: [...byPattern.values()] };
}
