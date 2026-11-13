"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { undoRequest } from "@/lib/today-list";

export function DeleteAttemptButton({ problemId, attemptId }: { problemId: number; attemptId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!window.confirm("Delete this attempt? The schedule is recalculated without it. To bring it back you would have to log it again.")) return;
    setBusy(true);
    setError(null);
    try {
      const { url, init } = undoRequest(problemId, attemptId);
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      router.refresh();
    } catch (e) {
      setError(`Could not delete: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="text-xs text-muted transition-colors hover:text-danger disabled:opacity-50"
      >
        Delete
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
