-- School search ranks a name with a leading "The" as an exact match (§15 2026-10-26).
-- Run with: supabase test db. Uses only invented data inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into public.schools (slug, name) values
  ('t-ss-the', 'The Test School of Zed'), ('t-ss-at', 'Test School of Zed at Ywe'), ('t-ss-north', 'Test School of North Zed');

select is((select slug from public.search_schools('test school of zed', 8) limit 1), 't-ss-the',
          'a leading "The" doesn''t push the exact name below longer ones');
select is((select slug from public.search_schools('the test school of zed', 8) limit 1), 't-ss-the',
          'typing the "The" still finds it first');

select * from finish();
rollback;
