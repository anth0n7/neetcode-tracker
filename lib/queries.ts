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
import { filterProblems, type ProblemFilters } from "./problem-filters";

export type ProblemRow = {
  id: number;
  position: number;
  title: string;
  slug: string;
  url: string;
  pattern: string;
  difficulty: string;
  insight: string | null;
  status: DisplayStatus;
  nextReview: string | null;
  intervalDays: number | null;
  due: boolean;
  daysOverdue: number;
};

export type AttemptRow = {
  id: number;
  attemptedOn: string;
  rating: string;
  minutes: number | null;
  insight: string | null;
};

export type ProblemDetail = ProblemRow & { attempts: AttemptRow[]; reviewState: ApiReviewState | null };

export type PatternProgress = {
  pattern: string;
  total: number;
  solved: number;
  mastered: number;
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

type Loaded = ProblemRow & { state: ReviewState | null };

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

async function loadAll(conn: Conn, today: string): Promise<Loaded[]> {
  const rows = await conn
    .select({ problem: problems, state: reviewState })
    .from(problems)
    .leftJoin(reviewState, eq(reviewState.problemId, problems.id))
    .orderBy(problems.position, problems.id);
  return rows.map((r) => toLoaded(r.problem, r.state, today));
}

function publicRow(loaded: Loaded): ProblemRow {
  const { state, ...row } = loaded;
  void state;
  return row;
}

export async function listProblems(filters: ProblemFilters, today: string, conn: Conn = db): Promise<ProblemRow[]> {
  return filterProblems(await loadAll(conn, today), filters).map(publicRow);
}

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

export async function getDue(
  opts: { today: string; limit: number; all: boolean },
  conn: Conn = db,
): Promise<{ total: number; items: ProblemRow[] }> {
  const due = (await loadAll(conn, opts.today)).filter((p) => p.due);
  due.sort((a, b) => compareDue({ ...a, state: a.state! }, { ...b, state: b.state! }, opts.today));
  const shown = opts.all ? due : due.slice(0, opts.limit);
  return { total: due.length, items: shown.map(publicRow) };
}

export async function getProgress(today: string, conn: Conn = db): Promise<Progress> {
  const all = await loadAll(conn, today);

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
