"use client";

import { MessagePage } from "./ui/message-page";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  // In production builds the server hides the real message; the digest matches the server log entry.
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <MessagePage
      title="Something went wrong loading this page"
      actions={
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
      }
    >
      <p>Your data has not been changed.</p>
      {digest && (
        <p className="mt-3 text-xs text-muted/80">
          Error ID <span className="font-mono">{digest}</span>. The full error is in the server log under this ID.
        </p>
      )}
    </MessagePage>
  );
}
