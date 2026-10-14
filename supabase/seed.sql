-- FAKE DEVELOPMENT DATA. Every name, event and school here is invented (CLAUDE.md §2).
-- source = 'seed' marks these rows so they can never be mistaken for Devpost data.
-- No ratings are seeded: ratings are pipeline outputs (§2, "ratings are reproducible").

insert into public.schools (slug, name, aliases, country) values
  ('example-state', 'Example State University', '{"ESU"}', 'US'),
  ('sample-tech', 'Sample Institute of Technology', '{"SIT"}', 'US');

insert into public.event_series (slug, name) values ('fakehacks', 'FakeHacks');

insert into public.hackathons
  (source, source_id, slug, title, url, organization, location, is_online,
   starts_on, ends_on, registrations, prize_total_usd, themes, series_id, winners_announced)
values
  ('seed', 'fake-1', 'fakehacks-2025', 'FakeHacks 2025 (sample)', 'https://example.com/fakehacks-2025',
   'Sample Org', 'Example City', false, '2025-02-14', '2025-02-16', 400, 10000, '["Open Ended"]',
   (select id from public.event_series where slug = 'fakehacks'), true),
  ('seed', 'fake-2', 'placeholder-jam', 'Placeholder Jam (sample)', 'https://example.com/placeholder-jam',
   'Sample Org', 'Online', true, '2025-03-01', '2025-03-08', 1200, 0, '["Beginner Friendly"]', null, true);

insert into public.people (slug, display_name, school_id) values
  ('sample-hacker-one', 'Sample Hacker One', (select id from public.schools where slug = 'example-state')),
  ('sample-hacker-two', 'Sample Hacker Two', (select id from public.schools where slug = 'example-state')),
  ('sample-hacker-three', 'Sample Hacker Three', (select id from public.schools where slug = 'sample-tech'));

insert into public.accounts (source, source_id, display_name, person_id)
select 'seed', 'sample-user-' || n, 'Sample Hacker ' || initcap(word), p.id
from (values (1, 'one'), (2, 'two'), (3, 'three')) v (n, word)
join public.people p on p.slug = 'sample-hacker-' || word;

insert into public.projects (source, source_id, hackathon_id, title, tagline, is_winner)
select 'seed', v.slug, h.id, v.title, 'Sample project for local development.', v.winner
from (values
  ('sample-app', 'fakehacks-2025', 'Sample App', true),
  ('demo-widget', 'fakehacks-2025', 'Demo Widget', false),
  ('sample-app', 'placeholder-jam', 'Sample App', false)  -- same project entered in two events
) v (slug, event, title, winner)
join public.hackathons h on h.slug = v.event;

insert into public.prizes_won (project_id, prize_name, tier)
select pr.id, 'Grand Prize (sample)', 1
from public.projects pr join public.hackathons h on h.id = pr.hackathon_id
where pr.source_id = 'sample-app' and h.slug = 'fakehacks-2025';

insert into public.project_members (project_id, account_id)
select pr.id, a.id
from public.projects pr
join public.accounts a on a.source_id in (
  case pr.source_id when 'sample-app' then 'sample-user-1' else 'sample-user-3' end,
  case pr.source_id when 'sample-app' then 'sample-user-2' else 'sample-user-3' end);

refresh materialized view public.search_index;
