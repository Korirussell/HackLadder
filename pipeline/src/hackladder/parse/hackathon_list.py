"""Devpost hackathon list API: ``GET https://devpost.com/api/hackathons?...``."""

from __future__ import annotations

import json
from typing import Any

from hackladder.parse.common import host_of, parse_date_range, parse_usd
from hackladder.parse.models import HackathonListPage, HackathonMeta


def _registrations(value: Any) -> int | None:
    """Devpost occasionally serves nonsense here (seen: -6); treat it as unknown."""
    return value if isinstance(value, int) and value >= 0 else None


def _meta(h: dict[str, Any]) -> HackathonMeta:
    loc = h.get("displayed_location") or {}
    location = (loc.get("location") or "").strip() or None
    starts_on, ends_on = parse_date_range(h.get("submission_period_dates"))
    url = h["url"]
    return HackathonMeta(
        source_id=str(h["id"]),
        slug=host_of(url).split(".")[0],
        title=h["title"].strip(),
        url=url,
        organization=(h.get("organization_name") or "").strip() or None,
        location=location,
        is_online=loc.get("icon") == "globe" or (location or "").lower() == "online",
        starts_on=starts_on,
        ends_on=ends_on,
        registrations=_registrations(h.get("registrations_count")),
        prize_total_usd=parse_usd(h.get("prize_amount")),
        themes=tuple(t["name"] for t in h.get("themes") or ()),
        winners_announced=bool(h.get("winners_announced")),
        invite_only=bool(h.get("invite_only")),
        open_state=h.get("open_state") or "",
    )


def parse_hackathon_list(payload: str) -> HackathonListPage:
    """Parse one page of the list API's JSON response."""
    data = json.loads(payload)
    meta = data.get("meta") or {}
    return HackathonListPage(
        hackathons=tuple(_meta(h) for h in data.get("hackathons") or ()),
        total_count=int(meta.get("total_count") or 0),
        per_page=int(meta.get("per_page") or 0),
    )
