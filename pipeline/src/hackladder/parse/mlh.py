"""MLH season schedule: ``https://mlh.io/seasons/<year>/events?page=N``.

The page is an Inertia.js app: every event is in the JSON inside
``<script type="application/json" data-page="app">``, 24 per page, newest first.
A page past the end has no events, which is how a crawler knows to stop.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup

from hackladder.parse.common import ParseError
from hackladder.parse.models import MlhEvent, MlhSeasonPage

HIGH_SCHOOL_MARKER = "High School Students Only"


def _when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _event(e: dict[str, Any]) -> MlhEvent:
    underserved = tuple((e.get("customFields") or {}).get("underserved_types") or ())
    venue = e.get("venueAddress") or {}
    return MlhEvent(
        source_id=e["id"],
        slug=e["slug"],
        name=e["name"].strip(),
        starts_at=_when(e["startsAt"]),
        ends_at=_when(e["endsAt"]),
        format=e["formatType"],
        location=(e.get("location") or "").strip() or None,
        country=venue.get("country"),
        website_url=e.get("websiteUrl"),
        is_high_school=HIGH_SCHOOL_MARKER in underserved,
        underserved_types=underserved,
    )


def parse_mlh_season(html: str) -> MlhSeasonPage:
    script = BeautifulSoup(html, "html.parser").select_one('script[type="application/json"][data-page="app"]')
    if script is None or not script.string:
        raise ParseError("no Inertia page data (script[data-page=app])")
    page = json.loads(script.string)
    if page.get("component") != "SeasonEvents/Index":
        raise ParseError(f"not an MLH season page: component {page.get('component')!r}")
    props = page["props"]
    events: dict[str, MlhEvent] = {}
    for raw in [*props.get("upcomingEvents", []), *props.get("pastEvents", [])]:
        event = _event(raw)
        events.setdefault(event.source_id, event)
    return MlhSeasonPage(season=str(props["seriesName"]), events=tuple(events.values()))
