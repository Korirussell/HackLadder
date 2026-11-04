"""
HackLadder mark: a slanted H drawn as a two-rung ladder; the top rung is signal pink.
Edit this generator, never the SVGs.   python mark.py

Construction (100-unit grid, before the 12° forward skew around the centre):
  rails   19 wide x 84 tall, x=20 and x=61, corner radius 3
  rungs   24 wide x 12 tall, tucked 1 unit into each rail
  top rung y=24 (pink), crossbar y=54 (ink). Rails overrun both rungs, which makes it a ladder.
"""
import math
from pathlib import Path

# The Sakura palette (§15 2026-10-29): deep-purple ink, lavender paper, pink signal.
INK, PAPER, SIGNAL = "#1B1530", "#ECE8FA", "#FF3D7F"
SKEW = 12


def glyph(rail, top, cross):
    t = math.tan(math.radians(SKEW)) * 50
    return (f'<g transform="translate({t:.3f} 0) skewX(-{SKEW})">'
            f'<rect x="20" y="8" width="19" height="84" rx="3" fill="{rail}"/>'
            f'<rect x="61" y="8" width="19" height="84" rx="3" fill="{rail}"/>'
            f'<rect x="38" y="54" width="24" height="12" fill="{cross}"/>'
            f'<rect x="38" y="24" width="24" height="12" fill="{top}"/>'
            f'</g>')


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{body}</svg>'


def contained(shape, bg, rail, top, cross, scale=0.6):
    o = 50 * (1 - scale)
    back = (f'<circle cx="50" cy="50" r="50" fill="{bg}"/>' if shape == "circle"
            else f'<rect width="100" height="100" rx="22.5" fill="{bg}"/>')
    return back + f'<g transform="translate({o} {o}) scale({scale})">{glyph(rail, top, cross)}</g>'


FILES = {
    "mark":            glyph(INK, SIGNAL, INK),                              # primary
    "mark-mono":       glyph(INK, INK, INK),                                 # one colour (print, embossing)
    "mark-reverse":    glyph(PAPER, SIGNAL, PAPER),                          # on dark backgrounds
    "avatar-ink":      contained("circle", INK, PAPER, SIGNAL, PAPER),       # social avatar, GitHub-style
    "avatar-signal":   contained("circle", SIGNAL, PAPER, INK, PAPER),       # social avatar, Pinterest-style
    "app-icon":        contained("square", INK, PAPER, SIGNAL, PAPER, 0.62), # iOS/Android/PWA
    "favicon":         contained("square", INK, PAPER, SIGNAL, PAPER, 0.74), # bigger glyph for 16px
}

if __name__ == "__main__":
    here = Path(__file__).parent
    for name, body in FILES.items():
        (here / f"{name}.svg").write_text(svg(body))
    print("wrote", ", ".join(FILES))
