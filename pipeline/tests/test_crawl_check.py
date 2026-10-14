from __future__ import annotations

import json

import pytest
from conftest import read_fixture

from hackladder.crawl.check import normalize_event_url, run_check
from hackladder.crawl.http import FetchFailedError, FetchResult


class FixtureFetcher:
    """Serves saved fixtures by URL; anything else is a 404."""

    def __init__(self, pages: dict[str, str], failing: frozenset[str] = frozenset()) -> None:
        self.pages = pages
        self.failing = failing
        self.requested: list[str] = []

    def get(self, url: str) -> FetchResult:
        self.requested.append(url)
        if url in self.failing:
            raise FetchFailedError(url, 503, "HTTP 503", 4)
        text = self.pages.get(url)
        return FetchResult(url=url, status=200 if text is not None else 404, text=text or "", fetched_at=0.0)


def list_api_with(url: str) -> str:
    # Built from the real fixture, with one entry's URL pointed at the event under test.
    data = json.loads(read_fixture("list/ended_page1.json"))
    data["hackathons"][0]["url"] = url
    return json.dumps(data)


TREEHACKS = "https://treehacks-2024.devpost.com/"
BAYMAX = "https://devpost.com/software/baymax-your-personal-healthcare-companion"


def test_checks_gallery_and_projects() -> None:
    fetcher = FixtureFetcher(
        {
            "https://devpost.com/api/hackathons?search=treehacks-2024&status[]=ended": list_api_with(
                TREEHACKS
            ),
            f"{TREEHACKS}project-gallery?page=1": read_fixture("gallery/treehacks-2024_p1.html"),
            BAYMAX: read_fixture("project/baymax-your-personal-healthcare-companion.html"),
        }
    )
    report = run_check(fetcher, "https://treehacks-2024.devpost.com/project-gallery", limit=1)

    assert report.event_url == TREEHACKS
    assert report.meta is not None
    assert report.meta.url == TREEHACKS
    assert report.gallery_pages == 1  # limit reached on page 1, so page 2 is never requested
    assert f"{TREEHACKS}project-gallery?page=2" not in fetcher.requested
    [(entry, page)] = report.parsed
    assert entry.slug == page.slug == "baymax-your-personal-healthcare-companion"
    assert report.tier_counts() == {1: 1, 3: 1}
    assert report.team_sizes() == {4: 1}
    assert report.hackers() == {"aaravwattal", "krishparikh", "jamesc27", "jaykhem"}
    assert report.warnings == []


def test_reports_anomalies_and_failures() -> None:
    small = "https://cathacks-xii.devpost.com/"
    fetcher = FixtureFetcher(
        {f"{small}project-gallery?page=1": read_fixture("gallery/cathacks-xii_p1.html")},
        failing=frozenset({"https://devpost.com/software/nora-3gdjy6"}),
    )
    report = run_check(fetcher, small)

    assert report.meta is None
    assert report.gallery_pages == 1
    assert len(report.projects) == 11
    assert report.parsed == []  # every project page is a 404 or failure in this fake
    assert any("not found in the list API" in w for w in report.warnings)
    assert any(w.startswith("nora-3gdjy6:") and "503" in w for w in report.warnings)
    assert sum("HTTP 404" in w for w in report.warnings) == 10


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://treehacks-2024.devpost.com/", TREEHACKS),
        ("treehacks-2024.devpost.com/project-gallery?page=3", TREEHACKS),
        ("http://TreeHacks-2024.devpost.com", TREEHACKS),
    ],
)
def test_normalize_event_url(raw: str, expected: str) -> None:
    assert normalize_event_url(raw) == expected


@pytest.mark.parametrize(
    "raw", ["https://devpost.com/software/dockerc", "https://example.com/", "www.devpost.com"]
)
def test_normalize_event_url_rejects_non_events(raw: str) -> None:
    with pytest.raises(ValueError, match="hackathon URL"):
        normalize_event_url(raw)


def test_flags_disagreements_between_gallery_and_project_page() -> None:
    # The real TreeHacks gallery page lists baymax as a 4-member winner; pair that entry with
    # other real project pages that disagree with it, and with a duplicate listing.
    gallery = read_fixture("gallery/treehacks-2024_p1.html")
    baymax_item = gallery.split('<div class="large-4 small-12 columns gallery-item"')[1]
    page = gallery.replace(
        baymax_item, baymax_item + '<div class="large-4 small-12 columns gallery-item"' + baymax_item
    )
    fetcher = FixtureFetcher(
        {
            f"{TREEHACKS}project-gallery?page=1": page,
            BAYMAX: read_fixture("project/palate-pals.html"),
        }
    )
    report = run_check(fetcher, TREEHACKS, limit=2)
    w = "\n".join(report.warnings)
    assert "gallery winner=True but project page has 0 prize(s)" in w
    assert (
        "gallery shows ['aaravwattal', 'krishparikh', 'jamesc27', 'jaykhem'] but the project page doesn't"
        in w
    )
    assert "gallery implies 4 members, project page lists 1" in w
    assert "canonical slug is 'palate-pals'" in w
    assert "listed twice in the gallery" in w


def test_project_page_that_fails_to_parse_is_reported() -> None:
    fetcher = FixtureFetcher(
        {
            f"{TREEHACKS}project-gallery?page=1": read_fixture("gallery/treehacks-2024_p1.html"),
            BAYMAX: read_fixture("user/aaravwattal.html"),
        }
    )
    report = run_check(fetcher, TREEHACKS, limit=1)
    assert report.projects[0].error == "parse error: not a project page: no #app-title"


def test_gallery_http_error_stops_paging() -> None:
    report = run_check(FixtureFetcher({}), TREEHACKS)
    assert report.gallery_pages == 0
    assert "gallery page 1: HTTP 404" in report.warnings
