import Link from "next/link";
import { connection } from "next/server";
import { groupByPattern } from "@/lib/pattern-groups";
import { parseFilterParams } from "@/lib/problem-filters";
import { listProblems } from "@/lib/queries";
import { todayLocal } from "@/lib/today";
import { ProblemsTable } from "./problems-table";
import { ProgressBar } from "./ui/progress-bar";

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const today = todayLocal();
  const rows = await listProblems({}, today);
  const groups = groupByPattern(rows);
  const patterns = groups.map((g) => g.pattern);
  const initialFilters = parseFilterParams(await searchParams, patterns);

  const totals = groups.reduce(
    (t, g) => ({
      total: t.total + g.total,
      solved: t.solved + g.solved,
      inReview: t.inReview + g.inReview,
      mastered: t.mastered + g.mastered,
      due: t.due + g.due,
    }),
    { total: 0, solved: 0, inReview: 0, mastered: 0, due: 0 },
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <section className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-8">
        <div>
          <p className="text-3xl font-semibold tracking-tight">
            {totals.solved}
            <span className="text-muted"> / {totals.total}</span>
          </p>
          <p className="text-sm text-muted">problems solved</p>
        </div>
        <div className="flex-1">
          <ProgressBar
            total={totals.total}
            mastered={totals.mastered}
            inReview={totals.inReview}
            label="Overall progress"
            className="h-2"
          />
          <p className="mt-2 flex gap-4 text-xs text-muted">
            <span>
              <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-accent" />
              {totals.mastered} mastered
            </span>
            <span>
              <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-accent/40" />
              {totals.inReview} in review
            </span>
          </p>
        </div>
        <Link
          href="/today"
          className={`btn ${totals.due > 0 ? "btn-primary" : ""}`}
        >
          {totals.due > 0 ? `${totals.due} due today` : "Nothing due"} <span aria-hidden>→</span>
        </Link>
      </section>

      <ProblemsTable groups={groups} patterns={patterns} initialFilters={initialFilters} today={today} />
    </main>
  );
}
