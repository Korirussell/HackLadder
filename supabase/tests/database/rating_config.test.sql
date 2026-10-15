-- Admin-configurable rating system (CLAUDE.md §8.7). Run with: supabase test db
-- auth.uid() reads request.jwt.claim.sub (and, on newer stacks, request.jwt.claims); claim.sub works on both.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'user@example.com');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a1');

insert into public.hackathons (source, source_id, slug, title, url, is_mlh, is_online, is_high_school) values
  ('test', 'c1', 'cfg-mlh-inperson', 'MLH In Person', 'https://example.com/1', true, false, false),
  ('test', 'c2', 'cfg-mlh-online', 'MLH Online', 'https://example.com/2', true, true, false),
  ('test', 'c3', 'cfg-flagship', 'Non-MLH Flagship', 'https://example.com/3', false, false, false),
  ('test', 'c4', 'cfg-teens', 'Teen Hack', 'https://example.com/4', true, false, true),
  ('test', 'c5', 'cfg-dropped', 'Dropped', 'https://example.com/5', true, false, false);

-- ---------------------------------------------------------------- defaults
select results_eq(
  'select name from public.rank_tiers order by position',
  $$values ('Hall of Fame'::text), ('Legend'), ('Principal'), ('Architect'), ('Shipper'), ('Committer'), ('Hello World')$$,
  'default rank tiers, highest first');
select is((select provisional_min_events from public.rating_settings), 3::smallint, 'provisional threshold defaults to 3');
select throws_ok($$insert into public.rating_settings (id) values (false)$$, '23514', null,
  'rating_settings is a single row');
select throws_ok($$insert into public.rank_tiers (name, position) values ('Second Floor', 99)$$, '23505', null,
  'only one "everyone else" rank tier');

-- ---------------------------------------------------------------- non-admins
set local role anon;
select throws_ok('select * from public.prize_tier_rules', '42501', null, 'anon cannot read prize rules');
select is((select count(*) from public.public_rank_tiers)::int, 7, 'anon can read rank tier names');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select is((select count(*) from public.hackathon_scope)::int, 0, 'non-admins see no scope rows');
update public.rating_settings set provisional_min_events = 1;
reset role;
select is((select provisional_min_events from public.rating_settings), 3::smallint, 'non-admins cannot change settings');

-- ---------------------------------------------------------------- admin edits
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.hackathon_settings (hackathon_id, counts, event_tier)
  select hackathon_id, 'include', 'S' from public.hackathon_scope where slug = 'cfg-flagship';
insert into public.hackathon_settings (hackathon_id, counts)
  select hackathon_id, 'include' from public.hackathon_scope where slug = 'cfg-teens';
insert into public.hackathon_settings (hackathon_id, counts)
  select hackathon_id, 'exclude' from public.hackathon_scope where slug = 'cfg-dropped';
insert into public.prize_tier_rules (position, name, tier, pattern) values (1, 'raffle', 5, '\braffle\b');

select results_eq(
  $$select slug, is_rated from public.hackathon_scope where slug like 'cfg-%' order by slug$$,
  $$values ('cfg-dropped'::text, false), ('cfg-flagship', true), ('cfg-mlh-inperson', true),
           ('cfg-mlh-online', false), ('cfg-teens', false)$$,
  'scope: MLH in person counts, online does not, admins include/exclude, high school never');
select is((select reason from public.hackathon_scope where slug = 'cfg-teens'), 'high-school event (never counts)',
  'including a high-school event has no effect (§9)');

update public.rating_settings set mlh_digital_counts = true;
select is((select is_rated from public.hackathon_scope where slug = 'cfg-mlh-online'), true,
  'the MLH-online setting changes scope');

reset role;
select is((select updated_by from public.prize_tier_rules where name = 'raffle'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'edits are stamped with the admin');
select is(
  (select count(*) from public.config_changes where changed_by = '00000000-0000-0000-0000-0000000000a1')::int, 5,
  'every admin edit lands in the change log');
select is(
  (select old_row ->> 'mlh_digital_counts' from public.config_changes
   where table_name = 'rating_settings' and operation = 'UPDATE'),
  'false', 'the change log keeps the old row');
select is((select event_tier from public.public_hackathons where slug = 'cfg-flagship'), 'S',
  'event tier is public as a label');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.prize_tier_rules (position, name, tier, pattern) values (2, 'grand', 1, 'grand prize');
select public.move_prize_rule((select id from public.prize_tier_rules where name = 'grand'), -1);
select results_eq(
  'select name from public.prize_tier_rules order by position',
  $$values ('grand'::text), ('raffle')$$,
  'an admin can move a rule up');
select lives_ok(
  $$select public.move_prize_rule((select id from public.prize_tier_rules where name = 'grand'), -1)$$,
  'moving the first rule up is a no-op');

select throws_ok($$insert into public.config_changes (table_name, operation) values ('x', 'INSERT')$$,
  '42501', null, 'even admins cannot write the change log directly');

select * from finish();
rollback;
