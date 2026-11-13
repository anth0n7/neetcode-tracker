"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {due} due · {solved} / {problems} solved
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {due === 0 ? (
        solved === 0 ? (
          <div className="py-16 text-center text-zinc-600 dark:text-zinc-400">
            <p>Nothing to review yet.</p>
            <p className="mt-1">
              Log your first attempt from the{" "}
              <Link href="/" className="underline underline-offset-2">
                Problems page
              </Link>{" "}
              and it will come back here when it is due.
            </p>
          </div>
        ) : (
          <p className="py-16 text-center text-zinc-600 dark:text-zinc-400">Nothing due today</p>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((item) => (
            <li key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-baseline justify-between gap-3">
                <a href={item.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
                  {item.title}
                </a>
                <span className="shrink-0 text-xs text-zinc-600 dark:text-zinc-400">{overdueLabel(item.daysOverdue)}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {item.pattern} · {item.difficulty}
              </p>

              {item.insight &&
                (revealed.has(item.id) ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm">{item.insight}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevealed((r) => new Set(r).add(item.id))}
                    className="mt-3 text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                  >
                    Reveal insight
                  </button>
                ))}

              <div className="mt-4 grid grid-cols-3 gap-2">
                {RATING_BUTTONS.map((b) => (
                  <button
                    key={b.rating}
                    type="button"
                    onClick={() => void rate(item, b.rating)}
                    className="rounded-md border border-zinc-300 px-3 py-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    {b.label} <kbd className="ml-1 text-xs text-zinc-500">{b.key}</kbd>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showAll && due > rows.length && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-sm underline underline-offset-2">
          Show all {due}
        </button>
      )}

      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          <span>Logged &quot;{toast.title}&quot;</span>
          <button type="button" onClick={() => void undo()} className="font-semibold underline underline-offset-2">
            Undo
          </button>
        </div>
      )}
    </main>
  );
}
