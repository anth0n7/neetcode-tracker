"use client";

import Link from "next/link";
import { useState } from "react";
import { formatShortDate } from "@/lib/problem-detail";
import type { PatternGroup } from "@/lib/pattern-groups";
import { DIFFICULTIES, filterProblems, STATUSES, toSearchString, type ProblemFilters } from "@/lib/problem-filters";
import type { ProblemRow } from "@/lib/queries";
import { DifficultyLabel, StatusPill } from "./ui/pills";
import { ProgressBar } from "./ui/progress-bar";

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_5rem]";

export function ProblemsTable({
  groups,
  patterns,
  initialFilters,
  today,
}: {
  groups: PatternGroup<ProblemRow>[];
  patterns: string[];
  initialFilters: ProblemFilters;
  today: string;
}) {
  const [filters, setFilters] = useState<ProblemFilters>(initialFilters);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());

  const writeUrl = (next: ProblemFilters) =>
    window.history.replaceState(null, "", `${window.location.pathname}${toSearchString(next)}`);

  const update = (change: ProblemFilters) => {
    const next = { ...filters, ...change };
    setFilters(next);
    writeUrl(next);
  };

  const clear = () => {
    setFilters({});
    writeUrl({});
  };

  const toggle = (pattern: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(pattern)) next.add(pattern);
      return next;
    });

  const filtered = toSearchString(filters) !== "";
  const visible = groups
    .map((group) => ({ group, rows: filterProblems(group.rows, filters) }))
    .filter(({ rows }) => !filtered || rows.length > 0);
  const shown = visible.reduce((n, v) => n + v.rows.length, 0);

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="relative">
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" />
            </svg>
            <input
              type="search"
              aria-label="Search by title"
              placeholder="Search problems"
              value={filters.q ?? ""}
              onChange={(e) => update({ q: e.target.value })}
              className="field w-full pl-9"
            />
          </div>
          <select aria-label="Pattern" value={filters.pattern ?? ""} onChange={(e) => update({ pattern: e.target.value })} className="field">
            <option value="">All patterns</option>
            {patterns.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select aria-label="Difficulty" value={filters.difficulty ?? ""} onChange={(e) => update({ difficulty: e.target.value })} className="field">
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select aria-label="Status" value={filters.status ?? ""} onChange={(e) => update({ status: e.target.value })} className="field">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "unsolved" ? "New" : s === "in review" ? "In review" : "Mastered"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 mt-4 flex items-center justify-between text-sm text-muted">
        <p>
          {shown} {shown === 1 ? "problem" : "problems"}
        </p>
        {filtered ? (
          <button type="button" onClick={clear} className="font-medium text-accent hover:underline">
            Clear filters
          </button>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={() => setOpened(new Set(patterns))} className="hover:text-ink">
              Expand all
            </button>
            <button type="button" onClick={() => setOpened(new Set())} className="hover:text-ink">
              Collapse all
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card py-16 text-center text-muted">No problems match</div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(({ group, rows }, index) => {
            const open = filtered || opened.has(group.pattern);
            const panelId = `group-${index}`;
            return (
              <section key={group.pattern} className="card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggle(group.pattern)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-subtle"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m8 5 5 5-5 5" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate font-semibold tracking-tight">{group.pattern}</span>
                  {group.due > 0 && (
                    <span className="hidden rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent sm:inline">
                      {group.due} due
                    </span>
                  )}
                  {filtered && rows.length < group.total && (
                    <span className="hidden text-xs text-muted sm:inline">{rows.length} matching</span>
                  )}
                  <ProgressBar
                    total={group.total}
                    mastered={group.mastered}
                    inReview={group.inReview}
                    label={`${group.pattern} progress`}
                    className="hidden w-32 sm:flex"
                  />
                  <span className="w-12 text-right text-sm tabular-nums text-muted">
                    {group.solved} / {group.total}
                  </span>
                </button>

                {open && (
                  <div id={panelId} className="border-t border-line">
                    <div className={`${ROW_GRID} hidden px-4 py-2 text-[0.6875rem] font-medium uppercase tracking-wider text-muted sm:grid`}>
                      <span>Problem</span>
                      <span>Level</span>
                      <span>Status</span>
                      <span className="text-right">Next</span>
                    </div>
                    <ul>
                      {rows.map((p) => (
                        <li key={p.id} className={`${ROW_GRID} border-t border-line px-4 py-2.5 transition-colors first:border-t-0 hover:bg-subtle sm:first:border-t`}>
                          <div className="flex min-w-0 items-center gap-2">
                            <Link href={`/problems/${p.id}`} className="truncate font-medium hover:text-accent">
                              {p.title}
                            </Link>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${p.title} on NeetCode`}
                              className="shrink-0 text-xs text-muted/60 transition-colors hover:text-accent"
                            >
                              ↗
                            </a>
                          </div>
                          <div className="hidden sm:block">
                            <DifficultyLabel difficulty={p.difficulty} />
                          </div>
                          <div className="justify-self-end sm:justify-self-start">
                            <StatusPill status={p.status} />
                          </div>
                          <div className="hidden text-right text-sm tabular-nums sm:block">
                            {p.due ? (
                              <span className="font-medium text-accent">Due</span>
                            ) : p.nextReview ? (
                              <span className="text-muted">{formatShortDate(p.nextReview, today)}</span>
                            ) : (
                              <span className="text-muted/60">—</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
