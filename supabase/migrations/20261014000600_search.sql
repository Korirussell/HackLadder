-- Search (CLAUDE.md §7.8): a materialized index plus a ranked RPC.
-- The pipeline refreshes it after each publish: refresh materialized view concurrently search_index.

create materialized view public.search_index as
select 'hacker'::text as kind,
       p.id as ref_id,
       p.slug,
       p.display_name as name,
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
select 'school', s.id, s.slug, s.name, null, '{}', null,
       (select sr.top10_avg from public.school_ratings sr
        where sr.school_id = s.id order by sr.season desc limit 1)
from public.schools s
union all
select 'event', h.id, h.slug, h.title, null, '{}', null, hs.event_rating
from public.public_hackathons h
left join public.hackathon_strength hs on hs.hackathon_id = h.id;

create unique index search_index_key on public.search_index (kind, ref_id);
create index search_index_name_trgm on public.search_index
  using gin (lower(public.f_unaccent(name)) extensions.gin_trgm_ops);
create index search_index_usernames on public.search_index using gin (usernames);
revoke all on public.search_index from anon, authenticated;

-- Ranks exact username > name prefix > trigram word similarity (typo-tolerant), then rating.
-- Security definer so it can re-check `hidden` live: "remove me" can't wait for a refresh (§9.4).
create function public.search(q text, lim integer default 8)
returns table (kind text, slug text, name text, username text, school text, rank_score real)
language sql stable security definer
set search_path = ''
as $$
  with query as (select lower(public.f_unaccent(btrim(q))) as nq),
  matches as (
    select si.*,
           case
             when si.usernames @> array[query.nq] then 0
             when starts_with(lower(public.f_unaccent(si.name)), query.nq) then 1
             else 2
           end as match_rank,
           greatest(
             extensions.word_similarity(query.nq, lower(public.f_unaccent(si.name))),
             extensions.similarity(query.nq, lower(public.f_unaccent(si.name)))
           ) as sim
    from public.search_index si, query
    where length(query.nq) >= 2
      and (si.usernames @> array[query.nq]
           or query.nq operator(extensions.<%) lower(public.f_unaccent(si.name))
           or lower(public.f_unaccent(si.name)) operator(extensions.%) query.nq
           or starts_with(lower(public.f_unaccent(si.name)), query.nq))
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
