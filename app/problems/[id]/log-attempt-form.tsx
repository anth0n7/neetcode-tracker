"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiReviewState } from "@/lib/api-shape";
import { earlyRatingWarning, logAttemptBody } from "@/lib/problem-detail";
import { RATING_BUTTONS, type Rating } from "@/lib/today-list";

const field = "field";

export function LogAttemptForm({
  problemId,
  today,
  reviewState,
}: {
  problemId: number;
  today: string;
  reviewState: ApiReviewState | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<Rating | null>(null);
  const [minutes, setMinutes] = useState("");
  const [insight, setInsight] = useState("");
  const [attemptedOn, setAttemptedOn] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warning = rating ? earlyRatingWarning(reviewState, rating, attemptedOn) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/problems/${problemId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logAttemptBody({ rating, minutes, insight, attemptedOn })),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      setRating(null);
      setMinutes("");
      setInsight("");
      setAttemptedOn(today);
      router.refresh();
    } catch (err) {
      setError(`Could not log the attempt: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="card flex flex-col gap-4 p-5">
      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="sr-only">Rating</legend>
        {RATING_BUTTONS.map((b) => (
          <label
            key={b.rating}
            className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              rating === b.rating
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface hover:bg-subtle"
            }`}
          >
            <input
              type="radio"
              name="rating"
              value={b.rating}
              checked={rating === b.rating}
              onChange={() => setRating(b.rating)}
              className="sr-only"
            />
            {b.label}
          </label>
        ))}
      </fieldset>

      {warning && (
        <p role="status" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">
          {warning}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            value={attemptedOn}
            max={today}
            onChange={(e) => setAttemptedOn(e.target.value)}
            className={field}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Minutes (optional)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1440}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className={field}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Insight (optional)
        <textarea value={insight} maxLength={500} rows={2} onChange={(e) => setInsight(e.target.value)} className={field} />
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!rating || saving}
        className="btn btn-primary self-start"
      >
        Log attempt
      </button>
    </form>
  );
}
