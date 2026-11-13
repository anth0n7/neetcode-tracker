"use client";

import Link from "next/link";
import { useState } from "react";
import { DIFFICULTIES, filterProblems, STATUSES, toSearchString, type ProblemFilters } from "@/lib/problem-filters";
import type { ProblemRow } from "@/lib/queries";

const control =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function ProblemsTable({
  rows,
  patterns,
  initialFilters,
}: {
  rows: ProblemRow[];
  patterns: string[];
  initialFilters: ProblemFilters;
}) {
  const [filters, setFilters] = useState<ProblemFilters>(initialFilters);

  const update = (change: ProblemFilters) => {
    const next = { ...filters, ...change };
    setFilters(next);
    window.history.replaceState(null, "", `${window.location.pathname}${toSearchString(next)}`);
  };

  const shown = filterProblems(rows, filters);
  const filtered = toSearchString(filters) !== "";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Problems</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {shown.length} of {rows.length}
        </p>
      </header>

      <div className="mb-6 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <input
          type="search"
          aria-label="Search by title"
          placeholder="Search by title"
          value={filters.q ?? ""}
          onChange={(e) => update({ q: e.target.value })}
          className={control}
        />
        <select aria-label="Pattern" value={filters.pattern ?? ""} onChange={(e) => update({ pattern: e.target.value })} className={control}>
          <option value="">All patterns</option>
          {patterns.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Difficulty" value={filters.difficulty ?? ""} onChange={(e) => update({ difficulty: e.target.value })} className={control}>
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select aria-label="Status" value={filters.status ?? ""} onChange={(e) => update({ status: e.target.value })} className={control}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {filtered && (
        <button
          type="button"
          onClick={() => {
            setFilters({});
            window.history.replaceState(null, "", window.location.pathname);
          }}
          className="mb-4 text-sm underline underline-offset-2"
        >
          Clear filters
        </button>
      )}

      {shown.length === 0 ? (
        <p className="py-16 text-center text-zinc-600 dark:text-zinc-400">No problems match</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-600 dark:text-zinc-400">
            <tr>
              <th className="py-2 pr-3 font-medium">Problem</th>
              <th className="py-2 pr-3 font-medium">Pattern</th>
              <th className="py-2 pr-3 font-medium">Difficulty</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Next review</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2 pr-3">
                  <Link href={`/problems/${p.id}`} className="font-medium underline-offset-2 hover:underline">
                    {p.title}
                  </Link>{" "}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${p.title} on NeetCode`}
                    className="text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    ↗
                  </a>
                </td>
                <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">{p.pattern}</td>
                <td className="py-2 pr-3">{p.difficulty}</td>
                <td className="py-2 pr-3">{p.status}</td>
                <td className="py-2">{p.nextReview ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
