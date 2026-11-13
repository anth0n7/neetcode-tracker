import { RATING_BUTTONS } from "./today-list";
import type { Rating } from "./scheduler";

const PASSES: Rating[] = ["easy", "struggled"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatShortDate(date: string, reference: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const text = `${MONTHS[month - 1]} ${day}`;
  return year === Number(reference.slice(0, 4)) ? text : `${text}, ${year}`;
}

export function earlyRatingWarning(
  state: { nextReview: string; lastReviewed: string } | null,
  rating: Rating,
  attemptedOn: string,
): string | null {
  if (!state || !PASSES.includes(rating)) return null;
  if (attemptedOn < state.lastReviewed || attemptedOn >= state.nextReview) return null;

  const label = RATING_BUTTONS.find((b) => b.rating === rating)!.label;
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
  return `Not due until ${formatShortDate(state.nextReview, attemptedOn)}, so ${article} ${label} rating won't change the schedule.`;
}

export type LogForm = { rating: Rating; minutes: string; insight: string; attemptedOn: string };

export function logAttemptBody(form: LogForm): Record<string, unknown> {
  const body: Record<string, unknown> = { rating: form.rating };
  const minutes = form.minutes.trim();
  if (minutes !== "") body.minutes = Number.isNaN(Number(minutes)) ? minutes : Number(minutes);
  const insight = form.insight.trim();
  if (insight !== "") body.insight = insight;
  body.attempted_on = form.attemptedOn;
  return body;
}

export function insightRequest(problemId: number, insight: string): { url: string; init: RequestInit } {
  return {
    url: `/api/problems/${problemId}/insight`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insight: insight.trim() }),
    },
  };
}
