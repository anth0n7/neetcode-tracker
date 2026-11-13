import { DUE_LIMIT } from "./config";

export type Rating = "needed_solution" | "struggled" | "easy";

export const RATING_BUTTONS: { rating: Rating; label: string; key: string }[] = [
  { rating: "needed_solution", label: "Needed solution", key: "1" },
  { rating: "struggled", label: "Struggled", key: "2" },
  { rating: "easy", label: "Easy", key: "3" },
];

export function hideRow(hidden: ReadonlySet<number>, id: number): Set<number> {
  return new Set(hidden).add(id);
}

export function showRow(hidden: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(hidden);
  next.delete(id);
  return next;
}

export function visibleRows<T extends { id: number }>(
  items: T[],
  hidden: ReadonlySet<number>,
  showAll: boolean,
  limit: number = DUE_LIMIT,
): T[] {
  const remaining = items.filter((item) => !hidden.has(item.id));
  return showAll ? remaining : remaining.slice(0, limit);
}

export function dueCount(items: { id: number }[], hidden: ReadonlySet<number>): number {
  return items.filter((item) => !hidden.has(item.id)).length;
}

export function ratingFromKey(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): Rating | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  return RATING_BUTTONS.find((b) => b.key === e.key)?.rating ?? null;
}

export function attemptRequest(problemId: number, rating: Rating): { url: string; init: RequestInit } {
  return {
    url: `/api/problems/${problemId}/attempts`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    },
  };
}

export function undoRequest(problemId: number, attemptId: number): { url: string; init: RequestInit } {
  return {
    url: `/api/problems/${problemId}/attempts/${attemptId}`,
    init: { method: "DELETE" },
  };
}
