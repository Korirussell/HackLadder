-- Row-level security, the public read surface, and search (CLAUDE.md §7.7, §7.8, §9).
--
-- Tables are never readable by anon. The public reads through the public_* views below, which
-- run with their owner's rights (security_invoker = false, deliberately) and apply the privacy
-- rules in one place: hidden people, high-school events and excluded events never appear.

-- ---------------------------------------------------------------- RLS on every table
do $$
declare t text;
begin
  foreach t in array array[
    'raw_pages_index', 'crawl_checkpoints', 'crawl_failures', 'pipeline_runs',
    'schools', 'event_series', 'hackathons', 'hackathons_devpost_meta', 'series_overrides',
    'excluded_hackathons', 'people', 'accounts', 'projects', 'prizes_won', 'project_members',
    'merge_candidates', 'admins', 'claim_attempts', 'corrections', 'removals',
    'ratings', 'rating_history', 'hackathon_strength', 'series_strength', 'pair_synergy',
    'school_ratings', 'ratings_next', 'rating_history_next', 'hackathon_strength_next',
    'series_strength_next', 'pair_synergy_next', 'school_ratings_next'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.publish_gold() from public, anon, authenticated;
revoke execute on function public.hide_removed_person() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.f_unaccent(text) to anon, authenticated;

-- ---------------------------------------------------------------- owners editing their profile
-- Claimed owners can read their own row and update only the owner-editable columns.
grant select on public.people to authenticated;
grant update (linkedin_url, github_url, website_url, bio, school_id, open_to_recruiters, hidden)
  on public.people to authenticated;

create policy "owners read their profile" on public.people
  for select to authenticated using (claimed_by = (select auth.uid()));
create policy "owners update their profile" on public.people
  for update to authenticated
  using (claimed_by = (select auth.uid()))
  with check (claimed_by = (select auth.uid()));

-- ---------------------------------------------------------------- corrections
grant select, insert on public.corrections to authenticated;
grant update (status, reviewer, reviewed_at, note) on public.corrections to authenticated;

create policy "users submit corrections" on public.corrections
  for insert to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending' and reviewer is null);
create policy "users read their corrections; admins read all" on public.corrections
  for select to authenticated
  using (submitted_by = (select auth.uid()) or (select public.is_admin()));
create policy "admins review corrections" on public.corrections
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------- public views
create view public.public_hackathons as
select h.id, h.slug, h.title, h.url, h.organization, h.location, h.is_online,
       h.starts_on, h.ends_on, h.registrations, h.prize_total_usd, h.themes,
       h.is_mlh, h.series_id, h.winners_announced
from public.hackathons h
where not h.is_high_school
  and not exists (select 1 from public.excluded_hackathons x where x.hackathon_id = h.id);

create view public.public_people as
select p.id, p.slug, p.display_name, p.school_id,
       p.claimed_by is not null as is_claimed,
       -- Links and bio only ever come from a claimed owner (§9.3).
       case when p.claimed_by is not null then p.linkedin_url end as linkedin_url,
       case when p.claimed_by is not null then p.github_url end as github_url,
       case when p.claimed_by is not null then p.website_url end as website_url,
       case when p.claimed_by is not null then p.bio end as bio
from public.people p
where not p.hidden;

create view public.public_accounts as
select a.id, a.source, a.source_id as username, a.display_name, a.person_id
from public.accounts a
join public.people p on p.id = a.person_id
where not p.hidden;

create view public.public_schools as
select s.id, s.slug, s.name, s.country from public.schools s;

create view public.public_event_series as
select s.id, s.slug, s.name from public.event_series s;

create view public.public_projects as
select pr.id, pr.source, pr.source_id, pr.hackathon_id, pr.title, pr.tagline,
       pr.is_winner, pr.built_with, pr.anonymous_members
from public.projects pr
join public.public_hackathons h on h.id = pr.hackathon_id;

create view public.public_prizes_won as
select w.project_id, w.prize_name, w.tier
from public.prizes_won w
join public.public_projects pr on pr.id = w.project_id;

-- Hidden people still appear on their teams (their results count for others), as "Hidden hacker".
create view public.public_project_members as
select m.project_id,
       case when p.hidden then null else p.id end as person_id,
       case when p.hidden then null else p.slug end as person_slug,
       case when p.hidden then 'Hidden hacker' else coalesce(p.display_name, a.display_name) end as display_name
from public.project_members m
join public.public_projects pr on pr.id = m.project_id
join public.accounts a on a.id = m.account_id
left join public.people p on p.id = a.person_id;

create view public.public_ratings as
select r.person_id, r.score, r.mu, r.sigma, r.events, r.placements, r.grand_prizes,
       r.last_event_on, r.percentile, r.provisional
from public.ratings r
join public.people p on p.id = r.person_id
where not p.hidden;

create view public.public_rating_history as
select rh.person_id, rh.hackathon_id, rh.ends_on, rh.score_before, rh.score_after
from public.rating_history rh
join public.people p on p.id = rh.person_id
join public.public_hackathons h on h.id = rh.hackathon_id
where not p.hidden;

create view public.public_hackathon_strength as
select s.* from public.hackathon_strength s
join public.public_hackathons h on h.id = s.hackathon_id;

create view public.public_series_strength as
select s.* from public.series_strength s;

create view public.public_pair_synergy as
select s.* from public.pair_synergy s
join public.people a on a.id = s.person_a
join public.people b on b.id = s.person_b
where not a.hidden and not b.hidden;

create view public.public_school_ratings as
select s.* from public.school_ratings s;

grant select on
  public.public_hackathons, public.public_people, public.public_accounts, public.public_schools,
  public.public_event_series, public.public_projects, public.public_prizes_won,
  public.public_project_members, public.public_ratings, public.public_rating_history,
  public.public_hackathon_strength, public.public_series_strength, public.public_pair_synergy,
  public.public_school_ratings
to anon, authenticated;

