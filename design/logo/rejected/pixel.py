"""
Pixel H-ladder generator. Shapes are drawn as filled wood, then outlined automatically,
so every variant gets a clean 1px dark outline like a game sprite.

    python pixel.py            # writes pixel-*.svg next to this file
"""
from pathlib import Path

PAL = {
    "o": "#2B1A0E",  # outline
    "d": "#6B4423",  # wood shadow
    "m": "#9C6533",  # wood mid
    "l": "#C88A4A",  # wood light
    "h": "#E9B46C",  # wood highlight
    "S": "#C93F0A",  # signal shadow
    "s": "#FF5B14",  # signal
    "y": "#FFA05C",  # signal highlight
}
N = 16


def blank():
    return [["." for _ in range(N)] for _ in range(N)]


def rail(g, x0, y0, y1, slant=0):
    """3-wide vertical plank: highlight, mid, shadow."""
    for y in range(y0, y1 + 1):
        dx = (N - 1 - y) // slant if slant else 0
        for i, c in enumerate("hmd"):
            g[y][x0 + i + dx] = c


def rung(g, x0, x1, y0, h, kind="wood", slant=0):
    """Horizontal plank between rails. Top row lit, bottom row shaded."""
    rows = {1: ["l"], 2: ["h", "d"], 3: ["h", "m", "d"]}[h]
    if kind == "signal":
        rows = {1: ["s"], 2: ["y", "S"], 3: ["y", "s", "S"]}[h]
    for j, c in enumerate(rows):
        y = y0 + j
        dx = (N - 1 - y) // slant if slant else 0
        for x in range(x0, x1 + 1):
            g[y][x + dx] = c


def outside(g):
    """Empty pixels reachable from the border. Enclosed gaps between rungs are not outside."""
    seen, stack = set(), [(y, x) for y in range(N) for x in (0, N - 1)] + [(y, x) for x in range(N) for y in (0, N - 1)]
    while stack:
        y, x = stack.pop()
        if (y, x) in seen or not (0 <= y < N and 0 <= x < N) or g[y][x] != ".":
            continue
        seen.add((y, x))
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    return seen


def outline(g):
    """Outline only the silhouette, so the gaps between rungs stay open like a real sprite."""
    out = [row[:] for row in g]
    ext = outside(g)
    for y in range(N):
        for x in range(N):
            if (y, x) not in ext:
                continue
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < N and 0 <= xx < N and g[yy][xx] != ".":
                    out[y][x] = "o"
                    break
    return out


def svg(g, bg=None):
    rects = []
    if bg:
        rects.append(f'<rect width="{N}" height="{N}" rx="3.5" fill="{bg}"/>')
    for y, row in enumerate(g):
        x = 0
        while x < N:
            c = row[x]
            if c == ".":
                x += 1
                continue
            run = 1
            while x + run < N and row[x + run] == c:
                run += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="{PAL[c]}"/>')
            x += run
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" '
            f'shape-rendering="crispEdges">{"".join(rects)}</svg>')


def variant(name):
    g = blank()
    if name == "classic":           # straight; thick H crossbar, thinner rungs above and below
        rail(g, 2, 1, 14); rail(g, 11, 1, 14)
        rung(g, 5, 10, 3, 2); rung(g, 5, 10, 7, 3); rung(g, 5, 10, 12, 2)
    elif name == "lit":             # same, top rung is the orange "top of the ladder"
        rail(g, 2, 1, 14); rail(g, 11, 1, 14)
        rung(g, 5, 10, 3, 2, "signal"); rung(g, 5, 10, 7, 3); rung(g, 5, 10, 12, 2)
    elif name == "lean":            # leans forward one pixel every 4 rows
        rail(g, 1, 1, 14, slant=4); rail(g, 10, 1, 14, slant=4)
        rung(g, 4, 9, 3, 2, "signal", slant=4); rung(g, 4, 9, 7, 3, slant=4); rung(g, 4, 9, 12, 2, slant=4)
    elif name == "bigh":            # H first: orange cap rung, fat crossbar, open legs below
        rail(g, 2, 1, 14); rail(g, 11, 1, 14)
        rung(g, 5, 10, 3, 2, "signal"); rung(g, 5, 10, 7, 3)
    return outline(g)


if __name__ == "__main__":
    here = Path(__file__).parent
    for v in ("classic", "lit", "lean", "bigh"):
        (here / f"pixel-{v}.svg").write_text(svg(variant(v)))
        (here / f"pixel-{v}-app.svg").write_text(svg(variant(v), bg="#17140F"))
    print("wrote", sorted(p.name for p in here.glob("pixel-*.svg")))
