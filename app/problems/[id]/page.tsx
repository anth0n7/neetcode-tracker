import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { HttpError } from "@/lib/http";
import { formatShortDate } from "@/lib/problem-detail";
import { getProblem } from "@/lib/queries";
import { todayLocal } from "@/lib/today";
import { parseProblemId } from "@/lib/validate";
import { RATING_BUTTONS } from "@/lib/today-list";
import { DifficultyLabel, StatusPill } from "../../ui/pills";
import { DeleteAttemptButton } from "./delete-attempt-button";
import { InsightEditor } from "./insight-editor";
import { LogAttemptForm } from "./log-attempt-form";

const ratingLabel = (rating: string) => RATING_BUTTONS.find((b) => b.rating === rating)?.label ?? rating;

function Fact({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${accent ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
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
      <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
        ← All problems
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {problem.title}{" "}
          <a
            href={problem.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${problem.title} on NeetCode`}
            className="text-base font-normal text-muted/60 transition-colors hover:text-accent"
          >
            ↗
          </a>
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>{problem.pattern}</span>
          <DifficultyLabel difficulty={problem.difficulty} />
          <StatusPill status={problem.status} />
        </p>
      </header>

      <Section title="Schedule">
        {state ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact
              label="Next review"
              value={problem.due ? "Due now" : formatShortDate(state.nextReview, today)}
              accent={problem.due}
            />
            <Fact label="Interval" value={`${state.intervalDays} ${state.intervalDays === 1 ? "day" : "days"}`} />
            <Fact label="Ease factor" value={state.easeFactor.toFixed(2)} />
            <Fact label="Repetitions" value={state.repetitions} />
            <Fact label="Times reviewed" value={state.timesReviewed} />
            <Fact label="Last reviewed" value={formatShortDate(state.lastReviewed, today)} />
          </dl>
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-muted">No attempts yet. Log one below to start the schedule.</p>
        )}
      </Section>

      <Section title="Insight">
        <InsightEditor key={problem.insight ?? ""} problemId={problem.id} insight={problem.insight ?? ""} />
      </Section>

      <Section title="Log an attempt">
        <LogAttemptForm problemId={problem.id} today={today} reviewState={state} />
      </Section>

      <Section title="History">
        {problem.attempts.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {problem.attempts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {formatShortDate(a.attemptedOn, today)} · {ratingLabel(a.rating)}
                    {a.minutes !== null && <span className="font-normal text-muted"> · {a.minutes} min</span>}
                  </p>
                  {a.insight && <p className="mt-1 whitespace-pre-wrap text-muted">{a.insight}</p>}
                </div>
                <DeleteAttemptButton problemId={problem.id} attemptId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
