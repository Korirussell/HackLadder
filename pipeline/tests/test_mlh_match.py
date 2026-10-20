from __future__ import annotations

from datetime import date

import pytest

from hackladder.mlh_match import DevpostRow, MlhRow, match_all, match_one, name_match, normalize


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


def test_contained_name_within_a_day_is_auto_but_further_off_is_suggested() -> None:
    near = match_one(mlh("Berkeley Cal Hacks Fall Showcase", date(2024, 10, 19)), FIELD)
    assert (near.hackathon_id, near.status) == (10, "auto")
    far = match_one(mlh("Berkeley Cal Hacks Fall Showcase", date(2024, 10, 17)), FIELD)
    assert (far.hackathon_id, far.status) == (10, "suggested")


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


@pytest.mark.parametrize(
    ("mlh_name", "devpost_title", "expected"),
    [
        ("HackSMU V", "HackSMU V", "exact"),
        ("Local Hack Day: Learn (2022)", "Local Hack Day: Learn 2022", "exact"),
        ("MadHacks", "MadHacks Fall 2023", "contains"),
        ("Sheridan Hackville", "Hackville", "contains"),
        # Only generic words in common: "fall" doesn't identify an event.
        ("305 HACKATHON | FALL EDITION", "STEM Connect Hackathon Fall 2025", "fuzzy"),
        ("SheHacks", "SF Hacks 2022", "fuzzy"),
    ],
)
def test_name_match(mlh_name: str, devpost_title: str, expected: str) -> None:
    d = dev(devpost_title, "unrelated-slug", OCT_20, 1)
    assert name_match(mlh(mlh_name, OCT_20, slug="other-slug"), d) == expected


def test_a_unique_exact_name_is_auto_despite_a_close_runner_up() -> None:
    field = [dev("HackCMU 2023", "hackcmu-2023", OCT_20, 30), dev("HackSMU V", "hacksmu-v", OCT_20, 31)]
    d = match_one(mlh("HackSMU V", OCT_20), field)
    assert (d.hackathon_id, d.status) == (31, "auto")


def test_decisions_carry_the_top_candidates() -> None:
    field = [
        dev("MadHacks Fall 2023", "madhacks-fall-2023", OCT_20, 40),
        dev("MadHacks Spring", "madhacks-spring", date(2024, 10, 22), 41),
        dev("MathHacks", "mathhacks", date(2024, 10, 19), 42),
        dev("Unrelated Jam", "unrelated-jam", OCT_20, 43),
        dev("MadHacks", "madhacks", date(2024, 11, 20), 44),  # a month away: not a candidate
    ]
    d = match_one(mlh("MadHacks", OCT_20), field)
    assert d.status == "suggested"
    assert [c.hackathon_id for c in d.candidates] == [40, 41, 42]
    best = d.candidates[0]
    assert (best.slug, best.days, best.name_match) == ("madhacks-fall-2023", 0, "contains")
    assert d.candidates[1].days == 2


def test_unmatched_events_still_list_nearby_events() -> None:
    d = match_one(mlh("Quiet Event", OCT_20), [dev("Loud Jam", "loud-jam", OCT_20, 50)])
    assert d.status == "unmatched"
    assert [c.slug for c in d.candidates] == ["loud-jam"]
