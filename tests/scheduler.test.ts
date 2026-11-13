// Tests for lib/scheduler.ts: the SM-2 spaced-repetition rules (see docs/SPEC.md,
// "Scheduling rules (SM-2)"). These are pure: no database, no clock.
//
// The ease factor (EF) is written in HUNDREDTHS everywhere: 250 means 2.50.
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

// A state to start from: two passes in a row (interval 6), EF 2.50, due on day 10.
// Tests override only the fields they care about.
const state = (o: Partial<ReviewState> = {}): ReviewState => ({
  intervalDays: 6,
  easeFactor: 250,
  repetitions: 2,
  nextReview: at(10),
  lastReviewed: at(4),
  timesReviewed: 3,
  ...o,
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
  // The first interval is always 1 day. A pass counts as one repetition and
  // adjusts the ease factor; a failure leaves it at the starting 2.50.
  it.each([
    ["easy", 260, 1],
    ["struggled", 236, 1],
    ["needed_solution", 250, 0],
  ] as const)("%s: ease factor %i, repetitions %i", (rating, ease, reps) => {
    const s = applyAttempt(null, att(0, rating));
    expect(s).toEqual({
      intervalDays: 1,
      easeFactor: ease,
      repetitions: reps,
      nextReview: at(1),
      lastReviewed: at(0),
      timesReviewed: 1,
    });
  });
});

describe("worked example (the table in the spec)", () => {
  //  day, rating, interval, ease factor, repetitions, next review (day)
  const steps: [number, Attempt["rating"], number, number, number, number][] = [
    [0, "needed_solution", 1, 250, 0, 1],
    [1, "struggled", 1, 236, 1, 2],
    [2, "easy", 6, 246, 2, 8],
    [8, "easy", 15, 256, 3, 23],
    [23, "easy", 38, 266, 4, 61],
    [61, "easy", 101, 276, 5, 162],
  ];

  it("reproduces every row, step by step", () => {
    let s: ReviewState | null = null;
    steps.forEach(([day, rating, interval, ease, reps, next], i) => {
      s = applyAttempt(s, att(day, rating));
      expect(s, `day ${day}`).toEqual({
        intervalDays: interval,
        easeFactor: ease,
        repetitions: reps,
        nextReview: at(next),
        lastReviewed: at(day),
        timesReviewed: i + 1,
      });
    });
  });

  it("replay of the whole sequence gives the same final state", () => {
    const s = replay(steps.map(([day, rating]) => att(day, rating)))!;
    expect(s).toMatchObject({ intervalDays: 101, easeFactor: 276, repetitions: 5, nextReview: at(162) });
  });

  it("becomes mastered (a gap of 28+ days) on day 23", () => {
    const day8 = replay(steps.slice(0, 4).map(([d, r]) => att(d, r)))!;
    const day23 = replay(steps.slice(0, 5).map(([d, r]) => att(d, r)))!;
    expect(problemStatus(day8)).toBe("in review");
    expect(problemStatus(day23)).toBe("mastered");
  });

  it("variation: a failure while mastered restarts the gap but keeps the ease factor", () => {
    const mastered = replay(steps.map(([d, r]) => att(d, r)))!;
    const s = applyAttempt(mastered, att(100, "needed_solution"));
    expect(s).toMatchObject({ intervalDays: 1, repetitions: 0, easeFactor: 276, nextReview: at(101) });
  });

  it("variation: an Easy on day 20 (before it is due on day 23) is logged but changes nothing", () => {
    const day8 = replay(steps.slice(0, 4).map(([d, r]) => att(d, r)))!;
    const s = applyAttempt(day8, att(20, "easy"));
    expect(s).toMatchObject({ intervalDays: 15, easeFactor: 256, repetitions: 3, nextReview: at(23) });
    expect(s.timesReviewed).toBe(5);
    expect(s.lastReviewed).toBe(at(20));
  });
});

describe("the interval ladder", () => {
  it("a second pass in a row is 6 days", () => {
    const s = replay([att(0, "easy"), att(1, "easy")])!;
    expect(s).toMatchObject({ intervalDays: 6, repetitions: 2, nextReview: at(7) });
  });

  // First attempt Easy, then Easy each time it is due. Each gap is the previous
  // gap times the ease factor from BEFORE that review's update.
  it("later gaps are the previous gap times the ease factor", () => {
    let s: ReviewState | null = null;
    const expected = [
      { day: 0, interval: 1, ease: 260, next: 1 },
      { day: 1, interval: 6, ease: 270, next: 7 },
      { day: 7, interval: 16, ease: 280, next: 23 }, // 6 x 2.70 = 16.2
      { day: 23, interval: 45, ease: 290, next: 68 }, // 16 x 2.80 = 44.8
    ];
    for (const e of expected) {
      s = applyAttempt(s, att(e.day, "easy"));
      expect(s, `day ${e.day}`).toMatchObject({ intervalDays: e.interval, easeFactor: e.ease, nextReview: at(e.next) });
    }
  });

  // Gaps are whole days, rounded to the nearest, with exact halves rounding UP.
  it.each([
    [45, 290, 131], // 130.5 -> 131 (half rounds up)
    [10, 255, 26], // 25.5 -> 26
    [15, 256, 38], // 38.4 -> 38 (rounds down)
    [6, 250, 15], // exactly 15
    [16, 280, 45], // 44.8 -> 45
  ])("%i days x ease %i rounds to %i", (interval, ease, expected) => {
    const s = applyAttempt(state({ intervalDays: interval, easeFactor: ease, repetitions: 3, nextReview: at(0) }), att(0, "easy"));
    expect(s.intervalDays).toBe(expected);
  });
});

describe("the ease factor", () => {
  it("rises 0.10 on Easy and falls 0.14 on Struggled", () => {
    const base = state({ nextReview: at(0) });
    expect(applyAttempt(base, att(0, "easy")).easeFactor).toBe(260);
    expect(applyAttempt(base, att(0, "struggled")).easeFactor).toBe(236);
  });

  it("never drops below 1.30", () => {
    const low = state({ easeFactor: 135, nextReview: at(0) });
    expect(applyAttempt(low, att(0, "struggled")).easeFactor).toBe(130); // 135 - 14 = 121 -> 130
    const floor = state({ easeFactor: 130, nextReview: at(0) });
    expect(applyAttempt(floor, att(0, "struggled")).easeFactor).toBe(130);
  });

  it("falls to the floor and stays there after many Struggled reviews in a row", () => {
    let s: ReviewState | null = null;
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      const day: number = s ? daysBetween(D0, s.nextReview) : 0; // always review exactly when due
      s = applyAttempt(s, att(day, "struggled"));
      seen.push(s.easeFactor);
    }
    expect(seen.slice(0, 9)).toEqual([236, 222, 208, 194, 180, 166, 152, 138, 130]);
    expect(Math.min(...seen)).toBe(130);
  });

  it("is left unchanged by a failure", () => {
    const s = applyAttempt(state({ easeFactor: 276 }), att(12, "needed_solution"));
    expect(s.easeFactor).toBe(276);
  });
});

describe("failures", () => {
  it("restart the repetitions and set the gap to 1 day", () => {
    const s = applyAttempt(state({ nextReview: at(0) }), att(0, "needed_solution"));
    expect(s).toMatchObject({ repetitions: 0, intervalDays: 1, nextReview: at(1) });
  });

  it("always apply, even before the problem is due", () => {
    const s = applyAttempt(state({ nextReview: at(10) }), att(5, "needed_solution"));
    expect(s).toMatchObject({ repetitions: 0, intervalDays: 1, nextReview: at(6), timesReviewed: 4 });
  });

  it("always apply to a problem with a very long gap", () => {
    const s = applyAttempt(state({ intervalDays: 101, easeFactor: 276, repetitions: 5, nextReview: at(162) }), att(100, "needed_solution"));
    expect(s).toMatchObject({ intervalDays: 1, repetitions: 0, easeFactor: 276, nextReview: at(101) });
  });

  it("schedule from the attempt's own date (a backdated failure)", () => {
    const s = applyAttempt(null, att(-5, "needed_solution"));
    expect(s.nextReview).toBe(at(-4));
  });
});

describe("early passes (before the due date)", () => {
  // Both Easy and Struggled are passes. Early, they are logged but change nothing.
  it.each(["easy", "struggled"] as const)("an early %s changes nothing except the log", (rating) => {
    const before = state({ nextReview: at(10) });
    const after = applyAttempt(before, att(5, rating));
    expect(after).toEqual({ ...before, lastReviewed: at(5), timesReviewed: before.timesReviewed + 1 });
  });

  it("a pass exactly on the due date counts", () => {
    const s = applyAttempt(state({ nextReview: at(10) }), att(10, "easy"));
    expect(s).toMatchObject({ intervalDays: 15, repetitions: 3, nextReview: at(25) });
  });

  it("an overdue pass counts and schedules from the attempt date", () => {
    const s = applyAttempt(state({ nextReview: at(10) }), att(20, "easy"));
    expect(s).toMatchObject({ intervalDays: 15, nextReview: at(35) });
  });

  it("a backdated first attempt schedules from its own date", () => {
    expect(replay([att(-5, "easy")])!.nextReview).toBe(at(-4));
  });
});

describe("same-day repeats", () => {
  // If the problem already has an attempt on this date, a further attempt that day
  // is logged (it counts in timesReviewed) but changes nothing. A repeat PASS would
  // be "early" anyway; what this adds is that a repeat FAILURE is ignored too.
  const reviewedToday = () => state({ lastReviewed: at(5), nextReview: at(9), timesReviewed: 3 });

  it("a failure on the same day as an earlier attempt is logged but changes nothing", () => {
    const before = reviewedToday();
    const after = applyAttempt(before, att(5, "needed_solution"));
    expect(after).toEqual({ ...before, timesReviewed: before.timesReviewed + 1 });
  });

  it("the same failure on a different day does apply", () => {
    const after = applyAttempt(reviewedToday(), att(6, "needed_solution"));
    expect(after).toMatchObject({ intervalDays: 1, repetitions: 0, nextReview: at(7) });
  });

  it("a pass on the same day changes nothing either", () => {
    const before = reviewedToday();
    expect(applyAttempt(before, att(5, "easy"))).toEqual({ ...before, timesReviewed: 4 });
    expect(applyAttempt(before, att(5, "struggled"))).toEqual({ ...before, timesReviewed: 4 });
  });

  it("the first attempt of the day decides; later ones that day are only logged (replay)", () => {
    // Easy first, then a Needed solution the same evening: the Easy stands.
    const morningEasy = replay([att(0, "easy", 1), att(0, "needed_solution", 2)])!;
    expect(morningEasy).toMatchObject({ intervalDays: 1, repetitions: 1, easeFactor: 260, nextReview: at(1), timesReviewed: 2 });
    // Needed solution first, then an Easy the same day: the failure stands.
    const morningFail = replay([att(0, "needed_solution", 1), att(0, "easy", 2)])!;
    expect(morningFail).toMatchObject({ intervalDays: 1, repetitions: 0, easeFactor: 250, nextReview: at(1), timesReviewed: 2 });
  });

  it("a repeat on the same day does not stop the next day counting", () => {
    const s = replay([att(0, "easy", 1), att(0, "needed_solution", 2), att(1, "easy", 3)])!;
    expect(s).toMatchObject({ intervalDays: 6, repetitions: 2, nextReview: at(7), timesReviewed: 3 });
  });

  it("deleting the first attempt of the day lets the next one count (undo)", () => {
    const both = [att(0, "easy", 1), att(0, "needed_solution", 2)];
    expect(replay(both)).toMatchObject({ repetitions: 1, easeFactor: 260 }); // the Easy counts
    expect(replay(both.slice(1))).toMatchObject({ repetitions: 0, easeFactor: 250, timesReviewed: 1 }); // now the failure does
  });
});

describe("replay", () => {
  it("returns null for no attempts", () => {
    expect(replay([])).toBeNull();
  });

  it("is order-independent: sorts by date, then id", () => {
    const a = att(0, "needed_solution", 10);
    const b = att(1, "struggled", 11);
    const c = att(2, "easy", 12);
    expect(replay([c, a, b])).toEqual(replay([a, b, c]));
  });

  it("orders same-day attempts by id (and the order matters)", () => {
    // Struggled first: gap 1, EF 2.36; the later same-day Easy is only logged.
    const struggledFirst = replay([att(0, "easy", 2), att(0, "struggled", 1)])!;
    expect(struggledFirst).toMatchObject({ easeFactor: 236, timesReviewed: 2 });
    // Easy first: gap 1, EF 2.60; the later same-day Struggled is only logged.
    const easyFirst = replay([att(0, "struggled", 2), att(0, "easy", 1)])!;
    expect(easyFirst).toMatchObject({ easeFactor: 260, timesReviewed: 2 });
  });

  it("replaying all but the last attempt restores the previous state (undo)", () => {
    const attempts = [att(0, "easy"), att(1, "easy"), att(7, "struggled")];
    expect(replay(attempts)).toMatchObject({ intervalDays: 16, easeFactor: 256 });
    expect(replay(attempts.slice(0, 2))).toMatchObject({ intervalDays: 6, easeFactor: 270 });
    expect(replay(attempts.slice(0, 1))).toMatchObject({ intervalDays: 1, easeFactor: 260 });
    expect(replay(attempts.slice(0, 0))).toBeNull();
  });
});

describe("due logic", () => {
  it("is due on next_review and not the day before", () => {
    expect(isDue(state({ nextReview: at(7) }), at(7))).toBe(true);
    expect(isDue(state({ nextReview: at(7) }), at(6))).toBe(false);
    expect(isDue(state({ nextReview: at(7) }), at(9))).toBe(true);
  });

  it("a problem with a very long gap comes due again", () => {
    const long = state({ intervalDays: 101, nextReview: at(162) });
    expect(isDue(long, at(161))).toBe(false);
    expect(isDue(long, at(162))).toBe(true);
  });

  it("daysOverdue is 0 on the due date and counts up after", () => {
    expect(daysOverdue(state({ nextReview: at(7) }), at(7))).toBe(0);
    expect(daysOverdue(state({ nextReview: at(7) }), at(10))).toBe(3);
    expect(daysOverdue(state({ nextReview: at(7) }), at(3))).toBe(0);
  });

  it("sorts most overdue first, then Hard, Medium, Easy, then position", () => {
    const today = at(10);
    const items = [
      { id: "easy-old", state: state({ nextReview: at(5) }), difficulty: "Easy", position: 1 },
      { id: "hard-new", state: state({ nextReview: at(9) }), difficulty: "Hard", position: 2 },
      { id: "med-new", state: state({ nextReview: at(9) }), difficulty: "Medium", position: 3 },
      { id: "easy-new-a", state: state({ nextReview: at(9) }), difficulty: "Easy", position: 4 },
      { id: "easy-new-b", state: state({ nextReview: at(9) }), difficulty: "Easy", position: 5 },
    ];
    const shuffled = [items[4], items[2], items[0], items[3], items[1]];
    const sorted = shuffled.sort((a, b) => compareDue(a, b, today)).map((i) => i.id);
    expect(sorted).toEqual(["easy-old", "hard-new", "med-new", "easy-new-a", "easy-new-b"]);
  });
});

describe("problemStatus", () => {
  it("no state is unsolved", () => {
    expect(problemStatus(null)).toBe("unsolved");
  });

  it("a gap under 28 days is in review; 28 or more is mastered", () => {
    expect(problemStatus(state({ intervalDays: 1 }))).toBe("in review");
    expect(problemStatus(state({ intervalDays: 27 }))).toBe("in review");
    expect(problemStatus(state({ intervalDays: 28 }))).toBe("mastered");
    expect(problemStatus(state({ intervalDays: 101 }))).toBe("mastered");
  });
});
