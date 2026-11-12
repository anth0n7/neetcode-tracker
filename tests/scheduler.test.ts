import { describe, expect, it } from "vitest";
import {
  addDays,
  applyAttempt,
  compareDue,
  daysBetween,
  daysOverdue,
  isDue,
  problemStatus,
  replay,
  type Attempt,
  type ReviewState,
} from "@/lib/scheduler";

const D0 = "2026-01-01";
const at = (offset: number) => addDays(D0, offset);

let nextId = 1;
const att = (offset: number, rating: Attempt["rating"], id = nextId++): Attempt => ({
  id,
  attemptedOn: at(offset),
  rating,
});

describe("date helpers", () => {
  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is unaffected by daylight-saving changes", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("daysBetween is signed", () => {
    expect(daysBetween("2026-01-10", "2026-01-05")).toBe(-5);
    expect(daysBetween("2026-01-05", "2026-01-10")).toBe(5);
  });
});

describe("first attempt", () => {
  it.each([
    ["easy", 7],
    ["struggled", 3],
    ["needed_solution", 2],
  ] as const)("%s gives interval %i", (rating, interval) => {
    const s = applyAttempt(null, att(0, rating));
    expect(s.intervalDays).toBe(interval);
    expect(s.nextReview).toBe(at(interval));
    expect(s.status).toBe("in_review");
    expect(s.timesReviewed).toBe(1);
    expect(s.lastReviewed).toBe(at(0));
  });
});

describe("worked example", () => {
  const steps: [number, Attempt["rating"], number, number | null, ReviewState["status"]][] = [
    [0, "needed_solution", 2, 2, "in_review"],
    [2, "struggled", 3, 5, "in_review"],
    [5, "easy", 7, 12, "in_review"],
    [12, "easy", 14, 26, "in_review"],
    [26, "easy", 28, 54, "in_review"],
    [54, "easy", 90, 144, "mastered"],
    [144, "easy", 90, null, "retired"],
  ];

  it("reproduces the spec table step by step", () => {
    let state: ReviewState | null = null;
    steps.forEach(([day, rating, interval, next, status], i) => {
      state = applyAttempt(state, att(day, rating));
      expect(state.intervalDays, `day ${day} interval`).toBe(interval);
      expect(state.nextReview, `day ${day} next`).toBe(next === null ? null : at(next));
      expect(state.status, `day ${day} status`).toBe(status);
      expect(state.timesReviewed).toBe(i + 1);
    });
  });

  it("replay of the full sequence matches the last step", () => {
    const attempts = steps.map(([day, rating]) => att(day, rating));
    const s = replay(attempts)!;
    expect(s.status).toBe("retired");
    expect(s.nextReview).toBeNull();
    expect(s.timesReviewed).toBe(7);
  });
});

// Day 0 easy(7) -> day 7 easy(14) -> day 21 easy(28) -> day 49 easy(90, mastered, next 139)
const toMastered = () => [att(0, "easy"), att(7, "easy"), att(21, "easy"), att(49, "easy")];

describe("mastery ladder", () => {
  it("Easy on a 14-day review gives 28 and stays in_review", () => {
    const s = replay([att(0, "easy"), att(7, "easy")])!;
    expect(s.intervalDays).toBe(14);
    const t = applyAttempt(s, att(21, "easy"));
    expect(t.intervalDays).toBe(28);
    expect(t.status).toBe("in_review");
  });

  it("only Easy at the 28-day interval masters, with a 90-day recheck", () => {
    const s = replay(toMastered())!;
    expect(s.status).toBe("mastered");
    expect(s.intervalDays).toBe(90);
    expect(s.nextReview).toBe(at(139));
  });

  it("Easy on the 90-day recheck retires with no next review", () => {
    const s = replay([...toMastered(), att(139, "easy")])!;
    expect(s.status).toBe("retired");
    expect(s.nextReview).toBeNull();
  });

  it.each(["struggled", "needed_solution"] as const)("%s after mastery returns to in_review", (rating) => {
    const s = applyAttempt(replay(toMastered()), att(100, rating));
    expect(s.status).toBe("in_review");
    expect(s.intervalDays).toBe(rating === "struggled" ? 3 : 2);
  });

  it.each(["struggled", "needed_solution"] as const)("%s after retirement returns to in_review", (rating) => {
    const retired = replay([...toMastered(), att(139, "easy")]);
    const s = applyAttempt(retired, att(200, rating));
    expect(s.status).toBe("in_review");
    expect(s.nextReview).toBe(at(200 + (rating === "struggled" ? 3 : 2)));
  });

  it("Easy on a retired problem is logged but changes nothing else", () => {
    const retired = replay([...toMastered(), att(139, "easy")])!;
    const s = applyAttempt(retired, att(300, "easy"));
    expect(s.status).toBe("retired");
    expect(s.nextReview).toBeNull();
    expect(s.intervalDays).toBe(retired.intervalDays);
    expect(s.timesReviewed).toBe(retired.timesReviewed + 1);
    expect(s.lastReviewed).toBe(at(300));
  });
});

describe("early and overdue attempts", () => {
  const base = () => replay([att(0, "easy")])!; // interval 7, next day 7

  it("early Easy is counted but leaves the schedule alone", () => {
    const s = applyAttempt(base(), att(3, "easy"));
    expect(s.intervalDays).toBe(7);
    expect(s.nextReview).toBe(at(7));
    expect(s.status).toBe("in_review");
    expect(s.timesReviewed).toBe(2);
    expect(s.lastReviewed).toBe(at(3));
  });

  it("Easy exactly on the due date counts", () => {
    const s = applyAttempt(base(), att(7, "easy"));
    expect(s.intervalDays).toBe(14);
    expect(s.nextReview).toBe(at(21));
  });

  it("overdue Easy counts and schedules from the attempt date", () => {
    const s = applyAttempt(base(), att(20, "easy"));
    expect(s.intervalDays).toBe(14);
    expect(s.nextReview).toBe(at(34));
  });

  it.each([
    ["struggled", 3],
    ["needed_solution", 2],
  ] as const)("early %s still resets", (rating, interval) => {
    const s = applyAttempt(base(), att(3, rating));
    expect(s.intervalDays).toBe(interval);
    expect(s.nextReview).toBe(at(3 + interval));
  });

  it("Easy after a 2-day interval jumps to the 7-day floor", () => {
    const s = replay([att(0, "needed_solution"), att(2, "easy")])!;
    expect(s.intervalDays).toBe(7);
  });

  it("backdated first attempt schedules from its own date", () => {
    const s = replay([att(-5, "easy")])!;
    expect(s.nextReview).toBe(at(2));
  });
});

describe("replay", () => {
  it("returns null for no attempts", () => {
    expect(replay([])).toBeNull();
  });

  it("is order-independent: sorts by date, then id", () => {
    const a = att(0, "needed_solution", 10);
    const b = att(2, "struggled", 11);
    const c = att(5, "easy", 12);
    expect(replay([c, a, b])).toEqual(replay([a, b, c]));
  });

  it("orders same-day attempts by id", () => {
    // struggled first -> next review day 3; the same-day Easy is early, so the schedule stays at 3 days
    const struggledFirst = replay([att(0, "easy", 2), att(0, "struggled", 1)])!;
    expect(struggledFirst.intervalDays).toBe(3);
    expect(struggledFirst.nextReview).toBe(at(3));
    // easy first -> interval 7; the same-day Struggled always resets to 3
    const easyFirst = replay([att(0, "struggled", 2), att(0, "easy", 1)])!;
    expect(easyFirst.intervalDays).toBe(3);
    expect(easyFirst.timesReviewed).toBe(2);
  });

  it("deleting the last attempt restores the previous state", () => {
    const attempts = [att(0, "easy"), att(7, "easy"), att(21, "struggled")];
    expect(replay(attempts)!.intervalDays).toBe(3);
    expect(replay(attempts.slice(0, 2))!.intervalDays).toBe(14);
    expect(replay(attempts.slice(0, 1))!.intervalDays).toBe(7);
    expect(replay(attempts.slice(0, 0))).toBeNull();
  });
});

describe("due logic", () => {
  const state = (next: string | null, status: ReviewState["status"] = "in_review"): ReviewState => ({
    intervalDays: 7,
    nextReview: next,
    lastReviewed: at(0),
    timesReviewed: 1,
    status,
  });

  it("is due on next_review and not the day before", () => {
    expect(isDue(state(at(7)), at(7))).toBe(true);
    expect(isDue(state(at(7)), at(6))).toBe(false);
    expect(isDue(state(at(7)), at(9))).toBe(true);
  });

  it("retired is never due", () => {
    expect(isDue(state(null, "retired"), at(1000))).toBe(false);
  });

  it("a mastered problem is due at its 90-day recheck", () => {
    expect(isDue(state(at(139), "mastered"), at(139))).toBe(true);
    expect(isDue(state(at(139), "mastered"), at(138))).toBe(false);
  });

  it("daysOverdue is 0 on the due date and counts up after", () => {
    expect(daysOverdue(state(at(7)), at(7))).toBe(0);
    expect(daysOverdue(state(at(7)), at(10))).toBe(3);
  });

  it("sorts most overdue first, then Hard, Medium, Easy, then position", () => {
    const today = at(10);
    const items = [
      { id: "easy-old", state: state(at(5)), difficulty: "Easy", position: 1 },
      { id: "hard-new", state: state(at(9)), difficulty: "Hard", position: 2 },
      { id: "med-new", state: state(at(9)), difficulty: "Medium", position: 3 },
      { id: "easy-new-a", state: state(at(9)), difficulty: "Easy", position: 4 },
      { id: "easy-new-b", state: state(at(9)), difficulty: "Easy", position: 5 },
    ];
    const shuffled = [items[4], items[2], items[0], items[3], items[1]];
    const sorted = shuffled.sort((a, b) => compareDue(a, b, today)).map((i) => i.id);
    expect(sorted).toEqual(["easy-old", "hard-new", "med-new", "easy-new-a", "easy-new-b"]);
  });
});

describe("problemStatus", () => {
  it("maps state to display status", () => {
    expect(problemStatus(null)).toBe("unsolved");
    expect(problemStatus({ status: "in_review" } as ReviewState)).toBe("in review");
    expect(problemStatus({ status: "mastered" } as ReviewState)).toBe("mastered");
    expect(problemStatus({ status: "retired" } as ReviewState)).toBe("retired");
  });
});
