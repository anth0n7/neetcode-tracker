export function ProgressBar({
  total,
  mastered,
  inReview,
  label,
  className = "",
}: {
  total: number;
  mastered: number;
  inReview: number;
  label: string;
  className?: string;
}) {
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={mastered + inReview}
      className={`flex h-1.5 overflow-hidden rounded-full bg-subtle ${className}`}
    >
      <div className="h-full bg-accent" style={{ width: `${pct(mastered)}%` }} />
      <div className="h-full bg-accent/40" style={{ width: `${pct(inReview)}%` }} />
    </div>
  );
}
