"""Save real Devpost pages as parser test fixtures (CLAUDE.md §2, §13 Phase 1).

    uv run python scripts/fetch_fixtures.py            # fetch what's missing
    uv run python scripts/fetch_fixtures.py --refresh  # re-fetch everything

Fetches go through the polite client (§6.2) and the local raw cache, so re-runs are free.
Writes ``tests/fixtures/manifest.json`` recording each fixture's source URL, fetch date and hash.
Refreshing will change page content; fix parsers, not tests, if a refreshed fixture breaks one.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from hackladder.crawl.cache import CachedFetcher
from hackladder.crawl.http import PoliteClient

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"

# (fixture path, source URL, why it's here)
FIXTURE_SET: list[tuple[str, str, str]] = [
    (
        "list/ended_page1.json",
        "https://devpost.com/api/hackathons?status[]=ended&page=1",
        "list API page: invite-only and not-yet-announced events, all three date formats",
    ),
    (
        "gallery/treehacks-2024_p1.html",
        "https://treehacks-2024.devpost.com/project-gallery?page=1",
        "big gallery, first of 14 pages: all winners, has a next page",
    ),
    (
        "gallery/treehacks-2024_p14.html",
        "https://treehacks-2024.devpost.com/project-gallery?page=14",
        "multi-page gallery, last page: non-winners, a deleted member, next link disabled",
    ),
    (
        "gallery/cathacks-xii_p1.html",
        "https://cathacks-xii.devpost.com/project-gallery?page=1",
        "small gallery: one page, no pagination element at all",
    ),
    *(
        (f"project/{slug}.html", f"https://devpost.com/software/{slug}", why)
        for slug, why in [
            ("baymax-your-personal-healthcare-companion", "winner: grand prize + sponsor prize, 4 members"),
            ("vision-mama-llm-vision-pro-agents-fun-learning", "winner: sponsor prize with [1st] in reward"),
            ("lingua-franca-6xovi3", "winner: track 'Education Grand Prize'"),
            ("dockerc", "solo winner, two prizes, non-ASCII display name"),
            ("test-project-skqc27", "solo 'winner' of a workshop raffle"),
            ("spot-my-good-boy", "non-winner with a private-mode member"),
            ("palate-pals", "non-winner whose only member is a deleted account"),
            ("shamify", "non-winner, 5 members (gallery shows '+ 1')"),
            ("sequoia-tgnryh", "submitted to 12 events; won here (share.devpost.com) and elsewhere"),
            ("locavid", "submitted to 5 events; won elsewhere but not at share.devpost.com"),
        ]
    ),
    *(
        (f"user/{username}.html", f"https://devpost.com/{username}", why)
        for username, why in [
            ("aaravwattal", "bio and location set"),
            ("NilsIrl", "non-ASCII display name"),
            ("dylanjpaulson", "no display name set: Devpost shows the username"),
        ]
    ),
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-fetch fixtures that already exist")
    ap.add_argument("--cache-dir", type=Path, default=ROOT / ".cache" / "raw")
    args = ap.parse_args()

    manifest_path = FIXTURES / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else {}

    with PoliteClient() as client:
        fetcher = CachedFetcher(client, args.cache_dir)
        for rel, url, why in FIXTURE_SET:
            path = FIXTURES / rel
            if path.exists() and not args.refresh:
                continue
            # The list API changes every day, so it never comes from the cache.
            result = client.get(url) if rel.endswith(".json") else fetcher.get(url)
            if result.status != 200:
                raise SystemExit(f"{url}: HTTP {result.status}")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(result.text, encoding="utf-8", newline="")
            manifest[rel] = {
                "url": url,
                "why": why,
                "fetched_at": datetime.fromtimestamp(result.fetched_at, UTC).isoformat(timespec="seconds"),
                "sha256": hashlib.sha256(result.text.encode("utf-8")).hexdigest(),
            }
            print(f"saved {rel}")
        print(f"requests made: {client.requests_made}")

    manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
