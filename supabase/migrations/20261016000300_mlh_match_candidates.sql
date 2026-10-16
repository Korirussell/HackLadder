-- The matcher's top Devpost candidates for each MLH event, so /admin/mlh can offer them as
-- one-click choices instead of asking for a subdomain. Written by `hl mlh match`; each item is
-- {hackathon_id, slug, title, ends_on, score, days, name_match: exact | contains | fuzzy}.

alter table public.mlh_event_matches
  add column candidates jsonb not null default '[]'
    check (jsonb_typeof(candidates) = 'array');

-- Same view, with the candidates appended (create or replace can only add columns at the end).
create or replace view public.mlh_match_review as
select e.id as mlh_event_id, e.name as mlh_name, e.season, e.starts_at, e.ends_at, e.format,
       e.location, e.website_url, e.is_high_school,
       m.status, m.score, m.note, m.hackathon_id,
       h.slug as hackathon_slug, h.title as hackathon_title, h.ends_on as hackathon_ends_on,
       coalesce(m.candidates, '[]') as candidates
from public.mlh_events e
left join public.mlh_event_matches m on m.mlh_event_id = e.id
left join public.hackathons h on h.id = m.hackathon_id
where current_user not in ('anon', 'authenticated') or (select public.is_admin());
