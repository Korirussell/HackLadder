from __future__ import annotations

from datetime import date

import pytest

from hackladder.mlh_match import DevpostRow, MlhRow, match_all, match_one, normalize


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Cal Hacks 11.0", "cal hacks"),
        ("HackPrinceton Fall 2024", "hackprinceton fall"),
        ("PennApps XXV", "pennapps"),
        ("HackGT 11", "hackgt"),
        ("hackgt-11", "hackgt"),
        ("Hack@Brown 2025", "hack brown"),
        ("nwHacks 2025", "nwhacks"),
        ("The 5th Annual Hackathon at Sample U", "at sample u"),
        ("Montréal Hacks '24", "montreal hacks"),
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert normalize(raw) == expected


def mlh(name: str, ends: date, slug: str = "", website: str | None = None, id_: int = 1) -> MlhRow:
    return MlhRow(
        id=id_, name=name, slug=slug or name.lower().replace(" ", "-"), ends_on=ends, website_url=website
    )


def dev(title: str, slug: str, ends: date | None, id_: int) -> DevpostRow:
    return DevpostRow(id=id_, title=title, slug=slug, ends_on=ends)


OCT_20 = date(2024, 10, 20)
FIELD = [
    dev("Cal Hacks 11.0", "cal-hacks-11", date(2024, 10, 20), 10),
    dev("HackGT 11", "hackgt-11", date(2024, 9, 29), 11),
    dev("Some Online Jam", "some-online-jam", date(2024, 10, 21), 12),
    dev("Cal Hacks 10.0", "calhacks10", date(2023, 10, 29), 13),
]


def test_same_name_same_weekend_is_auto() -> None:
    d = match_one(mlh("Cal Hacks 11.0", OCT_20), FIELD)
    assert (d.hackathon_id, d.status) == (10, "auto")


def test_last_years_edition_is_not_a_candidate() -> None:
    d = match_one(mlh("Cal Hacks 12.0", date(2025, 10, 26)), FIELD)
    assert d.status == "unmatched"
    assert d.hackathon_id is None


def test_mlh_linking_to_devpost_is_exact() -> None:
    d = match_one(
        mlh("Completely Different Name", OCT_20, website="https://some-online-jam.devpost.com/"), FIELD
    )
    assert (d.hackathon_id, d.score, d.status) == (12, 1.0, "auto")


def test_partial_name_is_suggested_not_auto() -> None:
    d = match_one(mlh("Berkeley Cal Hacks Fall Showcase", date(2024, 10, 19)), FIELD)
    assert d.status == "suggested"
    assert d.hackathon_id == 10


def test_two_close_candidates_need_review() -> None:
    twins = [dev("TigerHacks", "tigerhacks-2024", OCT_20, 20), dev("TigerHacks", "tiger-hacks", OCT_20, 21)]
    d = match_one(mlh("TigerHacks 2024", OCT_20), twins)
    assert d.status == "suggested"
    assert "runner-up" in d.note


def test_dates_more_than_three_days_apart_dont_match() -> None:
    d = match_one(mlh("HackGT 11", date(2024, 10, 6)), FIELD)
    assert d.status == "unmatched"


def test_match_all_uses_neighbouring_weeks() -> None:
    events = [mlh("Cal Hacks 11.0", date(2024, 10, 21), id_=1), mlh("HackGT 11", date(2024, 9, 28), id_=2)]
    decisions = {d.mlh_event_id: d for d in match_all(events, FIELD)}
    assert decisions[1].hackathon_id == 10
    assert decisions[2].hackathon_id == 11
