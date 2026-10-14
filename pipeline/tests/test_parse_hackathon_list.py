from __future__ import annotations

from datetime import date

from conftest import read_fixture

from hackladder.parse import parse_hackathon_list


def test_page_meta() -> None:
    page = parse_hackathon_list(read_fixture("list/ended_page1.json"))
    assert page.per_page == 9
    assert page.total_count == 13889
    assert len(page.hackathons) == 9


def test_online_event() -> None:
    h = parse_hackathon_list(read_fixture("list/ended_page1.json")).hackathons[0]
    assert h.source_id == "30892"
    assert h.slug == "firstcommit"
    assert h.title == "Beginner's Paradise - FirstCommit"
    assert h.url == "https://firstcommit.devpost.com/"
    assert h.organization == "FirstCommit"
    assert h.is_online
    assert h.location == "Online"
    assert (h.starts_on, h.ends_on) == (date(2026, 8, 21), date(2026, 10, 2))
    assert h.registrations == 1420
    assert h.prize_total_usd == 1024
    assert h.themes == ("Beginner Friendly", "Mobile", "Web")
    assert not h.winners_announced
    assert not h.invite_only
    assert h.open_state == "ended"


def test_in_person_invite_only_event() -> None:
    hackathons = parse_hackathon_list(read_fixture("list/ended_page1.json")).hackathons
    h = next(h for h in hackathons if h.slug == "cmu-hackathon")
    assert h.title == "Central Hacks"
    assert not h.is_online
    assert h.location == "Central Michigan University Pearce Hall"
    assert h.invite_only
    assert h.winners_announced
    assert (h.starts_on, h.ends_on) == (date(2024, 4, 5), date(2024, 4, 6))
    assert h.prize_total_usd == 1500


def test_titles_are_stripped_and_every_date_parses() -> None:
    hackathons = parse_hackathon_list(read_fixture("list/ended_page1.json")).hackathons
    assert next(h for h in hackathons if h.slug == "all-you-can-do-with-ai").title == "All you can do with AI"
    assert all(h.starts_on and h.ends_on and h.starts_on <= h.ends_on for h in hackathons)


def test_empty_payload() -> None:
    page = parse_hackathon_list('{"hackathons": [], "meta": {"total_count": 0, "per_page": 9}}')
    assert page.hackathons == ()
