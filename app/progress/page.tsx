import Link from "next/link";
import { connection } from "next/server";
import { groupByPattern, sumGroups } from "@/lib/pattern-groups";
import { getAttemptsPerDay, listProblems } from "@/lib/queries";
import { todayLocal } from "@/lib/today";
import { ProgressBar } from "../ui/progress-bar";
import { AttemptsChart } from "./attempts-chart";
import { OverallDonut } from "./overall-donut";

export default async function ProgressPage() {
  await connection();
  const today = todayLocal();
  const [rows, days] = await Promise.all([listProblems({}, today), getAttemptsPerDay(today)]);
  const groups = groupByPattern(rows);
  const totals = sumGroups(groups);
  const attemptsLast7Days = days.reduce((n, d) => n + d.attempts, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <section className="card flex items-center gap-6 p-5">
          <OverallDonut total={totals.total} mastered={totals.mastered} inReview={totals.inReview} />
          <div>
            <p className="flex gap-4 text-xs text-muted">
              <span>
                <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-accent" />
                {totals.mastered} mastered
              </span>
              <span>
                <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-accent/40" />
                {totals.inReview} in review
              </span>
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {totals.due} <span className="text-sm font-normal text-muted">due today</span>
            </p>
            <Link href="/today" className="mt-1 inline-block text-sm text-accent hover:underline">
              Go to Today <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 text-sm text-muted">
            Attempts per day, last 7 days ({attemptsLast7Days})
          </h2>
          <AttemptsChart days={days} />
        </section>
      </div>

      <section className="card px-5 py-2">
        <h2 className="sr-only">Progress by pattern</h2>
        <ul>
          {groups.map((g) => (
            <li
              key={g.pattern}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)_3.5rem_4rem]"
            >
              <span className="truncate text-sm">{g.pattern}</span>
              <span className="text-right text-sm text-muted sm:order-3">
                {g.solved}/{g.total}
              </span>
              <ProgressBar
                total={g.total}
                mastered={g.mastered}
                inReview={g.inReview}
                label={`${g.pattern} progress`}
                className="col-span-2 h-2 sm:order-2 sm:col-span-1"
              />
              <span className="hidden text-right text-sm text-muted sm:order-4 sm:block">
                {g.due > 0 ? `${g.due} due` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
