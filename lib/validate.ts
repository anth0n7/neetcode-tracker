// Checks and cleans up everything that arrives in a request, so the database
// code only ever sees good values. Each function either returns a clean value
// or throws an HttpError that becomes a 400 (bad input) or 404 (no such problem).
import { DUE_LIMIT } from "./config";
import { HttpError } from "./http";
import type { Rating } from "./scheduler";

const RATINGS: Rating[] = ["easy", "struggled", "needed_solution"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];
// There is no "retired": SM-2 keeps every problem scheduled, at longer and longer gaps.
const STATUSES = ["unsolved", "in review", "mastered"];

const MAX_INSIGHT_LENGTH = 500;
const MAX_MINUTES = 1440; // one day; anything bigger is surely a typo
const MAX_INT = 2_147_483_647; // the largest value a Postgres integer column holds

const bad = (message: string) => new HttpError(400, message);

// A whole number written with digits only and no leading zero: "42", not "4.2" or " 7".
const POSITIVE_INT = /^[1-9]\d*$/;

// The :id in a URL. Anything that can't be a real problem id is "not found".
export function parseProblemId(raw: string): number {
  if (!POSITIVE_INT.test(raw) || Number(raw) > MAX_INT) throw new HttpError(404, "Problem not found");
  return Number(raw);
}

export function parseRating(raw: unknown): Rating {
  if (typeof raw === "string" && (RATINGS as string[]).includes(raw)) return raw as Rating;
  throw bad(`rating must be one of: ${RATINGS.join(", ")}`);
}

// The date an attempt happened. Defaults to today; may be in the past (to log
// something you did earlier) but never in the future. `today` is passed in.
export function parseAttemptedOn(raw: unknown, today: string): string {
  if (raw === undefined || raw === null) return today;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw bad("attempted_on must be YYYY-MM-DD");

  // The right shape isn't enough ("2026-02-30"), so build the date and check it
  // comes back as the same text. JavaScript rolls impossible dates over.
  const [y, m, d] = raw.split("-").map(Number);
  const real = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  if (real !== raw) throw bad("attempted_on is not a real date");

  // Both are YYYY-MM-DD, so comparing them as text compares them as dates.
  if (raw > today) throw bad("attempted_on cannot be in the future");
  return raw;
}

// Optional timer value. Missing means "not recorded".
export function parseMinutes(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > MAX_MINUTES) {
    throw bad(`minutes must be a whole number from 0 to ${MAX_MINUTES}`);
  }
  return raw;
}

// The one-line insight. Blank (or missing) means "no insight", stored as null.
export function parseInsight(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw bad("insight must be text");
  const text = raw.trim();
  if (text.length > MAX_INSIGHT_LENGTH) throw bad(`insight must be at most ${MAX_INSIGHT_LENGTH} characters`);
  return text === "" ? null : text;
}

// ?limit=5 and ?all=true for the due list.
export function parseDueOptions(params: URLSearchParams): { limit: number; all: boolean } {
  const limitRaw = params.get("limit");
  if (limitRaw !== null && (!POSITIVE_INT.test(limitRaw) || Number(limitRaw) > MAX_INT)) {
    throw bad("limit must be a positive whole number");
  }
  const allRaw = params.get("all");
  if (allRaw !== null && allRaw !== "true" && allRaw !== "false") throw bad("all must be true or false");

  return { limit: limitRaw === null ? DUE_LIMIT : Number(limitRaw), all: allRaw === "true" };
}

export type ProblemFilters = { pattern?: string; difficulty?: string; status?: string; q?: string };

// ?pattern=&difficulty=&status=&q= for the problem list. Blank values are
// ignored, so an empty filter box means "no filter".
export function parseProblemFilters(params: URLSearchParams): ProblemFilters {
  const filters: ProblemFilters = {};
  const get = (key: string) => params.get(key)?.trim() || undefined;

  const pattern = get("pattern");
  if (pattern) filters.pattern = pattern;

  const difficulty = get("difficulty");
  if (difficulty) {
    if (!DIFFICULTIES.includes(difficulty)) throw bad(`difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
    filters.difficulty = difficulty;
  }

  const status = get("status");
  if (status) {
    if (!STATUSES.includes(status)) throw bad(`status must be one of: ${STATUSES.join(", ")}`);
    filters.status = status;
  }

  const q = get("q");
  if (q) filters.q = q;

  return filters;
}
