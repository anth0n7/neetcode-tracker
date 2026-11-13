"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiReviewState } from "@/lib/api-shape";
import { earlyRatingWarning, logAttemptBody } from "@/lib/problem-detail";
import { RATING_BUTTONS, type Rating } from "@/lib/today-list";

const field = "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

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
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="sr-only">Rating</legend>
        {RATING_BUTTONS.map((b) => (
          <label
            key={b.rating}
            className={`cursor-pointer rounded-md border px-3 py-3 text-center text-sm font-medium has-[:focus-visible]:ring-2 ${
              rating === b.rating
                ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
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
        <p role="status" className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
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
        <p role="alert" className="rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!rating || saving}
        className="self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium enabled:hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:enabled:hover:bg-zinc-900"
      >
        Log attempt
      </button>
    </form>
  );
}
