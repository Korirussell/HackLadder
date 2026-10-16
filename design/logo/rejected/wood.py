"""
Vector wooden H-ladder. Edit this generator, not the SVGs.

    python wood.py      # writes wood-*.svg next to this file
"""
from pathlib import Path

C = dict(outline="#2B1A0E", shadow="#7A4B24", wood="#A86B35", light="#C98C4C",
         hi="#E9B46C", signal="#FF5B14", signal_hi="#FFA05C", signal_sh="#C93F0A", nail="#3B2414")
SW = 4  # outline stroke width (viewBox 100)


def rail(x, y, w, h):
    r = w * 0.32
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{C["wood"]}"/>'
            f'<rect x="{x+3}" y="{y+4}" width="{w*0.26}" height="{h-8}" rx="{w*0.13}" fill="{C["hi"]}"/>'
            f'<rect x="{x+w-3-w*0.22}" y="{y+4}" width="{w*0.22}" height="{h-8}" rx="{w*0.11}" fill="{C["shadow"]}"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" stroke="{C["outline"]}" stroke-width="{SW}"/>')


def rung(x, y, w, h, signal=False):
    base, hi, sh = ((C["signal"], C["signal_hi"], C["signal_sh"]) if signal
                    else (C["light"], C["hi"], C["shadow"]))
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h*0.3}" fill="{base}"/>'
            f'<rect x="{x+2}" y="{y+2}" width="{w-4}" height="{h*0.28}" rx="{h*0.14}" fill="{hi}"/>'
            f'<rect x="{x+2}" y="{y+h-2-h*0.24}" width="{w-4}" height="{h*0.24}" rx="{h*0.12}" fill="{sh}"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h*0.3}" fill="none" stroke="{C["outline"]}" stroke-width="{SW}"/>')


def nail(cx, cy, r=2.6):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{C["nail"]}"/>'


def ladder(slant=0, bg=None, nails=True):
    # Rails 22 wide x 88 tall; crossbar (the H) centred; orange cap rung near the top; open legs below.
    L, R, W, T, H = 10, 68, 22, 6, 88
    inner_x, inner_w = L + W - 4, R - (L + W) + 8          # rungs tuck under the rails
    parts = [rung(inner_x, 42, inner_w, 18), rung(inner_x, 16, inner_w, 13, signal=True),
             rail(L, T, W, H), rail(R, T, W, H)]
    if nails:
        for cy in (51, 22.5):
            parts += [nail(L + W / 2, cy), nail(R + W / 2, cy)]
    g = "".join(parts)
    if slant:
        import math
        t = math.tan(math.radians(slant)) * 50            # skew about the vertical centre, then shrink to fit
        g = f'<g transform="translate(50 50) scale(.9) translate(-50 -50) translate({t:.2f} 0) skewX({-slant})">{g}</g>'
    if bg:
        g = f'<rect width="100" height="100" rx="22" fill="{bg}"/><g transform="translate(15 15) scale(.7)">{g}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{g}</svg>'


if __name__ == "__main__":
    here = Path(__file__).parent
    for name, kw in {"wood": {}, "wood-slant": {"slant": 9}, "wood-plain": {"nails": False}}.items():
        (here / f"{name}.svg").write_text(ladder(**kw))
        (here / f"{name}-app.svg").write_text(ladder(bg="#17140F", **kw))
    print("ok")
