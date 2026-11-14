const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Arc({ share, offset, className }: { share: number; offset: number; className: string }) {
  if (share <= 0) return null;
  return (
    <circle
      cx="55"
      cy="55"
      r={RADIUS}
      fill="none"
      strokeWidth="12"
      className={className}
      strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
      strokeDashoffset={-offset * CIRCUMFERENCE}
      transform="rotate(-90 55 55)"
    />
  );
}

export function OverallDonut({ total, mastered, inReview }: { total: number; mastered: number; inReview: number }) {
  const share = (n: number) => (total === 0 ? 0 : n / total);
  const solved = mastered + inReview;
  return (
    <svg
      viewBox="0 0 110 110"
      className="size-28 shrink-0"
      role="img"
      aria-label={`${solved} of ${total} problems solved: ${mastered} mastered, ${inReview} in review`}
    >
      <circle cx="55" cy="55" r={RADIUS} fill="none" strokeWidth="12" className="stroke-subtle" />
      <Arc share={share(mastered)} offset={0} className="stroke-accent" />
      <Arc share={share(inReview)} offset={share(mastered)} className="stroke-accent/40" />
      <text x="55" y="60" textAnchor="middle" fontSize="17" fontWeight="600" className="fill-ink">
        {solved}/{total}
      </text>
    </svg>
  );
}
