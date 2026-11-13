export type PatternGroup<T> = {
  pattern: string;
  rows: T[];
  total: number;
  solved: number;
  inReview: number;
  mastered: number;
  due: number;
};

export function groupByPattern<T extends { pattern: string; status: string; due: boolean }>(
  rows: T[],
): PatternGroup<T>[] {
  const groups = new Map<string, PatternGroup<T>>();
  for (const row of rows) {
    let group = groups.get(row.pattern);
    if (!group) {
      group = { pattern: row.pattern, rows: [], total: 0, solved: 0, inReview: 0, mastered: 0, due: 0 };
      groups.set(row.pattern, group);
    }
    group.rows.push(row);
    group.total++;
    if (row.status !== "unsolved") group.solved++;
    if (row.status === "in review") group.inReview++;
    if (row.status === "mastered") group.mastered++;
    if (row.due) group.due++;
  }
  return [...groups.values()];
}
