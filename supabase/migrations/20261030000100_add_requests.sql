-- "Add me" requests (spec docs/superpowers/specs/2026-10-29-find-yourself-design.md): someone who
-- isn't found enters their Devpost username; the pipeline reads their public portfolio, queues the
-- hackathons that count, crawls and rates them, and marks the request live. Only the two functions
-- below and the pipeline (postgres) touch the table.

create table public.add_requests (
  id          bigint generated always as identity primary key,
  username    text not null check (username ~ '^[A-Za-z0-9_-]{1,40}$'),
  status      text not null default 'queued'
              check (status in ('queued', 'looking_up', 'already_here', 'crawling', 'live',
                                'nothing_counts', 'not_found', 'failed')),
  events      jsonb not null default '[]',  -- [{slug, title, ends_on, state, reason}]
  person_slug text,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index add_requests_by_username on public.add_requests (lower(username), created_at desc);
create index add_requests_open on public.add_requests (status) where status in ('queued', 'crawling');

alter table public.add_requests enable row level security;
revoke all on public.add_requests from anon, authenticated;

create function public.request_add(p_username text)
returns table (username text, status text, is_new boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  u text := btrim(p_username);
  r public.add_requests;
begin
  if u is null or u !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'add_requests_bad_username' using errcode = '22023';
  end if;
  -- One request per username a day, so reloading or sharing the status page doesn't re-crawl.
  select * into r from public.add_requests a
  where lower(a.username) = lower(u) and a.created_at > now() - interval '24 hours' and a.status <> 'failed'
  order by a.created_at desc, a.id desc limit 1;
  if found then
    return query select r.username, r.status, false;
    return;
  end if;
  if (select count(*) from public.add_requests a where a.created_at > now() - interval '24 hours') >= 200 then
    raise exception 'add_requests_busy' using errcode = '54000';
  end if;
  insert into public.add_requests (username) values (u) returning * into r;
  return query select r.username, r.status, true;
end
$$;

create function public.add_request_status(p_username text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('username', a.username, 'status', a.status, 'events', a.events,
                            'person_slug', a.person_slug, 'updated_at', a.updated_at)
  from public.add_requests a
  where lower(a.username) = lower(btrim(p_username))
  order by a.created_at desc, a.id desc
  limit 1
$$;

revoke all on function public.request_add(text), public.add_request_status(text) from public;
grant execute on function public.request_add(text), public.add_request_status(text) to anon, authenticated;
