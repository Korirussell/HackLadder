from __future__ import annotations

import pytest

from hackladder.scope import looks_high_school


@pytest.mark.parametrize(
    "title",
    [
        "Teens Take On COVID",  # seen in a real project's "Submitted to" list (§6.6)
        "HSHacks 2024",
        "Bay Area High School Hackathon",
        "Hack the Middle School",
        "Secondary Students Hack Week",
        "K-12 Code Jam",
        "Teen Hacks LA",
        "Under 18 Innovation Challenge",
    ],
)
def test_high_school_titles(title: str) -> None:
    assert looks_high_school(title)


@pytest.mark.parametrize(
    "title",
    [
        "TreeHacks 2024",
        "HackMIT",
        "Hack the North",
        "Central Hacks",
        "SchoolHacks for Universities",
        "Highschoolers",
    ],
)
def test_college_and_open_titles(title: str) -> None:
    # "Highschoolers" isn't a word boundary match; one-word mashups are caught by MLH's flag or an admin.
    assert not looks_high_school(title)


def test_themes_and_organizer_count_too() -> None:
    assert looks_high_school("Spring Jam", themes=["Beginner Friendly", "High School"])
    assert looks_high_school("Spring Jam", organization="Lincoln Middle School")
    assert not looks_high_school("Spring Jam", themes=["Beginner Friendly"], organization="Stanford")
