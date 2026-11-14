import { describe, expect, it } from "vitest";
import { logAttempt, type Conn } from "@/lib/attempts";
import { groupByPattern } from "@/lib/pattern-groups";
import { getProgress, listProblems } from "@/lib/queries";
import { day, makeProblem, TODAY, withRollback } from "./helpers";

const row = (id: number, pattern: string, status: string, due = false) => ({ id, pattern, status, due });

describe("groupByPattern", () => {
  it("returns nothing for an empty list", () => {
    expect(groupByPattern([])).toEqual([]);
  });

  it("groups by pattern in first-seen order and keeps each group's row order", () => {
    const groups = groupByPattern([
      row(1, "Stack", "unsolved"),
      row(2, "Trees", "unsolved"),
      row(3, "Stack", "unsolved"),
      row(4, "Trees", "unsolved"),
    ]);

    expect(groups.map((g) => g.pattern)).toEqual(["Stack", "Trees"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual([1, 3]);
    expect(groups[1].rows.map((r) => r.id)).toEqual([2, 4]);
  });

  it("counts total, solved, in review, mastered and due per group", () => {
    const [group] = groupByPattern([
      row(1, "Stack", "unsolved"),
      row(2, "Stack", "in review", true),
      row(3, "Stack", "in review"),
      row(4, "Stack", "mastered", true),
      row(5, "Stack", "mastered"),
    ]);

    expect(group).toMatchObject({ total: 5, solved: 4, inReview: 2, mastered: 2, due: 2 });
  });

  it("counts a group with nothing solved as zero, not missing", () => {
    const [group] = groupByPattern([row(1, "Tries", "unsolved"), row(2, "Tries", "unsolved")]);

    expect(group).toMatchObject({ total: 2, solved: 0, inReview: 0, mastered: 0, due: 0 });
  });
});

describe("groupByPattern against the Progress numbers", () => {
  it("matches getProgress for total, solved, mastered and due", () =>
    withRollback(async (tx: Conn) => {
      const pattern = `T-Pattern-${Date.now()}`;
      const ids: number[] = [];
      for (let i = 0; i < 6; i++) ids.push(await makeProblem(tx, { pattern }));
      const easyAt = async (id: number, ...offsets: number[]) => {
        for (const o of offsets) {
          await logAttempt(id, { rating: "easy", minutes: null, insight: null, attemptedOn: day(o) }, tx);
        }
      };
      await easyAt(ids[1], 0);
      await easyAt(ids[2], -10);
      await easyAt(ids[3], -33, -32, -26, -10);
      await easyAt(ids[4], -100, -99, -93, -77);

      const group = groupByPattern(await listProblems({}, TODAY, tx)).find((g) => g.pattern === pattern);
      const progress = (await getProgress(TODAY, tx)).patterns.find((p) => p.pattern === pattern);

      expect(group).toMatchObject({
        total: progress!.total,
        solved: progress!.solved,
        mastered: progress!.mastered,
        due: progress!.due,
      });
      expect(progress).toMatchObject({ total: 6, solved: 4, mastered: 2, due: 2 });
    }));
});
