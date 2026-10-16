"""Upsert hackathons from the Devpost list API (§6.4 step 1). Idempotent: re-running a page is a no-op."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from hackladder.parse import HackathonMeta
from hackladder.scope import looks_high_school


@dataclass(frozen=True, slots=True)
class LoadCounts:
    inserted: int
    updated: int


_UPSERT = """
insert into public.hackathons
  (source, source_id, slug, title, url, organization, location, is_online, starts_on, ends_on,
   registrations, prize_total_usd, themes, is_high_school, winners_announced)
values ('devpost', %(source_id)s, %(slug)s, %(title)s, %(url)s, %(organization)s, %(location)s,
        %(is_online)s, %(starts_on)s, %(ends_on)s, %(registrations)s, %(prize_total_usd)s,
        %(themes)s, %(is_high_school)s, %(winners_announced)s)
on conflict (source, source_id) do update set
  title = excluded.title, url = excluded.url, organization = excluded.organization,
  location = excluded.location, is_online = excluded.is_online, starts_on = excluded.starts_on,
  ends_on = excluded.ends_on, registrations = excluded.registrations,
  prize_total_usd = excluded.prize_total_usd, themes = excluded.themes,
  winners_announced = excluded.winners_announced,
  -- Never cleared by a reload: MLH's flag or an earlier keyword match may have set it (§9).
  is_high_school = hackathons.is_high_school or excluded.is_high_school
returning id, (xmax = 0) as inserted
"""

_META = """
insert into public.hackathons_devpost_meta (hackathon_id, invite_only, open_state)
values (%s, %s, %s)
on conflict (hackathon_id) do update set invite_only = excluded.invite_only, open_state = excluded.open_state
"""


def _slugs(conn: psycopg.Connection[Any], metas: Sequence[HackathonMeta]) -> dict[str, str]:
    """Our URL slug per source_id: the Devpost subdomain, unless another event already has it."""
    taken = dict(
        conn.execute(
            "select slug, source_id from public.hackathons where slug = any(%s)",
            ([m.slug for m in metas],),
        ).fetchall()
    )

    def slug_for(m: HackathonMeta) -> str:
        owner = taken.get(m.slug, m.source_id)
        return m.slug if owner == m.source_id else f"{m.slug}-{m.source_id}"

    return {m.source_id: slug_for(m) for m in metas}


def upsert_hackathons(conn: psycopg.Connection[Any], metas: Sequence[HackathonMeta]) -> LoadCounts:
    if not metas:
        return LoadCounts(0, 0)
    slugs = _slugs(conn, metas)
    inserted = 0
    with conn.cursor() as cur:
        for m in metas:
            row = cur.execute(
                _UPSERT,
                {
                    "source_id": m.source_id,
                    "slug": slugs[m.source_id],
                    "title": m.title,
                    "url": m.url,
                    "organization": m.organization,
                    "location": m.location,
                    "is_online": m.is_online,
                    "starts_on": m.starts_on,
                    "ends_on": m.ends_on,
                    "registrations": m.registrations,
                    "prize_total_usd": m.prize_total_usd,
                    "themes": Jsonb(list(m.themes)),
                    "is_high_school": looks_high_school(
                        m.title, themes=m.themes, organization=m.organization
                    ),
                    "winners_announced": m.winners_announced,
                },
            ).fetchone()
            assert row is not None
            inserted += bool(row[1])
            cur.execute(_META, (row[0], m.invite_only, m.open_state))
    return LoadCounts(inserted=inserted, updated=len(metas) - inserted)
