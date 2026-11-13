import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { HttpError } from "@/lib/http";
import { formatShortDate } from "@/lib/problem-detail";
import { getProblem } from "@/lib/queries";
import { todayLocal } from "@/lib/today";
import { parseProblemId } from "@/lib/validate";
import { RATING_BUTTONS } from "@/lib/today-list";
import { DeleteAttemptButton } from "./delete-attempt-button";
import { InsightEditor } from "./insight-editor";
import { LogAttemptForm } from "./log-attempt-form";

const ratingLabel = (rating: string) => RATING_BUTTONS.find((b) => b.rating === rating)?.label ?? rating;

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();

  let id: number;
  try {
    id = parseProblemId((await params).id);
  } catch (error) {
    if (error instanceof HttpError) notFound();
    throw error;
  }

  const today = todayLocal();
  const problem = await getProblem(id, today);
  if (!problem) notFound();

  const state = problem.reviewState;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
        ← Problems
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold">
          {problem.title}{" "}
          <a
            href={problem.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${problem.title} on NeetCode`}
            className="text-base text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
          >
            ↗
          </a>
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {problem.pattern} · {problem.difficulty} · {problem.status}
        </p>
      </header>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Schedule</h2>
        {state ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact
              label="Next review"
              value={`${formatShortDate(state.nextReview, today)}${problem.due ? " (due)" : ""}`}
            />
            <Fact label="Interval" value={`${state.intervalDays} ${state.intervalDays === 1 ? "day" : "days"}`} />
            <Fact label="Ease factor" value={state.easeFactor.toFixed(2)} />
            <Fact label="Repetitions" value={state.repetitions} />
            <Fact label="Times reviewed" value={state.timesReviewed} />
            <Fact label="Last reviewed" value={formatShortDate(state.lastReviewed, today)} />
          </dl>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No attempts yet.</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Insight</h2>
        <InsightEditor key={problem.insight ?? ""} problemId={problem.id} insight={problem.insight ?? ""} />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Log an attempt</h2>
        <LogAttemptForm problemId={problem.id} today={today} reviewState={state} />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        {problem.attempts.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {problem.attempts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div>
                  <p className="font-medium">
                    {a.attemptedOn} · {ratingLabel(a.rating)}
                    {a.minutes !== null && <span className="font-normal text-zinc-600 dark:text-zinc-400"> · {a.minutes} min</span>}
                  </p>
                  {a.insight && <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{a.insight}</p>}
                </div>
                <DeleteAttemptButton problemId={problem.id} attemptId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
