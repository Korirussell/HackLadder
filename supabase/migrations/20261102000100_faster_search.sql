-- Faster search (§7.8, §15 2026-11-02). Searches took 7-17 s on the live data (194k rows):
-- 1. The name-prefix test was starts_with(), which no index serves; OR'ed with the indexed tests
--    it turned every search into a scan of the whole table. It's now a LIKE prefix, which the
--    trigram index serves even with the query as a parameter.
-- 2. Every match and similarity score called f_unaccent(), whose `set search_path` stops it being
--    inlined, so each call was a full function call per row. The lowercased, unaccented name is
--    now computed once per refresh, as search_index.key, and indexed directly.

drop function public.search(text, integer);
drop materialized view public.search_index;

create materialized view public.search_index as
select 'hacker'::text as kind,
       p.id as ref_id,
       p.slug,
       p.display_name as name,
       lower(public.f_unaccent(p.display_name)) as key,                -- what search matches
       min(a.source_id) as username,                                   -- shown in results
       array_agg(lower(a.source_id) order by a.source_id) as usernames, -- every account matches
       s.name as school,
       r.score::real as rank_score
from public.people p
join public.accounts a on a.person_id = p.id
left join public.schools s on s.id = p.school_id
left join public.ratings r on r.person_id = p.id
where not p.hidden
group by p.id, s.name, r.score
union all
select 'school', s.id, s.slug, s.name, lower(public.f_unaccent(s.name)), null, '{}', null,
       (select sr.top10_avg from public.school_ratings sr
        where sr.school_id = s.id order by sr.season desc limit 1)
from public.schools s
union all
select 'event', h.id, h.slug, h.title, lower(public.f_unaccent(h.title)), null, '{}', null, hs.event_rating
from public.public_hackathons h
left join public.hackathon_strength hs on hs.hackathon_id = h.id;

create unique index search_index_key on public.search_index (kind, ref_id);
create index search_index_name_trgm on public.search_index using gin (key extensions.gin_trgm_ops);
create index search_index_usernames on public.search_index using gin (usernames);
revoke all on public.search_index from anon, authenticated;

-- Ranks exact username > name prefix > trigram word similarity (typo-tolerant), then rating.
-- Security definer so it can re-check `hidden` live: "remove me" can't wait for a refresh (§9.4).
create function public.search(q text, lim integer default 8)
returns table (kind text, slug text, name text, username text, school text, rank_score real)
language sql stable security definer
set search_path = ''
as $$
  with needle as (
    select nq,
           -- the query as a LIKE prefix, its own \, % and _ taken literally
           replace(replace(replace(nq, '\', '\\'), '%', '\%'), '_', '\_') || '%' as prefix
    from (select lower(public.f_unaccent(btrim(q))) as nq) query
  ),
  matches as (
    select si.*,
           case
             when si.usernames @> array[needle.nq] then 0
             when starts_with(si.key, needle.nq) then 1
             else 2
           end as match_rank,
           greatest(extensions.word_similarity(needle.nq, si.key), extensions.similarity(needle.nq, si.key)) as sim
    from public.search_index si, needle
    where length(needle.nq) >= 2
      and (si.usernames @> array[needle.nq]
           or needle.nq operator(extensions.<%) si.key
           or si.key operator(extensions.%) needle.nq
           or si.key like needle.prefix)
  )
  select m.kind, m.slug, m.name, m.username, m.school, m.rank_score
  from matches m
  where not (m.kind = 'hacker'
             and exists (select 1 from public.people p where p.id = m.ref_id and p.hidden))
  order by m.match_rank, m.sim desc, m.rank_score desc nulls last
  limit least(greatest(coalesce(lim, 8), 1), 50)
$$;

revoke execute on function public.search(text, integer) from public;
grant execute on function public.search(text, integer) to anon, authenticated;
