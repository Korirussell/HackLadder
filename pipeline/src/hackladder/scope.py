"""Which events may appear at all (CLAUDE.md §9.1, the minors rule).

High-school events are excluded entirely. This is the keyword half of the rule; MLH's
"High School Students Only" flag is the other half (applied when MLH events are matched).
When in doubt, exclude: a false positive hides one event, a false negative can expose minors.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

_HIGH_SCHOOL = re.compile(
    r"\bhigh[\s-]?schools?\b|\bhs\b|\bmiddle[\s-]?schools?\b|\bsecondary\b|\bteens?\b|\bteenagers?\b"
    r"|\bk-?12\b|\bjunior high\b|\bunder[\s-]?18\b|\bhs hacks\b|\bhshacks\b",
    re.IGNORECASE,
)


def looks_high_school(title: str, *, themes: Iterable[str] = (), organization: str | None = None) -> bool:
    """True if the title, themes or organizer suggest a high-school or younger event."""
    text = " | ".join([title, organization or "", *themes])
    return _HIGH_SCHOOL.search(text) is not None
