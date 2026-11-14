import { describe, expect, it } from "vitest";
import { addDays, applyAttempt, replay, type Rating, type ReviewState } from "@/lib/scheduler";
import {
  earlyRatingWarning,
  formatShortDate,
  insightRequest,
  logAttemptBody,
} from "@/lib/problem-detail";

const state = { nextReview: "2026-11-20", lastReviewed: "2026-11-13" };

describe("earlyRatingWarning", () => {
  it("says nothing for a problem with no attempts yet", () => {
    expect(earlyRatingWarning(null, "easy", "2026-11-13")).toBeNull();
  });

  it("warns that an Easy before the due date will not change the schedule", () => {
    expect(earlyRatingWarning(state, "easy", "2026-11-15")).toBe(
      "Not due until Nov 20, so an Easy rating won't change the schedule.",
    );
  });

  it("warns for Struggled too, since it is also a pass", () => {
    expect(earlyRatingWarning(state, "struggled", "2026-11-15")).toBe(
      "Not due until Nov 20, so a Struggled rating won't change the schedule.",
    );
  });

  it("never warns for Needed solution, which always applies", () => {
    expect(earlyRatingWarning(state, "needed_solution", "2026-11-15")).toBeNull();
  });

  it("does not warn on the due date or after it", () => {
    expect(earlyRatingWarning(state, "easy", "2026-11-20")).toBeNull();
    expect(earlyRatingWarning(state, "easy", "2026-11-25")).toBeNull();
  });

  it("does not warn for a date before the last review, which replays in a different order", () => {
    expect(earlyRatingWarning(state, "easy", "2026-11-10")).toBeNull();
  });

  it("warns on the day of the last review", () => {
    expect(earlyRatingWarning(state, "easy", "2026-11-13")).toBe(
      "Not due until Nov 20, so an Easy rating won't change the schedule.",
    );
  });

  it("includes the year when the due date is in another year than the attempt", () => {
    expect(earlyRatingWarning({ nextReview: "2027-01-05", lastReviewed: "2026-12-20" }, "easy", "2026-12-28")).toBe(
      "Not due until Jan 5, 2027, so an Easy rating won't change the schedule.",
    );
  });

  it("agrees with the scheduler: it warns exactly when a pass leaves the schedule unchanged", () => {
    const history = replay([
      { id: 1, attemptedOn: "2026-06-01", rating: "easy" },
      { id: 2, attemptedOn: "2026-06-02", rating: "easy" },
      { id: 3, attemptedOn: "2026-06-08", rating: "struggled" },
    ]) as ReviewState;

    for (const rating of ["easy", "struggled"] as Rating[]) {
      for (let offset = 0; offset <= 40; offset++) {
        const date = addDays(history.lastReviewed, offset);
        const after = applyAttempt(history, { id: 9, attemptedOn: date, rating });
        const unchanged =
          after.nextReview === history.nextReview &&
          after.intervalDays === history.intervalDays &&
          after.easeFactor === history.easeFactor &&
          after.repetitions === history.repetitions;

        expect(earlyRatingWarning(history, rating, date) !== null, `${rating} on ${date}`).toBe(unchanged);
      }
    }
  });
});

describe("formatShortDate", () => {
  it("writes month and day when the year matches the reference date", () => {
    expect(formatShortDate("2026-11-20", "2026-11-13")).toBe("Nov 20");
    expect(formatShortDate("2026-01-05", "2026-11-13")).toBe("Jan 5");
  });

  it("adds the year when it differs", () => {
    expect(formatShortDate("2027-01-05", "2026-11-13")).toBe("Jan 5, 2027");
  });
});

describe("logAttemptBody", () => {
  it("sends the rating, minutes as a number, the trimmed insight and attempted_on", () => {
    expect(logAttemptBody({ rating: "easy", minutes: "25", insight: "  use a hash map ", attemptedOn: "2026-11-13" })).toEqual({
      rating: "easy",
      minutes: 25,
      insight: "use a hash map",
      attempted_on: "2026-11-13",
    });
  });

  it("leaves out blank minutes and a blank insight", () => {
    expect(logAttemptBody({ rating: "struggled", minutes: "", insight: "   ", attemptedOn: "2026-11-13" })).toEqual({
      rating: "struggled",
      attempted_on: "2026-11-13",
    });
  });

  it("keeps a minutes value of 0", () => {
    expect(logAttemptBody({ rating: "easy", minutes: "0", insight: "", attemptedOn: "2026-11-13" }).minutes).toBe(0);
  });

  it("passes a non-numeric minutes value through as text, so the API rejects it", () => {
    expect(logAttemptBody({ rating: "easy", minutes: "abc", insight: "", attemptedOn: "2026-11-13" }).minutes).toBe("abc");
  });
});

describe("insightRequest", () => {
  it("PATCHes the trimmed insight to the problem's insight route", () => {
    expect(insightRequest(7, "  two pointers  ")).toEqual({
      url: "/api/problems/7/insight",
      init: {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insight: "two pointers" }),
      },
    });
  });

  it("sends an empty string to clear the insight", () => {
    expect(insightRequest(7, "   ").init.body).toBe(JSON.stringify({ insight: "" }));
  });
});
