// Tests for lib/api-shape.ts: how a schedule is shown to API clients.
// Inside the app the ease factor is a whole number of hundredths (250); the API
// shows it as the decimal people expect (2.5).
import { describe, expect, it } from "vitest";
import { reviewStateToApi } from "@/lib/api-shape";
import type { ReviewState } from "@/lib/scheduler";

const state = (o: Partial<ReviewState> = {}): ReviewState => ({
  intervalDays: 6,
  easeFactor: 246,
  repetitions: 2,
  nextReview: "2026-01-08",
  lastReviewed: "2026-01-02",
  timesReviewed: 3,
  ...o,
});

describe("reviewStateToApi", () => {
  it("returns null for a problem with no schedule", () => {
    expect(reviewStateToApi(null)).toBeNull();
  });

  it("shows the ease factor as a decimal and keeps every other field", () => {
    expect(reviewStateToApi(state())).toEqual({
      intervalDays: 6,
      easeFactor: 2.46,
      repetitions: 2,
      nextReview: "2026-01-08",
      lastReviewed: "2026-01-02",
      timesReviewed: 3,
    });
  });

  it.each([
    [250, 2.5],
    [276, 2.76],
    [130, 1.3],
    [101, 1.01],
    [299, 2.99],
  ])("hundredths %i is shown as %d", (hundredths, decimal) => {
    expect(reviewStateToApi(state({ easeFactor: hundredths }))!.easeFactor).toBe(decimal);
  });

  it("has no status field", () => {
    expect(reviewStateToApi(state())).not.toHaveProperty("status");
  });
});
