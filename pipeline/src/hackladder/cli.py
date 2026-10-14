"""``hl``: the HackLadder pipeline CLI (§14)."""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Annotated

import typer

from hackladder.crawl.cache import CachedFetcher
from hackladder.crawl.check import CheckedProject, CheckReport, normalize_event_url, run_check
from hackladder.crawl.http import PoliteClient

app = typer.Typer(no_args_is_help=True, add_completion=False, help="HackLadder data pipeline.")

DEFAULT_CACHE = Path(".cache/raw")


@app.callback()
def _main(verbose: Annotated[bool, typer.Option("--verbose", "-v")] = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    # httpx logs every request at INFO; our client logs what matters (robots, retries).
    logging.getLogger("httpx").setLevel(logging.DEBUG if verbose else logging.WARNING)


def _print_project(p: CheckedProject) -> None:
    if p.page is None:
        typer.echo(f"  {p.entry.slug}: FAILED ({p.error})")
        return
    members = ", ".join(m.username or f"<{m.kind}>" for m in p.page.members)
    prizes = "; ".join(f"[{pr.tier}] {pr.name}" for pr in p.page.prizes_at_this_event)
    line = f"  {p.entry.slug}: {members}"
    if prizes:
        line += f"  WON {prizes}"
    if len(p.page.submissions) > 1:
        line += f"  (submitted to {len(p.page.submissions)} events)"
    typer.echo(line)


def _print_summary(r: CheckReport) -> None:
    m = r.meta
    typer.echo("")
    if m:
        typer.echo(f"{m.title} ({m.url})")
        typer.echo(
            f"  ends {m.ends_on}, {m.registrations} registrations, "
            f"{'online' if m.is_online else m.location}, winners announced: {m.winners_announced}"
        )
    parsed = r.parsed
    winners = [page for _, page in parsed if page.prizes_at_this_event]
    tiers = r.tier_counts()
    typer.echo(f"  gallery pages: {r.gallery_pages}, projects: {len(r.projects)}, parsed: {len(parsed)}")
    badges = sum(e.is_winner for e, _ in parsed)
    typer.echo(f"  projects with prizes here: {len(winners)}, gallery winner badges: {badges}")
    typer.echo("  prizes by tier: " + ", ".join(f"{t}: {tiers[t]}" for t in sorted(tiers)))
    typer.echo("  team sizes: " + ", ".join(f"{k}: {v}" for k, v in sorted(r.team_sizes().items())))
    typer.echo(f"  distinct hackers: {len(r.hackers())}")
    anonymous = sum(m.is_anonymous for _, page in parsed for m in page.members)
    typer.echo(f"  anonymous (private or deleted) members: {anonymous}")
    typer.echo(f"  submitted to other events too: {sum(len(page.submissions) > 1 for _, page in parsed)}")
    typer.echo(f"  warnings: {len(r.warnings)}")
    for w in r.warnings:
        typer.echo(f"    - {w}")


@app.command()
def check(
    event_url: Annotated[str, typer.Argument(help="e.g. https://treehacks-2024.devpost.com/")],
    limit: Annotated[int | None, typer.Option(help="Only check the first N projects.")] = None,
    cache_dir: Annotated[Path, typer.Option(help="Raw page cache directory.")] = DEFAULT_CACHE,
    quiet: Annotated[bool, typer.Option("--quiet", "-q", help="Summary only.")] = False,
) -> None:
    """Crawl and parse one event verbosely, to verify the parsers against live Devpost."""
    try:
        url = normalize_event_url(event_url)
    except ValueError as exc:
        raise typer.BadParameter(str(exc)) from exc

    with PoliteClient() as client:
        client.load_robots()
        fetcher = CachedFetcher(client, cache_dir)
        report = run_check(fetcher, url, limit=limit, on_project=None if quiet else _print_project)
        _print_summary(report)
        typer.echo(f"  requests: {client.requests_made}, cache hits: {fetcher.hits}")
    failed = sum(p.page is None for p in report.projects)
    if failed or not report.projects:
        raise typer.Exit(code=1)


def main() -> None:
    app()
