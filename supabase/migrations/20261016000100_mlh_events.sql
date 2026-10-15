-- MLH events and their matches to Devpost hackathons (CLAUDE.md §6.1, §8.7, §9).
-- `hl mlh crawl` fills mlh_events; `hl mlh match` suggests matches; admins confirm or reject
-- uncertain ones. hackathons.is_mlh follows the accepted matches via a trigger.

create table public.mlh_events (
  id                bigint generated always as identity primary key,
  source_id         text not null unique,        -- MLH event UUID
  slug              text not null,
  name              text not null,
  season            text not null,               -- MLH season name, e.g. 2025 (July-June)
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  format            text not null,               -- physical | digital | hybrid_physical
  location          text,
  country           text,
  website_url       text,
  is_high_school    boolean not null default false,
  underserved_types text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index mlh_events_ends_at_idx on public.mlh_events (ends_at);
create trigger set_updated_at before update on public.mlh_events
  for each row execute function public.set_updated_at();

create table public.mlh_event_matches (
  mlh_event_id bigint primary key references public.mlh_events (id) on delete cascade,
  hackathon_id bigint references public.hackathons (id) on delete cascade,  -- null: no Devpost event
  score        real,
  status       text not null check (status in ('auto', 'suggested', 'confirmed', 'rejected', 'unmatched')),
  note         text,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  check (hackathon_id is not null or status in ('rejected', 'unmatched'))
);
create index mlh_event_matches_hackathon_idx on public.mlh_event_matches (hackathon_id);

create trigger stamp_config_row before insert or update on public.mlh_event_matches
  for each row execute function public.stamp_config_row();
create trigger log_config_change after insert or update or delete on public.mlh_event_matches
  for each row execute function public.log_config_change();

-- Keep hackathons.is_mlh (and the high-school flag) in step with accepted matches.
create function public.sync_mlh_flags() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare ids bigint[];
begin
  ids := array_remove(array[
    case when tg_op <> 'INSERT' then old.hackathon_id end,
    case when tg_op <> 'DELETE' then new.hackathon_id end
  ], null);
  update public.hackathons h
  set is_mlh = exists (
        select 1 from public.mlh_event_matches m
        where m.hackathon_id = h.id and m.status in ('auto', 'confirmed')),
      -- Never cleared here: high school can also come from keywords, and when in doubt we exclude (§9).
      is_high_school = h.is_high_school or exists (
        select 1 from public.mlh_event_matches m join public.mlh_events e on e.id = m.mlh_event_id
        where m.hackathon_id = h.id and m.status in ('auto', 'confirmed') and e.is_high_school)
  where h.id = any (ids);
  return null;
end;
$$;

create trigger sync_mlh_flags after insert or update or delete on public.mlh_event_matches
  for each row execute function public.sync_mlh_flags();
revoke execute on function public.sync_mlh_flags() from public, anon, authenticated;

-- Access: admins read events and manage matches; the pipeline uses a direct connection.
alter table public.mlh_events enable row level security;
alter table public.mlh_event_matches enable row level security;
revoke all on public.mlh_events, public.mlh_event_matches from anon, authenticated;
grant select on public.mlh_events to authenticated;
grant select, insert, update, delete on public.mlh_event_matches to authenticated;
create policy "admins read MLH events" on public.mlh_events
  for select to authenticated using ((select public.is_admin()));
create policy "admins manage MLH matches" on public.mlh_event_matches
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- What the admin review page lists: each MLH event with its match and the matched hackathon.
create view public.mlh_match_review as
select e.id as mlh_event_id, e.name as mlh_name, e.season, e.starts_at, e.ends_at, e.format,
       e.location, e.website_url, e.is_high_school,
       m.status, m.score, m.note, m.hackathon_id,
       h.slug as hackathon_slug, h.title as hackathon_title, h.ends_on as hackathon_ends_on
from public.mlh_events e
left join public.mlh_event_matches m on m.mlh_event_id = e.id
left join public.hackathons h on h.id = m.hackathon_id
where current_user not in ('anon', 'authenticated') or (select public.is_admin());

grant select on public.mlh_match_review to authenticated;
