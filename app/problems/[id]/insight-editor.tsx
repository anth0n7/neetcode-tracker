"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { insightRequest } from "@/lib/problem-detail";

export function InsightEditor({ problemId, insight }: { problemId: number; insight: string }) {
  const router = useRouter();
  const [text, setText] = useState(insight);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { url, init } = insightRequest(problemId, text);
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      setMessage("Saved");
      router.refresh();
    } catch (error) {
      setMessage(`Could not save: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <textarea
        aria-label="Insight"
        value={text}
        maxLength={500}
        rows={3}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || text.trim() === insight.trim()}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium enabled:hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:enabled:hover:bg-zinc-900"
        >
          Save insight
        </button>
        {message && (
          <span role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
