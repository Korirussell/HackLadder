from __future__ import annotations

import pytest
from conftest import FIXTURES, read_fixture

from hackladder.parse import Member, ParseError, ProjectPage, parse_project

TREEHACKS = "treehacks-2024.devpost.com"
SHARE = "share.devpost.com"


def project(slug: str, host: str = TREEHACKS) -> ProjectPage:
    return parse_project(read_fixture(f"project/{slug}.html"), host)


def test_winner_with_grand_and_sponsor_prizes() -> None:
    p = project("baymax-your-personal-healthcare-companion")
    assert p.slug == "baymax-your-personal-healthcare-companion"
    assert p.title == "Baymax, Your Personal Healthcare Companion"
    assert p.tagline is not None
    assert p.tagline.startswith("Our AI-powered robot arm")
    # Display names come from the name link, not the avatar link (the prototype got usernames).
    assert p.members == (
        Member("aaravwattal", "Aarav Wattal"),
        Member("krishparikh", "Krish Parikh"),
        Member("jamesc27", "James Yu-tang Chen"),
        Member("jaykhem", "Jay Khemchandani"),
    )
    assert p.prizes_at_this_event == (
        "Grand Prize ($10k Cash)",
        "Reazon Holdings: Best Senior-Focused Hack (4x Round Trip Tickets to Tokyo)",
    )
    assert len(p.submissions) == 1
    assert p.submissions[0].hackathon_title == "TreeHacks 2024"
    assert p.submissions[0].hackathon_url == "https://treehacks-2024.devpost.com/"
    assert p.built_with[:3] == ("dynamixel-sdk", "google-mediapipe", "matplotlib")
    assert len(p.built_with) == 13
    assert p.description_text.startswith("Inspiration\n40 million people")


def test_prize_names_are_kept_raw() -> None:
    p = project("vision-mama-llm-vision-pro-agents-fun-learning")
    # Raw names, reward text and all: tiers are derived later from config/prize_tiers.toml.
    assert len(p.prizes_at_this_event) == 2
    assert "[1st]" in p.prizes_at_this_event[1]


def test_track_grand_prize() -> None:
    p = project("lingua-franca-6xovi3")
    assert p.prizes_at_this_event == ("Education Grand Prize (4x Quest 3)",)
    assert len(p.members) == 4


def test_solo_winner_with_non_ascii_name() -> None:
    p = project("dockerc")
    assert p.members == (Member("NilsIrl", "Nils Andr\N{LATIN SMALL LETTER E WITH ACUTE}"),)
    assert p.prizes_at_this_event == (
        "Most Technically Complex Hack (4x Mac Mini)",
        "Bun: Best Use of Zig (4x iPad Pro + Interview with Bun Founder)",
    )
    assert p.built_with == ("zig",)


def test_raffle_prize() -> None:
    p = project("test-project-skqc27")
    assert p.members == (Member("lmoberly", "Luke McLeod Moberly"),)
    assert p.prizes_at_this_event == ("Workshop Raffle Prizes ($10k in Prizes)",)


def test_private_member_keeps_their_seat() -> None:
    p = project("spot-my-good-boy")
    assert p.prizes_at_this_event == ()
    assert p.members[0] == Member(None, None, kind="private")
    assert p.members[0].is_anonymous
    assert [m.username for m in p.members[1:]] == ["yonigoz", "josselin545", "akouhana"]


def test_deleted_member() -> None:
    p = project("palate-pals")
    assert p.members == (Member(None, None, kind="deleted"),)
    assert p.prizes_at_this_event == ()


def test_five_member_team_with_two_accounts_of_the_same_name() -> None:
    p = project("shamify")
    assert [m.username for m in p.members] == [
        "sanchez-adrianacs",
        "JennyPng",
        "sazwu",
        "hellenzhao",
        "as2758",
    ]
    # Same display name, different accounts: entity resolution's problem, not the parser's (§7.5).
    assert p.members[0].display_name == p.members[4].display_name == "Adriana Sanchez"
    assert p.prizes_at_this_event == ()


def test_multi_event_project_takes_prizes_only_from_this_event() -> None:
    p = project("sequoia-tgnryh", SHARE)
    assert len(p.submissions) == 12
    assert p.prizes_at_this_event == ("Best Project Demo on Devpost",)
    won_elsewhere = [s for s in p.submissions if s.prizes and "share.devpost.com" not in s.hackathon_url]
    assert {s.hackathon_title for s in won_elsewhere} == {"COVID-19 Global Hackathon 1.0", "HackAtHome"}
    assert len(p.members) == 6


def test_multi_event_project_that_won_only_elsewhere() -> None:
    p = project("locavid", SHARE)
    assert len(p.submissions) == 5
    assert p.prizes_at_this_event == ()
    skyhacks = next(s for s in p.submissions if s.hackathon_title == "SkyHacks 2020")
    assert skyhacks.prizes


def test_prizes_for_an_event_the_project_was_not_submitted_to() -> None:
    assert (
        project(
            "baymax-your-personal-healthcare-companion", "treehacks-2025.devpost.com"
        ).prizes_at_this_event
        == ()
    )


def test_host_match_is_exact_not_substring() -> None:
    # A substring match (the prototype's a[href*=host]) would wrongly accept this host.
    assert (
        project("baymax-your-personal-healthcare-companion", "hacks-2024.devpost.com").prizes_at_this_event
        == ()
    )


def test_every_project_fixture_parses_completely() -> None:
    hosts = {"sequoia-tgnryh": SHARE, "locavid": SHARE}

    for path in sorted((FIXTURES / "project").glob("*.html")):
        p = parse_project(path.read_text(encoding="utf-8"), hosts.get(path.stem, TREEHACKS))
        assert p.slug == path.stem
        assert p.title
        assert p.members
        assert p.submissions
        assert p.description_text
        assert all(m.username or m.is_anonymous for m in p.members)
        assert all(m.display_name and m.display_name != "" for m in p.members if not m.is_anonymous)


# Unexpected structure raises instead of producing silently wrong data. These are
# minimal synthetic snippets for the error paths, not stand-ins for real pages.
def test_non_project_page_raises() -> None:
    with pytest.raises(ParseError, match="not a project page"):
        parse_project(read_fixture("user/aaravwattal.html"), TREEHACKS)


@pytest.mark.parametrize(
    ("snippet", "message"),
    [
        (
            '<section id="app-team"><li class="software-team-member"><span>Mystery</span></li></section>',
            "team member without a profile link",
        ),
        (
            '<div id="submissions"><ul class="software-list-with-thumbnail"><li>Gone</li></ul></div>',
            "without an event link",
        ),
    ],
)
def test_unknown_markup_raises(snippet: str, message: str) -> None:
    with pytest.raises(ParseError, match=message):
        parse_project(f'<h1 id="app-title">X</h1>{snippet}', TREEHACKS)


def test_member_without_a_name_shows_their_username() -> None:
    html = (
        '<h1 id="app-title">X</h1><section id="app-team"><li class="software-team-member">'
        '<a class="user-profile-link" href="https://devpost.com/jdoe"></a></li></section>'
    )
    assert parse_project(html, TREEHACKS).members == (Member("jdoe", "jdoe"),)
