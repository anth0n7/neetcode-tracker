import type { ReviewState } from "./scheduler";

export type ApiReviewState = {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  nextReview: string;
  lastReviewed: string;
  timesReviewed: number;
};

export function reviewStateToApi(state: ReviewState | null): ApiReviewState | null {
  if (state === null) return null;
  return {
    intervalDays: state.intervalDays,
    easeFactor: state.easeFactor / 100,
    repetitions: state.repetitions,
    nextReview: state.nextReview,
    lastReviewed: state.lastReviewed,
    timesReviewed: state.timesReviewed,
  };
}
