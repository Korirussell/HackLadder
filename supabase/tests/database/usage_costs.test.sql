-- The sitemap lists only pages worth crawling, and the shadow tables skip the WAL (§15 2026-10-23).
-- Run with: supabase test db. Uses only invented data inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.people (slug, display_name) values
  ('t-uc-ranked', 'Test UC Ranked'), ('t-uc-placed', 'Test UC Placed'), ('t-uc-thin', 'Test UC Thin');
insert into public.ratings (person_id, mu, sigma, score, events, placements, grand_prizes, last_event_on, percentile, provisional)
select id, 25, 8, 1000, v.events, v.placements, 0, current_date, null, v.provisional
from public.people p
join (values ('t-uc-ranked', 3, 0, false), ('t-uc-placed', 1, 1, true), ('t-uc-thin', 1, 0, true)) v (slug, events, placements, provisional)
  on v.slug = p.slug;
insert into public.schools (slug, name) values ('t-uc-school', 'Test UC School'), ('t-uc-empty', 'Test UC Empty');
update public.people set school_id = (select id from public.schools where slug = 't-uc-school') where slug = 't-uc-ranked';

select is((select array_agg(slug order by slug) from public.sitemap_entries() where kind = 'hacker' and slug like 't-uc-%'),
          array['t-uc-placed', 't-uc-ranked'], 'hackers on the board or with a placement are listed');
select is((select count(*)::int from public.sitemap_entries() where slug = 't-uc-thin'), 0,
          'a provisional hacker who never placed is not');
select is((select array_agg(slug) from public.sitemap_entries() where kind = 'school' and slug like 't-uc-%'),
          array['t-uc-school'], 'only schools someone is in are listed');
select is((select count(*)::int from pg_class where relname like '%\_next' and relkind = 'r' and relpersistence = 'u'), 6,
          'all six shadow tables are unlogged');
select is((select count(*)::int from pg_class where relname in ('ratings', 'rating_history') and relpersistence = 'p'), 2,
          'the live tables stay logged');

select * from finish();
rollback;
