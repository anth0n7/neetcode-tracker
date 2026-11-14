"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DifficultyLabel } from "../ui/pills";
import type { ProblemRow } from "@/lib/queries";
import {
  attemptRequest,
  dueCount,
  hideRow,
  RATING_BUTTONS,
  ratingFromKey,
  showRow,
  undoRequest,
  visibleRows,
  type Rating,
} from "@/lib/today-list";

const UNDO_MS = 5000;

type Toast = { problemId: number; attemptId: number; title: string };

function overdueLabel(days: number): string {
  if (days <= 0) return "Due today";
  return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

export function TodayList({ items, solved, problems }: { items: ProblemRow[]; solved: number; problems: number }) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = visibleRows(items, hidden, showAll);
  const due = dueCount(items, hidden);

  const clearToastTimer = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  };

  const rate = useCallback(async (item: ProblemRow, rating: Rating) => {
    setError(null);
    setHidden((h) => hideRow(h, item.id));
    try {
      const { url, init } = attemptRequest(item.id, rating);
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { attemptId } = (await response.json()) as { attemptId: number };
      clearToastTimer();
      setToast({ problemId: item.id, attemptId, title: item.title });
      toastTimer.current = setTimeout(() => setToast(null), UNDO_MS);
    } catch {
      setHidden((h) => showRow(h, item.id));
      setError(`Could not save "${item.title}". It is back in the list.`);
    }
  }, []);

  const undo = async () => {
    if (!toast) return;
    const current = toast;
    clearToastTimer();
    setToast(null);
    setError(null);
    try {
      const { url, init } = undoRequest(current.problemId, current.attemptId);
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setHidden((h) => showRow(h, current.problemId));
    } catch {
      setError(`Could not undo "${current.title}". The attempt is still logged.`);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const rating = ratingFromKey(e);
      if (!rating || rows.length === 0) return;
      e.preventDefault();
      void rate(rows[0], rating);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rows, rate]);

  useEffect(() => clearToastTimer, []);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-muted">
            {due === 0 ? "You're all caught up" : `${due} ${due === 1 ? "problem" : "problems"} to review`}
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted">
          <span className="font-medium text-ink">{solved}</span> / {problems} solved
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {due === 0 ? (
        <div className="card px-6 py-14 text-center">
          {solved === 0 ? (
            <>
              <p className="font-medium">Nothing to review yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Log your first attempt from the Problems page, and it will come back here when it is due.
              </p>
              <Link href="/" className="btn btn-primary mt-5">
                Browse problems
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium">Nothing due today</p>
              <p className="mt-1 text-sm text-muted">Come back tomorrow, or practice something new.</p>
              <Link href="/" className="btn mt-5">
                Browse problems
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((item) => (
            <li key={item.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/problems/${item.id}`} className="font-semibold tracking-tight hover:text-accent">
                    {item.title}
                  </Link>{" "}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${item.title} on NeetCode`}
                    className="text-xs text-muted/60 transition-colors hover:text-accent"
                  >
                    ↗
                  </a>
                  <p className="mt-1 flex items-center gap-3 text-sm text-muted">
                    <span>{item.pattern}</span>
                    <DifficultyLabel difficulty={item.difficulty} />
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                  {overdueLabel(item.daysOverdue)}
                </span>
              </div>

              {item.insight &&
                (revealed.has(item.id) ? (
                  <p className="mt-4 whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2.5 text-sm">{item.insight}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevealed((r) => new Set(r).add(item.id))}
                    className="mt-4 text-sm font-medium text-accent hover:underline"
                  >
                    Reveal insight
                  </button>
                ))}

              <div className="mt-5 grid grid-cols-3 gap-2">
                {RATING_BUTTONS.map((b) => (
                  <button key={b.rating} type="button" onClick={() => void rate(item, b.rating)} className="btn py-2.5">
                    {b.label} <kbd className="kbd">{b.key}</kbd>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showAll && due > rows.length && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-sm font-medium text-accent hover:underline">
          Show all {due}
        </button>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-ink px-4 py-3 text-sm text-canvas shadow-lg"
        >
          <span>Logged &quot;{toast.title}&quot;</span>
          <button type="button" onClick={() => void undo()} className="font-semibold underline underline-offset-2">
            Undo
          </button>
        </div>
      )}
    </main>
  );
}
