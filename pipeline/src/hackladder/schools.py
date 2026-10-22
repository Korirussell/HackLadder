"""Load the university list that owners pick their school from (§8.4, §16).

School only ever comes from a claimed owner; this just gives the `/me` picker real names to
choose from. Rows already present (same name and country) are left alone, so reloading is safe
and schools added through corrections keep their slugs.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from hackladder.db import Connection

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "config" / "schools" / "world_universities.json"


@dataclass(frozen=True, slots=True)
class School:
    name: str
    country: str | None
    code: str | None  # ISO 3166 alpha-2, used to tell same-named schools apart in slugs


def read_schools(path: Path = DEFAULT_FILE) -> list[School]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    return [
        School(" ".join(r["name"].split()), r.get("country") or None, (r.get("code") or "").lower() or None)
        for r in rows
        if r.get("name", "").strip()
    ]


# One statement: skip schools we already have, give the first of each name its plain slug and
# the rest a country suffix (then a counter), and never take a slug that's in use.
_LOAD = """
with src as (
  select * from unnest(%s::text[], %s::text[], %s::text[]) as s (name, country, code)
),
fresh as (
  select distinct on (lower(s.name), s.country) s.name, s.country, s.code
  from src s
  where not exists (select 1 from public.schools x
                    where lower(x.name) = lower(s.name) and x.country is not distinct from s.country)
  order by lower(s.name), s.country, s.name
),
slugged as (
  select f.*, public.slugify(f.name) as base,
         row_number() over (partition by public.slugify(f.name) order by f.country nulls first, f.name) as n
  from fresh f
  where public.slugify(f.name) is not null
)
insert into public.schools (slug, name, country)
select case
         when s.n = 1 and not exists (select 1 from public.schools x where x.slug = s.base) then s.base
         else s.base || coalesce('-' || s.code, '') || case when s.n > 1 then '-' || s.n else '' end
       end,
       s.name, s.country
from slugged s
on conflict (slug) do nothing
"""


def load_schools(conn: Connection, schools: list[School]) -> int:
    """Insert the schools we don't have yet; returns how many were added."""
    cur = conn.execute(
        _LOAD,
        ([s.name for s in schools], [s.country for s in schools], [s.code for s in schools]),
    )
    conn.commit()
    return cur.rowcount
