// Geometry for the rating_history chart (§4.4): a line with an accent area fill, gridlines with
// labels, and the latest point marked. Server-rendered SVG, so the profile ships no chart JS.

export type ChartPoint = { ends_on: string | null; score: number };

export type Chart = {
  line: string;
  area: string;
  last: { x: number; y: number } | null;
  grid: { y: number; label: string }[];
  width: number;
  height: number;
};

const W = 600;
const H = 190;
const P = 18;

/** Round gridline values covering [lo, hi]: steps of 100, 250 or 500. */
function gridValues(lo: number, hi: number): number[] {
  const span = Math.max(hi - lo, 1);
  const step = span <= 300 ? 100 : span <= 900 ? 250 : 500;
  const values: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) values.push(v);
  return values;
}

/** Starts from the first event's score before (usually 1000), so one event still draws a line. */
export function ratingChart(points: ChartPoint[], start = 1000): Chart {
  const scores = [start, ...points.map((p) => p.score)];
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const pad = Math.max((hi - lo) * 0.12, 40);
  const min = lo - pad;
  const max = hi + pad;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(scores.length - 1, 1);
  const y = (v: number) => H - P - ((v - min) * (H - 2 * P)) / (max - min);
  const line = scores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const lastX = x(scores.length - 1);
  return {
    line,
    area: `${line}L${lastX.toFixed(1)} ${H - P}L${x(0).toFixed(1)} ${H - P}Z`,
    last: points.length ? { x: lastX, y: y(scores.at(-1)!) } : null,
    grid: gridValues(min, max).map((v) => ({ y: y(v), label: v.toLocaleString("en-US") })),
    width: W,
    height: H,
  };
}
