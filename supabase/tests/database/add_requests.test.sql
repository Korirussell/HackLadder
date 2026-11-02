-- add_requests: anyone can ask to be added by Devpost username; the pipeline does the rest
-- (spec 2026-10-29-find-yourself). Run with: supabase test db. Invented data, rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select throws_ok($$ select * from public.request_add('not a username') $$, '22023', 'add_requests_bad_username',
                 'usernames are checked');
select is((select is_new from public.request_add('t-ar-alice')), true, 'a first request is new');
select is((select is_new from public.request_add('T-AR-ALICE')), false, 'the same username (any case) within 24 hours is not');
select is((select count(*)::int from public.add_requests where lower(username) = 't-ar-alice'), 1, 'and adds no row');

update public.add_requests set status = 'failed' where username = 't-ar-alice';
select is((select is_new from public.request_add('t-ar-alice')), true, 'after a failure, asking again starts over');

select is((public.add_request_status('t-ar-alice') ->> 'status'), 'queued', 'status returns the latest request');
select is(public.add_request_status('t-ar-nobody'), null, 'and null for a username never asked about');

insert into public.add_requests (username) select 't-ar-fill-' || g from generate_series(1, 200) g;
select throws_ok($$ select * from public.request_add('t-ar-bob') $$, '54000', 'add_requests_busy',
                 'at most 200 requests a day across the site');

set local role anon;
select throws_ok($$ select * from public.add_requests $$, '42501', null, 'anon cannot read the table directly');
reset role;

select * from finish();
rollback;
