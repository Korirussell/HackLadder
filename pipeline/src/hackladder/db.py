"""Database access shared by every pipeline step: connecting, run logging, the raw page index."""

from __future__ import annotations

import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

from hackladder.crawl.cache import url_hash

Connection = psycopg.Connection[Any]


class DatabaseConfigError(RuntimeError):
    pass


def connect(env_file: Path = Path(".env")) -> Connection:
    """Connect with DATABASE_URL (from the environment or pipeline/.env)."""
    load_dotenv(env_file)
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise DatabaseConfigError("DATABASE_URL is not set. Add it to pipeline/.env (see .env.example).")
    try:
        conn = psycopg.connect(url)
    except psycopg.OperationalError as exc:
        hint = ""
        if re.search(r"@db\.[a-z0-9]+\.supabase\.co", url):
            # Supabase's direct host is IPv6-only; most home and campus networks need the pooler.
            hint = (
                "\nThis is Supabase's direct connection, which only works over IPv6. Use the Session pooler"
                " string instead (Dashboard > Connect > Session pooler):"
                " postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
            )
        raise DatabaseConfigError(f"Couldn't connect to the database: {exc}{hint}") from exc
    # Supabase's default 2-minute limit is for web requests. When the disk is throttled (Disk IO
    # budget spent) even a one-row upsert can take longer, which failed a whole crawl (2026-10-24).
    conn.execute("set statement_timeout = '15min'")
    conn.commit()
    return conn


@dataclass
class RunStats:
    pages_fetched: int = 0
    failures: int = 0
    events_added: int = 0
    people_rated: int = 0
    summary: dict[str, Any] = field(default_factory=dict)


@contextmanager
def pipeline_run(conn: Connection, job: str) -> Iterator[RunStats]:
    """Record a run in pipeline_runs (§12): started, then succeeded or failed with its stats."""
    row = conn.execute("insert into public.pipeline_runs (job) values (%s) returning id", (job,)).fetchone()
    conn.commit()
    assert row is not None
    stats = RunStats()
    status = "failed"
    try:
        yield stats
        status = "succeeded"
    except BaseException as exc:
        conn.rollback()
        stats.summary["error"] = f"{type(exc).__name__}: {exc}"
        raise
    finally:
        conn.execute(
            "update public.pipeline_runs set finished_at = now(), status = %s, pages_fetched = %s,"
            " failures = %s, events_added = %s, people_rated = %s, summary = %s where id = %s",
            (status, stats.pages_fetched, stats.failures, stats.events_added, stats.people_rated,
             Jsonb(stats.summary), row[0]),
        )  # fmt: skip
        conn.commit()


def record_raw_page(conn: Connection, url: str, kind: str, status: int, storage_path: str | None) -> None:
    """Index a fetched page (§7.2). The page itself lives in the raw store at storage_path."""
    conn.execute(
        "insert into public.raw_pages_index (url_hash, url, kind, fetched_at, status, storage_path)"
        " values (%s, %s, %s, %s, %s, %s)"
        " on conflict (url_hash) do update set fetched_at = excluded.fetched_at, status = excluded.status,"
        " storage_path = excluded.storage_path",
        (url_hash(url), url, kind, datetime.now(UTC), status, storage_path),
    )


def record_failure(conn: Connection, url: str, kind: str, status: int | None, error: str) -> None:
    conn.execute(
        "insert into public.crawl_failures (url, kind, status, error) values (%s, %s, %s, %s)"
        " on conflict (url) do update set status = excluded.status, error = excluded.error,"
        " attempts = crawl_failures.attempts + 1, last_attempt_at = now()",
        (url, kind, status, error),
    )


def get_checkpoint(conn: Connection, job: str) -> dict[str, Any] | None:
    row = conn.execute("select cursor from public.crawl_checkpoints where job = %s", (job,)).fetchone()
    return dict(row[0]) if row else None


def set_checkpoint(conn: Connection, job: str, cursor: dict[str, Any]) -> None:
    conn.execute(
        "insert into public.crawl_checkpoints (job, cursor, updated_at) values (%s, %s, now())"
        " on conflict (job) do update set cursor = excluded.cursor, updated_at = now()",
        (job, Jsonb(cursor)),
    )


def clear_checkpoint(conn: Connection, job: str) -> None:
    conn.execute("delete from public.crawl_checkpoints where job = %s", (job,))
