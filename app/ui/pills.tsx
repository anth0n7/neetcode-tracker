const DIFFICULTY_DOT: Record<string, string> = {
  Easy: "bg-easy",
  Medium: "bg-medium",
  Hard: "bg-hard",
};

const STATUS_STYLE: Record<string, string> = {
  unsolved: "bg-subtle text-muted",
  "in review": "bg-accent-soft text-accent",
  mastered: "bg-mastered-soft text-mastered",
};

const STATUS_LABEL: Record<string, string> = {
  unsolved: "New",
  "in review": "In review",
  mastered: "Mastered",
};

export function DifficultyLabel({ difficulty }: { difficulty: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden className={`size-1.5 rounded-full ${DIFFICULTY_DOT[difficulty] ?? "bg-muted"}`} />
      {difficulty}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? "bg-subtle text-muted"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
