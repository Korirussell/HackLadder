"""Load a parsed project entry (§7.3). Idempotent: reloading replaces the entry's prizes and team.

One Devpost account becomes one person; entity resolution never auto-merges (§7.5).
Private and deleted members are counted as anonymous seats, never stored as accounts.
"""

from __future__ import annotations

import re

from hackladder.db import Connection
from hackladder.parse import GalleryEntry, Member, ProjectPage
from hackladder.prizes import TierConfig


def _person_slug(username: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", username.lower()).strip("-") or "hacker"


def upsert_account(conn: Connection, member: Member) -> int:
    """The account id for a named member, creating the account and its person if new."""
    assert member.username is not None
    name = member.display_name or member.username
    # Rewrites the row only when the name changed: the same people appear on many projects, and
    # an unconditional update wrote a new row version (and WAL) every time (Disk IO, 2026-10-23).
    row = (
        conn.execute(
            "insert into public.accounts (source, source_id, display_name) values ('devpost', %s, %s)"
            " on conflict (source, source_id) do update set display_name = excluded.display_name"
            " where accounts.display_name is distinct from excluded.display_name"
            " returning id, person_id",
            (member.username, name),
        ).fetchone()
        or conn.execute(
            "select id, person_id from public.accounts where source = 'devpost' and source_id = %s",
            (member.username,),
        ).fetchone()
    )
    assert row is not None
    account_id, person_id = row
    if person_id is None:
        slug = _person_slug(member.username)
        taken = conn.execute("select 1 from public.people where slug = %s", (slug,)).fetchone()
        person = conn.execute(
            "insert into public.people (slug, display_name) values (%s, %s) returning id",
            (f"{slug}-{account_id}" if taken else slug, name),
        ).fetchone()
        assert person is not None
        conn.execute("update public.accounts set person_id = %s where id = %s", (person[0], account_id))
    return int(account_id)


def load_project(
    conn: Connection,
    hackathon_id: int,
    event_slug: str,
    entry: GalleryEntry,
    page: ProjectPage,
    *,
    tiers: TierConfig,
) -> int:
    """Upsert one project's entry at one hackathon with its prizes and team; returns the project id."""
    row = conn.execute(
        "insert into public.projects (source, source_id, hackathon_id, title, tagline, is_winner, built_with,"
        " description, anonymous_members) values ('devpost', %s, %s, %s, %s, %s, %s, %s, %s)"
        " on conflict (source, source_id, hackathon_id) do update set title = excluded.title,"
        " tagline = excluded.tagline, is_winner = excluded.is_winner, built_with = excluded.built_with,"
        " description = excluded.description, anonymous_members = excluded.anonymous_members"
        " where (projects.title, projects.tagline, projects.is_winner, projects.built_with,"
        " projects.description, projects.anonymous_members) is distinct from (excluded.title,"
        " excluded.tagline, excluded.is_winner, excluded.built_with, excluded.description,"
        " excluded.anonymous_members)"
        " returning id",
        (
            entry.slug, hackathon_id, page.title or entry.title, page.tagline or entry.tagline,
            entry.is_winner or bool(page.prizes_at_this_event), list(page.built_with), page.description_text,
            sum(m.is_anonymous for m in page.members),
        ),
    ).fetchone() or conn.execute(  # unchanged: no update, so look the id up
        "select id from public.projects where source = 'devpost' and source_id = %s and hackathon_id = %s",
        (entry.slug, hackathon_id),
    ).fetchone()  # fmt: skip
    assert row is not None
    project_id = int(row[0])

    # Prizes and team are replaced only when they differ from what's stored, so re-crawling a
    # settled event writes nothing.
    prizes = {name: tiers.tier(name, event_slug) for name in page.prizes_at_this_event}
    stored = dict(
        conn.execute(
            "select prize_name, tier from public.prizes_won where project_id = %s", (project_id,)
        ).fetchall()
    )
    if stored != prizes:
        conn.execute("delete from public.prizes_won where project_id = %s", (project_id,))
        for name, tier in prizes.items():
            conn.execute(
                "insert into public.prizes_won (project_id, prize_name, tier) values (%s, %s, %s)",
                (project_id, name, tier),
            )
    team = {upsert_account(conn, m) for m in page.members if m.username}
    members = {
        int(r[0])
        for r in conn.execute(
            "select account_id from public.project_members where project_id = %s", (project_id,)
        ).fetchall()
    }
    if members != team:
        conn.execute("delete from public.project_members where project_id = %s", (project_id,))
        for account_id in sorted(team):
            conn.execute(
                "insert into public.project_members (project_id, account_id) values (%s, %s)",
                (project_id, account_id),
            )
    return project_id
