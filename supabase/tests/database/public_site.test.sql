-- The public site's read functions, themes, and the bio-code claim and removal flows
-- (CLAUDE.md §4.7, §9, §10, §11). Run with: supabase test db
-- Uses only invented data inside a rolled-back transaction. Devpost is never contacted:
-- devpost_user_html() is replaced by a stub that reads from a test table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ---------------------------------------------------------------- fixtures (fake)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'claimer@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'rival@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin@example.com');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a3');

insert into public.schools (slug, name) values ('test-u', 'Test University');
insert into public.hackathons (source, source_id, slug, title, url, ends_on, is_high_school) values
  ('test', 'e1', 'test-big', 'Test Big Hack', 'https://example.com/big', current_date - 10, false),
  ('test', 'e2', 'test-small', 'Test Small Hack', 'https://example.com/small', current_date - 400, false),
  ('test', 'e3', 'test-teen', 'Test Teen Hack', 'https://example.com/teen', current_date - 5, true);

insert into public.people (slug, display_name, school_id) values
  ('t-ana', 'Test Ana', (select id from public.schools where slug = 'test-u')),
  ('t-ben', 'Test Ben', null),
  ('t-cy', 'Test Cy', null),
  ('t-dee', 'Test Dee', null);
insert into public.accounts (source, source_id, display_name, person_id)
select 'devpost', replace(slug, 't-', 'tuser-'), display_name, id from public.people where slug like 't-%';

insert into public.projects (source, source_id, hackathon_id, title)
select 'test', v.p, h.id, v.t
from (values ('p-win', 'test-big', 'Winning Thing'), ('p-lose', 'test-big', 'Other Thing'),
             ('p-old', 'test-small', 'Old Thing'), ('p-teen', 'test-teen', 'Teen Thing')) v (p, e, t)
join public.hackathons h on h.slug = v.e;
insert into public.prizes_won (project_id, prize_name, tier)
select id, 'Grand Prize', 1 from public.projects where source_id = 'p-win'
union all select id, 'Grand Prize', 1 from public.projects where source_id = 'p-teen';
insert into public.project_members (project_id, account_id)
select pr.id, a.id from public.projects pr join public.accounts a on a.source_id = any (
  case pr.source_id when 'p-win' then array['tuser-ana', 'tuser-ben']
                    when 'p-lose' then array['tuser-cy']
                    when 'p-old' then array['tuser-ana', 'tuser-ben']
                    else array['tuser-dee'] end);

-- Rating outputs are pipeline-made; these are invented for the test only.
insert into public.ratings (person_id, mu, sigma, score, events, placements, grand_prizes, last_event_on, percentile, provisional)
select id, 30, 2, v.score, 3, 1, 1, current_date - 10, v.pct, v.prov
from public.people p join (values ('t-ana', 1300, 20.0, false), ('t-ben', 1200, 60.0, false),
                                  ('t-cy', 1100, 100.0, false), ('t-dee', 1000, null, true)) v (s, score, pct, prov)
  on p.slug = v.s;
insert into public.rating_history (person_id, hackathon_id, ends_on, score_before, score_after)
select p.id, h.id, h.ends_on, 1250, 1300 from public.people p, public.hackathons h
where p.slug = 't-ana' and h.slug = 'test-big';
insert into public.hackathon_strength (hackathon_id, field_size, elite_count, win_odds, event_rating)
select id, 2, 1, 12.5, 1.5 from public.hackathons where slug = 'test-big';

-- Devpost stub: bios come from this table, and a missing row is a 404.
create table public.test_bios (username text primary key, html text not null);
create or replace function public.devpost_user_html(p_username text) returns text
language sql as $$ select html from public.test_bios where username = p_username $$;

-- ---------------------------------------------------------------- public reads (anon)
set local role anon;

select results_eq($$select slug, rank::int from public.ladder() order by rank$$,
  $$values ('t-ana'::text, 1), ('t-ben', 2), ('t-cy', 3)$$,
  'the ladder lists non-provisional hackers by rating');
select is((select best_event_title from public.ladder() where slug = 't-ana'), 'Test Big Hack',
  'the ladder shows each hacker''s best win');
select is((select month_change from public.ladder() where slug = 't-ana'), 50,
  'the ladder shows the change over the last 30 days');
select is((select tier from public.ladder() where slug = 't-ana'), 'Hall of Fame',
  'the top 100 get the Hall of Fame tier');
select is((select count(*)::int from public.ladder(50, 0, 'test-u')), 1, 'the ladder filters by school');
select is(public.provisional_count()::int, 1, 'provisional hackers are counted, not ranked');
select is((public.hacker_page('t-ana')->>'rank')::int, 1, 'a profile has its rank');
select is(jsonb_array_length(public.hacker_page('t-ana')->'events'), 2,
  'a profile lists public events only (the high-school event is left out)');
select is(public.hacker_page('t-ana')->'teammates'->0->>'name', 'Test Ben', 'a profile lists frequent teammates');
select is(public.hacker_page('t-ana')->'toughest_win'->>'title', 'Test Big Hack', 'a profile has its toughest win');
select is(public.hacker_page('nobody'), null, 'an unknown profile is null');
select is((public.event_page('test-big')->'winners'->0->>'title'), 'Winning Thing', 'an event page lists winners');
select is(public.event_page('test-teen'), null, 'a high-school event has no page');
select is((select title from public.event_board()), 'Test Big Hack', 'the event board ranks rated events');
select throws_ok($$select public.start_claim('tuser-ben')$$, '42501', null, 'anon cannot start a claim');
select throws_ok($$select * from public.live_board$$, '42501', null, 'anon cannot read the live board view directly');

-- ---------------------------------------------------------------- claiming (§11)
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select throws_like($$select public.start_claim('nobody-here')$$, 'No Devpost account called "nobody-here"%',
  'claiming an unknown username explains itself');
select is((select code from public.start_claim('TUSER-BEN')), (select code from public.start_claim('tuser-ben')),
  'asking again reuses the open code, and usernames match case-insensitively');
select is(public.verify_claim((select attempt_id from public.my_claim_attempts() where username = 'tuser-ben')),
  'profile_missing', 'a missing Devpost profile is reported');

reset role;
insert into public.test_bios values ('tuser-ben', '<p class="large" id="portfolio-user-bio"><i>hi</i></p><h5>'
  || (select code from public.claim_attempts limit 1) || '</h5>');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select is(public.verify_claim((select attempt_id from public.my_claim_attempts() where username = 'tuser-ben')),
  'code_missing', 'a code outside the bio paragraph does not count');

reset role;
update public.test_bios set html = '<p class="large" id="portfolio-user-bio"><i>ok '
  || lower((select code from public.claim_attempts limit 1)) || '</i></p>';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select is(public.verify_claim((select attempt_id from public.my_claim_attempts() where username = 'tuser-ben')),
  'claimed', 'a code in the bio claims the profile');
select is((select slug from public.people), 't-ben', 'the owner can now read their own row');
update public.people set profile_theme = 'sakura', ui_theme = 'midnight';
select is((select profile_theme from public.public_people where slug = 't-ben'), 'sakura',
  'a claimed owner''s profile theme is public');

-- A second account, verified the same way, merges into the profile (§7.5).
select ok((select code from public.start_claim('tuser-cy')) like 'hl-%', 'an owner can start claiming another account');
reset role;
insert into public.test_bios
select 'tuser-cy', '<p id="portfolio-user-bio">' || c.code || '</p>'
from public.claim_attempts c join public.accounts a on a.id = c.account_id where a.source_id = 'tuser-cy';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select is(public.verify_claim((select attempt_id from public.my_claim_attempts() where username = 'tuser-cy')),
  'merged', 'a second verified account merges into the owner''s profile');
reset role;
select is((select p.slug from public.accounts a join public.people p on p.id = a.person_id where a.source_id = 'tuser-cy'),
  't-ben', 'the merged account now belongs to the owner');
select ok(not exists (select 1 from public.people where slug = 't-cy'), 'the emptied person is removed');

-- Someone else can't claim a claimed profile.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select throws_like($$select public.start_claim('tuser-ben')$$, 'Someone else has claimed that profile%',
  'a claimed profile cannot be claimed again');

-- ---------------------------------------------------------------- remove me (§9.4)
reset role;
set local role anon;
select ok((select code from public.start_removal('tuser-ana')) like 'hl-%', 'anyone can get a removal code');
reset role;
insert into public.test_bios
select 'tuser-ana', '<p class="large" id="portfolio-user-bio">' || r.code || '</p>'
from public.removal_attempts r;
set local role anon;
select throws_like($$select public.verify_removal('tuser-ana', 'hl-0000-00')$$, 'That code doesn''t match%',
  'a wrong removal code is refused');
select is(public.verify_removal('tuser-ana', (select code from public.start_removal('tuser-ana'))), 'removed',
  'a removal code in the bio removes the profile');
select is(public.hacker_page('t-ana'), null, 'a removed profile is gone at once');

-- ---------------------------------------------------------------- schools from corrections
reset role;
insert into public.corrections (person_id, submitted_by, kind, payload)
select id, '00000000-0000-0000-0000-0000000000a1', 'set_school', '{"school": "Sample College"}'
from public.people where slug = 't-ben';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select ok(public.approve_school_correction((select id from public.corrections), 'Sample College') > 0,
  'an admin approving a school correction creates the school');
reset role;
select is((select s.slug from public.people p join public.schools s on s.id = p.school_id where p.slug = 't-ben'),
  'sample-college', 'and sets it on the person');

select * from finish();
rollback;
