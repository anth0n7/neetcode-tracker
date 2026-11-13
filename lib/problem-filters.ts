export const DIFFICULTIES = ["Easy", "Medium", "Hard"];
export const STATUSES = ["unsolved", "in review", "mastered"];

export type ProblemFilters = { pattern?: string; difficulty?: string; status?: string; q?: string };

export function filterProblems<T extends { title: string; pattern: string; difficulty: string; status: string }>(
  rows: T[],
  filters: ProblemFilters,
): T[] {
  const needle = filters.q?.trim().toLowerCase();
  return rows.filter(
    (p) =>
      (!filters.pattern || p.pattern === filters.pattern) &&
      (!filters.difficulty || p.difficulty === filters.difficulty) &&
      (!filters.status || p.status === filters.status) &&
      (!needle || p.title.toLowerCase().includes(needle)),
  );
}

export function parseFilterParams(
  params: Record<string, string | string[] | undefined>,
  patterns: readonly string[],
): ProblemFilters {
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };
  const filters: ProblemFilters = {};

  const pattern = first("pattern");
  if (pattern && patterns.includes(pattern)) filters.pattern = pattern;

  const difficulty = first("difficulty");
  if (difficulty && DIFFICULTIES.includes(difficulty)) filters.difficulty = difficulty;

  const status = first("status");
  if (status && STATUSES.includes(status)) filters.status = status;

  const q = first("q");
  if (q) filters.q = q;

  return filters;
}

export function toSearchString(filters: ProblemFilters): string {
  const params = new URLSearchParams();
  for (const key of ["pattern", "difficulty", "status", "q"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
