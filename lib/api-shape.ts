// How a problem's schedule is shown to API clients.
//
// Inside the app the ease factor is a whole number of HUNDREDTHS (250 = 2.50) so
// the scheduling maths is exact. API clients get the decimal people expect (2.5),
// so the conversion happens here, at the edge, in one place.
import type { ReviewState } from "./scheduler";

// The schedule as the API returns it. There is no status field: whether a problem
// is "in review" or "mastered" is a separate field on the problem itself.
export type ApiReviewState = {
  intervalDays: number; // the current gap between reviews, in days
  easeFactor: number; // how fast the gap grows, as a decimal (2.5)
  repetitions: number; // passes in a row since the last failure
  nextReview: string; // YYYY-MM-DD
  lastReviewed: string; // YYYY-MM-DD
  timesReviewed: number; // all attempts, including early and same-day ones
};

// null (the problem has never been attempted) stays null.
export function reviewStateToApi(state: ReviewState | null): ApiReviewState | null {
  if (state === null) return null;
  return {
    intervalDays: state.intervalDays,
    // Dividing a whole number of hundredths by 100 gives the nearest decimal
    // (246 -> 2.46), so there is nothing to round.
    easeFactor: state.easeFactor / 100,
    repetitions: state.repetitions,
    nextReview: state.nextReview,
    lastReviewed: state.lastReviewed,
    timesReviewed: state.timesReviewed,
  };
}
