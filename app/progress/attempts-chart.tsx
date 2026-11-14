import type { DayAttempts } from "@/lib/queries";

const WIDTH = 330;
const BASELINE = 110;
const MAX_BAR = 80;
const SLOT = 46;
const BAR = 30;

function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

export function AttemptsChart({ days }: { days: DayAttempts[] }) {
  const peak = Math.max(1, ...days.map((d) => d.attempts));
  const summary = days.map((d) => `${weekday(d.date)} ${d.attempts}`).join(", ");
  return (
    <svg viewBox={`0 0 ${WIDTH} 135`} className="w-full" role="img" aria-label={`Attempts per day: ${summary}`}>
      {days.map((d, i) => {
        const height = d.attempts === 0 ? 2 : (d.attempts / peak) * MAX_BAR;
        const x = 20 + i * SLOT;
        const center = x + BAR / 2;
        return (
          <g key={d.date}>
            <rect x={x} y={BASELINE - height} width={BAR} height={height} rx="4" className="fill-accent" />
            <text x={center} y={BASELINE - height - 5} textAnchor="middle" fontSize="11" className="fill-ink">
              {d.attempts}
            </text>
            <text x={center} y="128" textAnchor="middle" fontSize="11" className="fill-muted">
              {weekday(d.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
