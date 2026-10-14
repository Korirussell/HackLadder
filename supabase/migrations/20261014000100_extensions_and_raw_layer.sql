-- Extensions, shared helpers and the raw crawl layer (CLAUDE.md §6.2, §7.2, §12).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- New tables are private until a migration grants access explicitly. Supabase's default
-- grants every table in `public` to anon and authenticated; we opt in instead (§7.7).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- unaccent() is only STABLE (it reads a dictionary), so wrap it to use in index expressions.
create function public.f_unaccent(text) returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- One row per fetched URL. The page itself is gzipped in the `raw-pages` storage bucket.
create table public.raw_pages_index (
  url_hash       text primary key,          -- sha256 of the URL
  url            text not null,
  kind           text not null check (kind in ('hackathon_list', 'gallery', 'project', 'user', 'mlh_season')),
  fetched_at     timestamptz not null,
  status         smallint not null,
  storage_path   text,                      -- null when the response wasn't stored (non-200)
  parser_version text                       -- last parser version run over this page
);
create index raw_pages_index_kind_fetched_idx on public.raw_pages_index (kind, fetched_at);

create table public.crawl_checkpoints (
  job        text primary key,
  cursor     jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.crawl_failures (
  url             text primary key,
  kind            text not null,
  status          smallint,                 -- null for network errors
  error           text not null,
  attempts        integer not null default 1 check (attempts > 0),
  last_attempt_at timestamptz not null default now()
);

create table public.pipeline_runs (
  id             bigint generated always as identity primary key,
  job            text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  pages_fetched  integer not null default 0,
  failures       integer not null default 0,
  events_added   integer not null default 0,
  people_rated   integer not null default 0,
  summary        jsonb not null default '{}'
);
