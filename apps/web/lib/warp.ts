// The warped-grid wallpaper (§4.3): a fisheye bulge drawn as thin vector lines, ported from
// design/reference.html. Returns SVG path data so it renders on the server or in the browser.

export function warpPaths(w: number, h: number, step: number, k: number): string[] {
  const cx = w / 2;
  const cy = h * 0.42;
  const R = Math.hypot(w, h) / 2;
  const bulge = (x: number, y: number): [number, number] => {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.min(Math.hypot(dx, dy) / R, 1);
    const s = 1 + k * (1 - r ** 2);
    return [cx + dx * s, cy + dy * s];
  };
  const line = (points: [number, number][]) =>
    points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const paths: string[] = [];
  for (let y = -step; y <= h + step; y += step) {
    const pts: [number, number][] = [];
    for (let x = -step; x <= w + step; x += step / 4) pts.push(bulge(x, y));
    paths.push(line(pts));
  }
  for (let x = -step; x <= w + step; x += step) {
    const pts: [number, number][] = [];
    for (let y = -step; y <= h + step; y += step / 4) pts.push(bulge(x, y));
    paths.push(line(pts));
  }
  return paths;
}

/** The small grid inside media-player screens, computed once. */
export const MINI_WARP = { width: 400, height: 200, paths: warpPaths(400, 200, 26, 0.35) };
