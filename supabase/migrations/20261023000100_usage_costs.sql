-- Cut Supabase Disk IO and Vercel ISR writes (§15 2026-10-23).
--
-- 1. The *_next shadow tables are rebuilt from scratch by every rating run and emptied by
--    publish_gold(), so crash safety buys nothing: unlogged, they skip the write-ahead log
--    (~160k rows per run). A crash just empties them; the next run refills them.
-- 2. The sitemap lists only pages worth crawling: rated hackers who placed or are on the board
--    (not the ~66k provisional, never-placed ones) and schools someone is in (not all ~10k
--    loaded universities). Every crawled URL costs a page regeneration after each publish.

alter table public.ratings_next set unlogged;
alter table public.rating_history_next set unlogged;
alter table public.hackathon_strength_next set unlogged;
alter table public.series_strength_next set unlogged;
alter table public.crews_next set unlogged;
alter table public.school_ratings_next set unlogged;

create or replace function public.sitemap_entries()
returns table (kind text, slug text, updated_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select 'hacker', p.slug, p.updated_at from public.people p
  where not p.hidden
    and exists (select 1 from public.ratings r
                where r.person_id = p.id and (not r.provisional or r.placements > 0))
  union all
  select 'school', s.slug, s.updated_at from public.schools s
  where exists (select 1 from public.people p where p.school_id = s.id and not p.hidden)
  union all
  select 'event', h.slug, null from public.public_hackathons h
  where exists (select 1 from public.hackathon_strength s where s.hackathon_id = h.id)
  union all
  select 'series', es.slug, es.updated_at from public.event_series es
  where exists (select 1 from public.series_strength s where s.series_id = es.id)
$$;
