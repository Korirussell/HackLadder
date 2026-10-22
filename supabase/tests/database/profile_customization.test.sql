-- Profile customization (§7.7, §9.2): owners set a photo and a layout on their own row only, the
-- layout is validated, and profiles show neither until claimed. Run with: supabase test db
-- Uses only invented data inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'stranger@example.com');
insert into public.hackathons (source, source_id, slug, title, url, ends_on) values
  ('test', 'pc1', 'test-pc-open', 'Test PC Open', 'https://example.com/pc1', '2025-03-01');
insert into public.people (slug, display_name, claimed_by, claimed_at, profile_layout) values
  ('t-pc-owner', 'Test PC Owner', '00000000-0000-0000-0000-0000000000d1', now(), '{}'),
  ('t-pc-unclaimed', 'Test PC Unclaimed', null, null, '{"projects": "cards"}');
insert into public.accounts (source, source_id, display_name, person_id)
  select 'test', slug, display_name, id from public.people where slug like 't-pc-%';
insert into public.projects (source, source_id, hackathon_id, title)
  select 'test', 'pc-proj', id, 'Test PC Project' from public.hackathons where slug = 'test-pc-open';
insert into public.project_members (project_id, account_id)
  select pr.id, a.id from public.projects pr, public.accounts a where pr.source_id = 'pc-proj' and a.source = 'test';
insert into public.prizes_won (project_id, prize_name, tier)
  select id, p.name, p.tier from public.projects, (values ('Test Grand Prize', 1), ('Test Raffle', 5), ('Test Track', 2)) p (name, tier)
  where source_id = 'pc-proj';
insert into public.schools (slug, name, country) values
  ('t-pc-school', 'Test PC University', 'Testland'), ('t-pc-empty', 'Test PC Empty College', 'Testland');
update public.people set school_id = (select id from public.schools where slug = 't-pc-school') where slug = 't-pc-owner';

-- ---------------------------------------------------------------- the layout is validated
select throws_ok($$update public.people set profile_layout = '{"pinned": [1, 2, 3, 4]}' where slug = 't-pc-owner'$$,
                 '23514', null, 'at most 3 pinned projects');
select throws_ok($$update public.people set profile_layout = '{"projects": "carousel"}' where slug = 't-pc-owner'$$,
                 '23514', null, 'only known project layouts');
select throws_ok($$update public.people set avatar_path = '999999/abcdefgh.webp' where slug = 't-pc-owner'$$,
                 '23514', null, 'a photo path must be in the person''s own folder');

-- ---------------------------------------------------------------- owners edit only their own row
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select lives_ok($$update public.people set profile_layout = '{"projects": "compact", "pinned": [1]}',
                  avatar_path = id || '/abcdefgh12.webp' where slug = 't-pc-owner'$$,
                'an owner sets their layout and photo');
update public.people set profile_layout = '{"projects": "compact"}' where slug = 't-pc-unclaimed';
reset role;
select is((select profile_layout ->> 'projects' from public.people where slug = 't-pc-unclaimed'), 'cards',
          'an owner cannot change someone else''s layout');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
update public.people set profile_layout = '{}' where slug = 't-pc-owner';
reset role;
select is((select profile_layout ->> 'projects' from public.people where slug = 't-pc-owner'), 'compact',
          'a stranger cannot change the owner''s layout');

-- ---------------------------------------------------------------- what the profile shows
select is((public.hacker_page('t-pc-owner') -> 'layout' ->> 'projects'), 'compact', 'a claimed profile carries its layout');
select ok((public.hacker_page('t-pc-owner') ->> 'avatar_path') like '%/abcdefgh12.webp', 'and its photo');
select is((public.hacker_page('t-pc-unclaimed') -> 'layout'), '{}'::jsonb, 'an unclaimed profile has no layout');
select is((select jsonb_agg(t ->> 'prize' order by t ->> 'prize') from jsonb_array_elements(public.hacker_page('t-pc-owner') -> 'trophies') t),
          '["Test Grand Prize", "Test Track"]'::jsonb, 'trophies are the placing prizes, not raffles');

-- ---------------------------------------------------------------- schools
set local role anon;
select is((select count(*)::int from public.search_schools('test pc univ') s where s.slug = 't-pc-school'), 1,
          'anyone can search schools by words');
select is((select array_agg(slug order by slug) from public.school_options() where slug like 't-pc-%'), array['t-pc-school'],
          'the school filter lists only schools someone is in');
reset role;

select * from finish();
rollback;
