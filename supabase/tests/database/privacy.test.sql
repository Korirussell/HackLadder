-- Privacy and access rules (CLAUDE.md §7.7, §9). Run with: supabase test db
-- auth.uid() reads request.jwt.claim.sub (and, on newer stacks, request.jwt.claims); claim.sub works on both.
-- Uses only invented data inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------- fixtures (fake)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'stranger@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@example.com');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000000c');

insert into public.hackathons (source, source_id, slug, title, url, is_high_school, ends_on) values
  ('test', 't1', 'test-open', 'Test Open', 'https://example.com/1', false, '2025-01-01'),
  ('test', 't2', 'test-teens', 'Test Teens', 'https://example.com/2', true, '2025-01-02'),
  ('test', 't3', 'test-excluded', 'Test Excluded', 'https://example.com/3', false, '2025-01-03');
insert into public.excluded_hackathons (hackathon_id, reason)
  select id, 'test' from public.hackathons where slug = 'test-excluded';

insert into public.people (slug, display_name, claimed_by, claimed_at, linkedin_url) values
  ('test-owner', 'Test Owner', '00000000-0000-0000-0000-00000000000a', now(), 'https://example.com/in/owner'),
  ('test-unclaimed', 'Test Unclaimed', null, null, 'https://example.com/in/never-shown'),
  ('test-leaver', 'Test Leaver', null, null, null);
insert into public.accounts (source, source_id, display_name, person_id)
  select 'test', replace(slug, 'test-', 'user-'), display_name, id from public.people where slug like 'test-%';
insert into public.projects (source, source_id, hackathon_id, title)
  select 'test', 'proj', id, 'Test Project' from public.hackathons where slug = 'test-open';
insert into public.project_members (project_id, account_id)
  select pr.id, a.id from public.projects pr, public.accounts a where pr.source_id = 'proj' and a.source = 'test';
refresh materialized view public.search_index;

-- ---------------------------------------------------------------- anon
set local role anon;

select throws_ok('select * from public.people', '42501', null, 'anon cannot read the people table');
select throws_ok('select * from public.accounts', '42501', null, 'anon cannot read the accounts table');
select throws_ok('select * from public.search_index', '42501', null, 'anon cannot read the search index directly');
select results_eq(
  $$select slug from public.public_hackathons where slug like 'test-%'$$,
  $$values ('test-open'::text)$$,
  'high-school and excluded events are not public');
select is(
  (select linkedin_url from public.public_people where slug = 'test-unclaimed'), null,
  'links are hidden until a profile is claimed');
select is(
  (select linkedin_url from public.public_people where slug = 'test-owner'), 'https://example.com/in/owner',
  'a claimed owner''s links are public');
select ok(exists (select 1 from public.search('user-leaver')), 'search finds by exact username');
select throws_ok('select public.publish_gold()', '42501', null, 'anon cannot publish ratings');

-- ---------------------------------------------------------------- removal is instant (§9.4)
reset role;
insert into public.removals (person_id) select id from public.people where slug = 'test-leaver';
set local role anon;

select ok(not exists (select 1 from public.public_people where slug = 'test-leaver'), 'removed person is hidden');
select ok(not exists (select 1 from public.search('user-leaver')),
  'removed person disappears from search before the index is refreshed');
select results_eq(
  $$select m.display_name from public.public_project_members m
    join public.public_projects p on p.id = m.project_id where p.source = 'test' order by 1$$,
  $$values ('Hidden hacker'::text), ('Test Owner'), ('Test Unclaimed')$$,
  'removed person still counts on their team, shown as Hidden hacker');

-- ---------------------------------------------------------------- owners (§7.7)
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select results_eq('select slug from public.people', $$values ('test-owner'::text)$$,
  'an owner can read only their own people row');
update public.people set bio = 'hello' where slug in ('test-owner', 'test-unclaimed');
reset role;
select results_eq(
  $$select slug, bio from public.people where slug in ('test-owner', 'test-unclaimed') order by slug$$,
  $$values ('test-owner'::text, 'hello'::text), ('test-unclaimed', null)$$,
  'an owner can update only their own row');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select throws_ok($$update public.people set display_name = 'Someone Else'$$, '42501', null,
  'owners cannot edit columns outside the owner-editable set');

-- ---------------------------------------------------------------- corrections (§7.7)
select lives_ok(
  $$insert into public.corrections (person_id, submitted_by, kind)
    select id, '00000000-0000-0000-0000-00000000000a', 'set_school' from public.public_people where slug = 'test-owner'$$,
  'a signed-in user can submit a correction');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select is((select count(*) from public.corrections)::int, 0, 'users cannot see other people''s corrections');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
update public.corrections set status = 'approved', reviewed_at = now(),
  reviewer = '00000000-0000-0000-0000-00000000000c';
reset role;
select is((select status from public.corrections), 'approved', 'admins can review corrections');

select * from finish();
rollback;
