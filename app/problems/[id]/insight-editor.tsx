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
        className="field w-full"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || text.trim() === insight.trim()}
          className="btn"
        >
          Save insight
        </button>
        {message && (
          <span role="status" className="text-sm text-muted">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
