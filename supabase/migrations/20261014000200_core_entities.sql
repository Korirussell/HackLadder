-- Core entities (CLAUDE.md §7.3). Source-derived rows carry (source, source_id) so a future
-- native platform can use source = 'native' (§7.9). Devpost-only fields live in side tables.

create table public.schools (
  id         bigint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  aliases    text[] not null default '{}',
  country    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_series (
  id         bigint generated always as identity primary key,
  slug       text not null unique,              -- e.g. treehacks
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hackathons (
  id                bigint generated always as identity primary key,
  source            text not null default 'devpost',
  source_id         text not null,              -- Devpost hackathon id
  slug              text not null unique,       -- our URL key: /e/[slug]
  title             text not null,
  url               text not null,
  organization      text,
  location          text,
  is_online         boolean not null default false,
  starts_on         date,
  ends_on           date,                       -- orders the rating replay
  registrations     integer check (registrations >= 0),
  prize_total_usd   integer check (prize_total_usd >= 0),  -- null when not in dollars
  themes            jsonb not null default '[]',
  is_mlh            boolean not null default false,
  is_high_school    boolean not null default false,
  series_id         bigint references public.event_series (id) on delete set null,
  winners_announced boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source, source_id)
);
create index hackathons_ends_on_idx on public.hackathons (ends_on);
create index hackathons_series_idx on public.hackathons (series_id);

create table public.hackathons_devpost_meta (
  hackathon_id bigint primary key references public.hackathons (id) on delete cascade,
  invite_only  boolean not null default false,
  open_state   text
);

-- Manual series assignments that override series_key() (§7.3).
create table public.series_overrides (
  hackathon_id bigint primary key references public.hackathons (id) on delete cascade,
  series_id    bigint not null references public.event_series (id) on delete cascade,
  note         text,
  created_at   timestamptz not null default now()
);

-- Admin-editable exclusions on top of automatic high-school detection (§9.1).
create table public.excluded_hackathons (
  hackathon_id bigint primary key references public.hackathons (id) on delete cascade,
  reason       text not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- One row per human. Entity resolution maps accounts to people (§7.5).
create table public.people (
  id                 bigint generated always as identity primary key,
  slug               text not null unique,       -- our URL key: /h/[slug]
  display_name       text not null,
  school_id          bigint references public.schools (id) on delete set null,
  claimed_by         uuid unique references auth.users (id) on delete set null,
  claimed_at         timestamptz,
  hidden             boolean not null default false,
  linkedin_url       text,                       -- owner-supplied only, never scraped (§9.3)
  github_url         text,
  website_url        text,
  bio                text,
  open_to_recruiters boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((claimed_by is null) = (claimed_at is null))
);
create index people_school_idx on public.people (school_id);

-- One row per source account (a Devpost username).
create table public.accounts (
  id           bigint generated always as identity primary key,
  source       text not null default 'devpost',
  source_id    text not null,                    -- Devpost username
  display_name text not null,
  school_raw   text,
  location_raw text,
  person_id    bigint references public.people (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source, source_id)
);
create index accounts_person_idx on public.accounts (person_id);

-- A project's entry in one hackathon. One Devpost project can be submitted to many
-- hackathons with different prizes at each, so the key includes hackathon_id (§15).
create table public.projects (
  id                bigint generated always as identity primary key,
  source            text not null default 'devpost',
  source_id         text not null,              -- Devpost project slug
  hackathon_id      bigint not null references public.hackathons (id) on delete cascade,
  title             text not null,
  tagline           text,
  is_winner         boolean not null default false,
  built_with        text[] not null default '{}',
  description       text,
  anonymous_members smallint not null default 0 check (anonymous_members >= 0),  -- private/deleted seats
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source, source_id, hackathon_id)
);
create index projects_hackathon_idx on public.projects (hackathon_id);

create table public.prizes_won (
  project_id bigint not null references public.projects (id) on delete cascade,
  prize_name text not null,                      -- raw name, so tiers can be re-derived
  tier       smallint not null check (tier between 1 and 5),  -- 5 = not a placement (§6.5)
  primary key (project_id, prize_name)
);

create table public.project_members (
  project_id bigint not null references public.projects (id) on delete cascade,
  account_id bigint not null references public.accounts (id) on delete cascade,
  primary key (project_id, account_id)
);
create index project_members_account_idx on public.project_members (account_id);

-- Possible duplicate accounts, shown to a person when they claim (§7.5). Never auto-merged.
create table public.merge_candidates (
  account_a  bigint not null references public.accounts (id) on delete cascade,
  account_b  bigint not null references public.accounts (id) on delete cascade,
  score      real not null,
  reasons    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (account_a, account_b),
  check (account_a < account_b)
);

create trigger set_updated_at before update on public.schools
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.event_series
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.hackathons
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.people
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
