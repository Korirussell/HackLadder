from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from conftest import read_fixture

from hackladder.parse import ParseError, parse_mlh_season


def test_first_page_of_a_season() -> None:
    page = parse_mlh_season(read_fixture("mlh/season-2025_p1.html"))
    assert page.season == "2025"
    assert len(page.events) == 24
    newest = page.events[0]
    assert newest.name == "GDG Solution Hacks"
    assert newest.slug == "gdg-solution-hacks"
    assert newest.source_id == "0192491f-4c83-3e59-ca3a-fa764277666b"
    assert newest.starts_at == datetime(2025, 6, 27, 21, 0, tzinfo=UTC)
    assert newest.ends_at == datetime(2025, 6, 29, 19, 0, tzinfo=UTC)
    assert newest.format == "physical"
    assert newest.location == "Toronto, Canada"
    assert newest.country == "CA"
    assert newest.website_url == "https://thesolutionhacks.site/"
    assert not newest.is_high_school
    # Events are newest first.
    assert [e.starts_at for e in page.events] == sorted((e.starts_at for e in page.events), reverse=True)


def test_high_school_events_are_flagged() -> None:
    page = parse_mlh_season(read_fixture("mlh/season-2025_p1.html"))
    flagged = {e.slug for e in page.events if e.is_high_school}
    assert flagged == {"masseyhacks-03", "jamhacks-9"}
    jam = next(e for e in page.events if e.slug == "jamhacks-9")
    assert "High School Students Only" in jam.underserved_types


def test_online_events_have_no_venue() -> None:
    page = parse_mlh_season(read_fixture("mlh/season-2025_p1.html"))
    ghw = next(e for e in page.events if e.name == "Global Hack Week: GenAI")
    assert ghw.format == "digital"
    assert ghw.location == "Everywhere, Worldwide"
    assert ghw.country is None


def test_last_page_and_past_the_end() -> None:
    last = parse_mlh_season(read_fixture("mlh/season-2025_p9.html"))
    assert len(last.events) == 3
    assert last.events[-1].name == "Hack Your Portfolio"
    assert last.events[-1].starts_at.date().isoformat() == "2024-07-12"  # MLH seasons start in July
    assert parse_mlh_season(read_fixture("mlh/season-2025_p10.html")).events == ()


def test_current_season_repeats_upcoming_events_past_the_end() -> None:
    # The live season lists all upcoming events on every page, so a page past the end of the
    # past events isn't empty; it only repeats events the crawler has already seen.
    last = parse_mlh_season(read_fixture("mlh/season-2027_p3.html"))
    past_the_end = parse_mlh_season(read_fixture("mlh/season-2027_p4.html"))
    assert last.season == past_the_end.season == "2027"
    assert len(last.events) == 70  # 1 past event + 69 upcoming
    assert len(past_the_end.events) == 69
    assert {e.source_id for e in past_the_end.events} < {e.source_id for e in last.events}


def test_pre_2021_seasons_are_regional() -> None:
    na = parse_mlh_season(read_fixture("mlh/season-na-2020_p1.html"))
    eu = parse_mlh_season(read_fixture("mlh/season-eu-2020_p1.html"))
    assert (na.season, len(na.events)) == ("2020 NA", 24)
    assert (eu.season, len(eu.events)) == ("2020 Europe", 16)
    assert na.events[0].name == "HackTJ"
    assert eu.events[0].name == "Oxford Digithon"
    assert not {e.source_id for e in na.events} & {e.source_id for e in eu.events}


def _page(component: str, events: list[dict[str, object]]) -> str:
    props = {"seriesName": "2026", "upcomingEvents": events, "pastEvents": events}
    data = json.dumps({"component": component, "props": props})
    return f'<script type="application/json" data-page="app">{data}</script>'


def test_upcoming_and_past_lists_are_merged_without_duplicates() -> None:
    event: dict[str, object] = {
        "id": "e1", "slug": "x", "name": " X ", "startsAt": "2026-01-01T00:00:00Z",
        "endsAt": "2026-01-02T00:00:00Z", "formatType": "physical", "location": "",
        "venueAddress": None, "websiteUrl": None, "customFields": None,
    }  # fmt: skip
    page = parse_mlh_season(_page("SeasonEvents/Index", [event]))
    assert len(page.events) == 1
    assert page.events[0].name == "X"
    assert page.events[0].location is None


@pytest.mark.parametrize(
    ("html", "message"),
    [
        ("<html><body>Maintenance</body></html>", "no Inertia page data"),
        (_page("Events/Show", []), "not an MLH season page"),
    ],
)
def test_unexpected_pages_raise(html: str, message: str) -> None:
    with pytest.raises(ParseError, match=message):
        parse_mlh_season(html)
