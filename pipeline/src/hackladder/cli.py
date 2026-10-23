"""``hl``: the HackLadder pipeline CLI (§14)."""

from __future__ import annotations

import csv
import json
import logging
import os
import sys
from collections.abc import Iterator
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Annotated, Any

import psycopg
import typer

from hackladder import db
from hackladder.config import load_rating_config, seed_prize_rules
from hackladder.crawl.cache import CachedFetcher, iter_cached_pages
from hackladder.crawl.check import CheckedProject, CheckReport, normalize_event_url, run_check
from hackladder.crawl.events import crawl_events
from hackladder.crawl.http import PoliteClient
from hackladder.crawl.listing import crawl_list, search_mlh_events
from hackladder.mlh import apply_matches, crawl_mlh_seasons
from hackladder.parse import ParseError, ProjectPage, parse_project
from hackladder.parse.common import host_of
from hackladder.prizes import CONFIG_PATH, TierConfig, TierConfigError, load_tier_config, review
from hackladder.rate.run import run_ratings
from hackladder.schools import DEFAULT_FILE as SCHOOLS_FILE
from hackladder.schools import load_schools, read_schools

app = typer.Typer(no_args_is_help=True, add_completion=False, help="HackLadder data pipeline.")

DEFAULT_CACHE = Path(".cache/raw")
CacheDir = Annotated[Path, typer.Option(help="Raw page cache directory.")]
TiersFile = Annotated[Path, typer.Option("--tiers", help="Prize tier config.")]


@app.callback()
def _main(verbose: Annotated[bool, typer.Option("--verbose", "-v")] = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    # httpx logs every request at INFO; our client logs what matters (robots, retries).
    logging.getLogger("httpx").setLevel(logging.DEBUG if verbose else logging.WARNING)


def _load_tiers(path: Path) -> TierConfig:
    try:
        return load_tier_config(path)
    except TierConfigError as exc:
        raise typer.BadParameter(f"{path}: {exc}", param_hint="--tiers") from exc


def _print_project(p: CheckedProject, tiers: TierConfig, event: str) -> None:
    if p.page is None:
        typer.echo(f"  {p.entry.slug}: FAILED ({p.error})")
        return
    members = ", ".join(m.username or f"<{m.kind}>" for m in p.page.members)
    prizes = "; ".join(f"[{tiers.tier(name, event)}] {name}" for name in p.page.prizes_at_this_event)
    line = f"  {p.entry.slug}: {members}"
    if prizes:
        line += f"  WON {prizes}"
    if len(p.page.submissions) > 1:
        line += f"  (submitted to {len(p.page.submissions)} events)"
    typer.echo(line)


def _print_summary(r: CheckReport, tiers: TierConfig) -> None:
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
    counts = r.tier_counts(tiers)
    typer.echo(f"  gallery pages: {r.gallery_pages}, projects: {len(r.projects)}, parsed: {len(parsed)}")
    badges = sum(e.is_winner for e, _ in parsed)
    typer.echo(f"  projects with prizes here: {len(winners)}, gallery winner badges: {badges}")
    typer.echo("  prizes by tier: " + ", ".join(f"{t}: {counts[t]}" for t in sorted(counts)))
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
    cache_dir: CacheDir = DEFAULT_CACHE,
    tiers_file: TiersFile = CONFIG_PATH,
    quiet: Annotated[bool, typer.Option("--quiet", "-q", help="Summary only.")] = False,
) -> None:
    """Crawl and parse one event verbosely, to verify the parsers against live Devpost."""
    try:
        url = normalize_event_url(event_url)
    except ValueError as exc:
        raise typer.BadParameter(str(exc)) from exc
    tiers = _load_tiers(tiers_file)
    event = host_of(url).split(".")[0]

    with PoliteClient() as client:
        client.load_robots()
        fetcher = CachedFetcher(client, cache_dir)
        report = run_check(
            fetcher, url, limit=limit, on_project=None if quiet else lambda p: _print_project(p, tiers, event)
        )
        _print_summary(report, tiers)
        typer.echo(f"  requests: {client.requests_made}, cache hits: {fetcher.hits}")
    failed = sum(p.page is None for p in report.projects)
    if failed or not report.projects:
        raise typer.Exit(code=1)


def _cached_projects(cache_dir: Path) -> Iterator[ProjectPage]:
    for html in iter_cached_pages(cache_dir):
        if 'id="app-title"' not in html:
            continue  # galleries, user pages, API responses
        try:
            yield parse_project(html, hackathon_host="")
        except ParseError:
            continue


@app.command()
def prizes(
    *,
    cache_dir: CacheDir = DEFAULT_CACHE,
    tiers_file: TiersFile = CONFIG_PATH,
    default_only: Annotated[
        bool, typer.Option("--default", help="Only names no rule matched (they get default_tier).")
    ] = False,
    tier: Annotated[int | None, typer.Option(help="Only this tier.")] = None,
    event: Annotated[str | None, typer.Option(help="Only this event (Devpost subdomain).")] = None,
    csv_path: Annotated[Path | None, typer.Option("--csv", help="Also write the rows to a CSV file.")] = None,
) -> None:
    """Show how every cached prize name is tiered, to review config/prize_tiers.toml. No requests."""
    tiers = _load_tiers(tiers_file)
    rows = [
        r
        for r in review(_cached_projects(cache_dir), tiers)
        if (not default_only or r.decision.is_default)
        and (tier is None or r.decision.tier == tier)
        and (event is None or r.event == event.lower())
    ]
    current = None
    for r in rows:
        if r.decision.tier != current:
            current = r.decision.tier
            typer.echo(f"\nTier {current}: {tiers.labels.get(current, '')}")
        typer.echo(f"  {r.decision.reason:<36} {r.event:<28} x{r.projects:<3} {r.prize}")
    typer.echo(
        f"\n{len(rows)} prize names; {sum(r.decision.is_default for r in rows)} fell to the default tier."
    )

    if csv_path:
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["tier", "decided_by", "event", "projects", "prize"])
            w.writerows([r.decision.tier, r.decision.reason, r.event, r.projects, r.prize] for r in rows)
        typer.echo(f"wrote {csv_path}")


def main() -> None:
    app()


config_app = typer.Typer(no_args_is_help=True, help="The admin-editable rating config in Postgres (§8.7).")
app.add_typer(config_app, name="config")


def _connect() -> psycopg.Connection[Any]:
    try:
        return db.connect()
    except db.DatabaseConfigError as exc:
        raise typer.BadParameter(str(exc), param_hint="DATABASE_URL") from exc


@config_app.command("seed")
def config_seed(
    tiers_file: TiersFile = CONFIG_PATH,
    replace: Annotated[bool, typer.Option(help="Replace existing prize rules (overrides are kept).")] = False,
) -> None:
    """Load the default prize tier rules into the database, if it has none yet."""
    with _connect() as conn:
        written = seed_prize_rules(conn, tiers_file, replace=replace)
    if written:
        typer.echo(f"wrote {written} prize tier rules from {tiers_file}")
    else:
        typer.echo("prize tier rules already exist; nothing written (use --replace to overwrite)")


@config_app.command("show")
def config_show() -> None:
    """Print the config the next rating run would use."""
    with _connect() as conn:
        config = load_rating_config(conn)
    typer.echo(
        json.dumps(config.snapshot() | {"rated_hackathon_ids": len(config.rated_hackathon_ids)}, indent=2)
    )


schools_app = typer.Typer(no_args_is_help=True, help="The school list owners pick from on /me (§16).")
app.add_typer(schools_app, name="schools")


@schools_app.command("load")
def schools_load(
    schools_file: Annotated[
        Path, typer.Option("--file", help="JSON list of {name, country, code}.")
    ] = SCHOOLS_FILE,
) -> None:
    """Add the universities the database doesn't have yet (safe to rerun)."""
    schools = read_schools(schools_file)
    with _connect() as conn:
        added = load_schools(conn, schools)
    typer.echo(f"{added} schools added ({len(schools)} in {schools_file.name}; the rest were already there).")


crawl_app = typer.Typer(no_args_is_help=True, help="Fetch pages from Devpost politely (§6.2) and load them.")
app.add_typer(crawl_app, name="crawl")
mlh_app = typer.Typer(no_args_is_help=True, help="MLH member events: crawl seasons, match them to Devpost.")
app.add_typer(mlh_app, name="mlh")


@crawl_app.command("list")
def crawl_list_command(
    incremental: Annotated[
        bool, typer.Option(help="Stop once a whole page ended more than --settle-days ago (weekly runs).")
    ] = False,
    settle_days: Annotated[int, typer.Option(help="Incremental cutoff: events this old have settled.")] = 60,
    max_pages: Annotated[int | None, typer.Option(help="Stop after this many pages.")] = None,
    restart: Annotated[
        bool, typer.Option(help="Ignore the checkpoint and start a full crawl at page 1.")
    ] = False,
    cache_dir: CacheDir = DEFAULT_CACHE,
) -> None:
    """Load the Devpost hackathon list into `hackathons` (about 1,550 pages for a full crawl)."""
    with _connect() as conn, PoliteClient() as client:
        client.load_robots()
        with db.pipeline_run(conn, "crawl list" + (" --incremental" if incremental else "")) as stats:
            result = crawl_list(
                client, conn, cache_dir,
                mode="incremental" if incremental else "full",
                cutoff=date.today() - timedelta(days=settle_days) if incremental else None,
                max_pages=max_pages, restart=restart,
            )  # fmt: skip
            # Paging the deadline order can skip events (§6.6), so look up recent MLH events by name.
            found = (
                search_mlh_events(client, conn, cache_dir, since=date.today() - timedelta(days=settle_days))
                if incremental
                else None
            )
            stats.pages_fetched = client.requests_made
            stats.events_added = result.inserted + (found.inserted if found else 0)
            stats.summary = {**asdict(result), **({"mlh_search": asdict(found)} if found else {})}
    typer.echo(
        f"pages {result.first_page}-{result.first_page + max(result.pages - 1, 0)}:"
        f" {result.hackathons} hackathons ({result.inserted} new, {result.updated} updated)."
        f" Stopped: {result.stopped}."
    )
    if found:
        typer.echo(
            f"searched {found.searched} recent MLH events by name: {found.inserted} new hackathons"
            f" ({found.failed} searches failed)."
        )


@mlh_app.command("crawl")
def mlh_crawl_command(
    first_season: Annotated[int, typer.Option(help="Oldest MLH season to fetch.")] = 2015,
    last_season: Annotated[int | None, typer.Option(help="Newest season (default: next year's).")] = None,
    cache_dir: CacheDir = DEFAULT_CACHE,
) -> None:
    """Fetch every MLH season schedule into `mlh_events` (about 10 pages per season)."""
    last = last_season or date.today().year + 1
    with _connect() as conn, PoliteClient() as client, db.pipeline_run(conn, "mlh crawl") as stats:
        result = crawl_mlh_seasons(client, conn, cache_dir, range(first_season, last + 1))
        stats.pages_fetched = client.requests_made
        stats.failures = len(result.failures)
        stats.summary = asdict(result)
    for season, n in sorted(result.events_by_season.items()):
        typer.echo(f"  season {season}: {n} events")
    typer.echo(f"{sum(result.events_by_season.values())} MLH events from {result.pages} pages.")
    for failure in result.failures:
        typer.echo(f"  failed: {failure}")


@mlh_app.command("match")
def mlh_match_command() -> None:
    """Match MLH events to Devpost hackathons; uncertain ones go to /admin/mlh for review."""
    with _connect() as conn, db.pipeline_run(conn, "mlh match") as stats:
        counts = apply_matches(conn)
        stats.summary = dict(counts)
    typer.echo(
        ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())) or "no MLH events yet; run `hl mlh crawl`"
    )


@crawl_app.command("events")
def crawl_events_command(
    slug: Annotated[list[str] | None, typer.Option(help="Only these events (Devpost subdomains).")] = None,
    limit: Annotated[int | None, typer.Option(help="Stop after this many events.")] = None,
    cache_dir: CacheDir = DEFAULT_CACHE,
) -> None:
    """Crawl galleries and project pages for in-scope events, newest first (resumable)."""
    with _connect() as conn, PoliteClient() as client:
        client.load_robots()
        tiers = load_rating_config(conn).prize_tiers
        with db.pipeline_run(conn, "crawl events") as stats:
            fetcher = CachedFetcher(client, cache_dir)
            result = crawl_events(fetcher, conn, tiers, slugs=slug, limit=limit)
            stats.pages_fetched = client.requests_made
            stats.failures = len(result.failures)
            stats.summary = asdict(result)
    typer.echo(
        f"{result.events} events, {result.projects} projects loaded; {result.skipped} already done;"
        f" {len(result.failures)} failed; {client.requests_made} requests, {fetcher.hits} cache hits."
    )
    for failure in result.failures:
        typer.echo(f"  failed: {failure}")


def _github_output(**values: object) -> None:
    """Step outputs for GitHub Actions (e.g. skip revalidating when nothing was published)."""
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.writelines(f"{k}={str(v).lower()}\n" for k, v in values.items())


@app.command()
def rate(
    if_changed: Annotated[
        bool, typer.Option(help="Skip (and don't publish) when nothing changed since the last run.")
    ] = False,
) -> None:
    """Rebuild all ratings from scratch with the current config and publish them."""
    with _connect() as conn:
        summary = run_ratings(conn, if_changed=if_changed)
    _github_output(published=summary is not None)
    if summary is None:
        typer.echo("Nothing changed since the last published run; skipped.")
        return
    typer.echo(
        f"Rated {summary.people} people ({summary.ranked} ranked) across {summary.events} events;"
        f" {summary.series} series, {summary.crews} crews; event noise {summary.noise:.2f}."
    )
