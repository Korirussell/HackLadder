import { ratingChart, type ChartPoint } from "@/lib/chart";
import { isoDate, num } from "@/lib/format";

/** The rating line with an accent area and the latest point marked, plus a table alternative (§12). */
export function RatingChart({ points, name }: { points: (ChartPoint & { event: string })[]; name: string }) {
  const c = ratingChart(points);
  const first = points[0];
  const last = points.at(-1)!;
  const label = `${name}'s rating went from ${num(1000)} to ${num(last.score)} over ${points.length} rated events, ${isoDate(first.ends_on)} to ${isoDate(last.ends_on)}.`;
  return (
    <div className="px-3.5 pt-3.5 pb-1">
      <svg viewBox={`0 0 ${c.width} ${c.height}`} preserveAspectRatio="none" role="img" aria-label={label} className="block h-[190px] w-full">
        {c.grid.map((g) => (
          <g key={g.label}>
            <line x1={18} x2={c.width - 18} y1={g.y} y2={g.y} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={c.width - 18} y={g.y - 4} textAnchor="end" className="sys" fontSize={10} fill="var(--muted)">
              {g.label}
            </text>
          </g>
        ))}
        <path d={c.area} fill="color-mix(in srgb, var(--accent) 14%, transparent)" />
        <path d={c.line} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {c.last && <circle cx={c.last.x} cy={c.last.y} r={5} fill="var(--accent)" />}
      </svg>
      <details className="sys py-2 text-[11px] text-muted">
        <summary className="cursor-pointer hover:text-ink">show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-medium">date</th>
              <th className="py-1 font-medium">event</th>
              <th className="py-1 text-right font-medium">rating after</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1">{isoDate(p.ends_on)}</td>
                <td className="py-1">{p.event}</td>
                <td className="py-1 text-right">{num(p.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
