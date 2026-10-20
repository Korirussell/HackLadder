-- Crews (CLAUDE.md §8.3, §9): the public board and profiles show a crew only while every member
-- exists and none is hidden. Run with: supabase test db
-- Uses only invented data inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.people (slug, display_name) values
  ('t-ana', 'Test Ana'), ('t-ben', 'Test Ben'), ('t-cy', 'Test Cy'), ('t-dee', 'Test Dee');
insert into public.ratings (person_id, mu, sigma, score, events, placements, grand_prizes, last_event_on, percentile, provisional)
select id, 30, 2, 1100, 3, 1, 0, current_date - 10, 50, false from public.people where slug like 't-%';

-- Rating outputs are pipeline-made; these crews are invented for the test only.
insert into public.crews (members, events_together, placements_together, overperformance, score)
select array_agg(id order by id), v.events, v.placed, 0.1, v.score
from (values (array['t-ana', 't-ben', 't-cy'], 3, 2, 0.6), (array['t-ana', 't-dee'], 2, 1, 0.4)) v (slugs, events, placed, score)
join public.people p on p.slug = any (v.slugs)
group by v.slugs, v.events, v.placed, v.score;

select is((select count(*)::int from public.crew_board()), 2, 'both crews are on the board');
select is((select size from public.crew_board() where rank = 1), 3, 'the best crew comes first, with its size');
select is((select members -> 0 ->> 'slug' from public.crew_board() where rank = 1), 't-ana',
          'members come back in id order with their slugs');
select is((public.hacker_page('t-ana') -> 'best_crew' ->> 'events')::int, 3, 'a profile shows its best crew');

update public.people set hidden = true where slug = 't-cy';
select is((select count(*)::int from public.crew_board()), 1, 'a hidden member hides the whole crew');
select is((public.hacker_page('t-ana') -> 'best_crew' ->> 'events')::int, 2, 'the profile falls back to the next crew');

set local role anon;
select throws_ok('select * from public.crews', '42501', null, 'anon cannot read the crews table directly');
reset role;

select * from finish();
rollback;
