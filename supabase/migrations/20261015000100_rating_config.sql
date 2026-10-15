-- Admin-configurable rating system (CLAUDE.md §8.7). Config is an input to the rating run,
-- like `corrections`: ratings are rebuilt from scratch with whatever is here, and each run
-- stores a snapshot of it in pipeline_runs.config_snapshot.

-- ---------------------------------------------------------------- shared row stamping
create function public.stamp_config_row() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();  -- null when the pipeline (service role) writes
  return new;
end;
$$;

-- ---------------------------------------------------------------- global settings (one row)
create table public.rating_settings (
  id                     boolean primary key default true check (id),
  default_prize_tier     smallint not null default 2 check (default_prize_tier between 1 and 5),
  provisional_min_events smallint not null default 3 check (provisional_min_events >= 1),
  inactive_after_months  smallint not null default 18 check (inactive_after_months >= 1),
  mlh_digital_counts     boolean not null default false,  -- MLH online events (Global Hack Week...)
  updated_by             uuid references auth.users (id) on delete set null,
  updated_at             timestamptz not null default now()
);
insert into public.rating_settings default values;

-- ---------------------------------------------------------------- event tiers (labels only)
create table public.event_tiers (
  code        text primary key check (code ~ '^[A-Z]{1,3}$'),
  label       text not null,
  description text,
  position    smallint not null unique
);
insert into public.event_tiers (code, label, description, position) values
  ('S', 'S tier', 'The hardest, most prestigious events', 1),
  ('A', 'A tier', 'Strong, competitive events', 2),
  ('B', 'B tier', 'Solid events', 3),
  ('C', 'C tier', 'Smaller or newer events', 4);

-- ---------------------------------------------------------------- per-hackathon scope and tier
create table public.hackathon_settings (
  hackathon_id bigint primary key references public.hackathons (id) on delete cascade,
  counts       text not null default 'auto' check (counts in ('auto', 'include', 'exclude')),
  event_tier   text references public.event_tiers (code) on update cascade on delete set null,
  note         text,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- prize tiers (§6.5)
create table public.prize_tier_rules (
  id         bigint generated always as identity primary key,
  position   integer not null,              -- first matching rule wins
  name       text not null unique,
  tier       smallint not null check (tier between 1 and 5),
  pattern    text not null,                 -- case-insensitive Python regex
  match      text not null default 'stripped' check (match in ('stripped', 'full')),
  examples   text[] not null default '{}',  -- real prize names that must land in this tier
  enabled    boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Deferred so a reorder can swap positions inside one transaction.
  constraint prize_tier_rules_position_key unique (position) deferrable initially deferred
);

create table public.prize_tier_overrides (
  hackathon_id bigint not null references public.hackathons (id) on delete cascade,
  prize_name   text not null,               -- exact raw name
  tier         smallint not null check (tier between 1 and 5),
  note         text,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (hackathon_id, prize_name)
);

-- ---------------------------------------------------------------- rank tiers (display bands)
create table public.rank_tiers (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  top_percent numeric(5, 2) check (top_percent > 0 and top_percent <= 100),  -- e.g. 1.00 = top 1%
  top_n       integer check (top_n > 0),     -- a title for the top N overall (Hall of Fame)
  position    smallint not null unique,      -- 1 = highest
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(top_percent, top_n) <= 1)
);
-- Exactly one floor tier ("everyone else") may exist.
create unique index rank_tiers_one_floor on public.rank_tiers ((true)) where top_percent is null and top_n is null;

insert into public.rank_tiers (name, top_percent, top_n, position) values
  ('Hall of Fame', null, 100, 1),
  ('Legend', 1, null, 2),
  ('Principal', 5, null, 3),
  ('Architect', 15, null, 4),
  ('Shipper', 35, null, 5),
  ('Committer', 60, null, 6),
  ('Hello World', null, null, 7);

do $$
declare t text;
begin
  foreach t in array array['rating_settings', 'hackathon_settings', 'prize_tier_rules',
                           'prize_tier_overrides', 'rank_tiers'] loop
    execute format('create trigger stamp_config_row before insert or update on public.%I
                    for each row execute function public.stamp_config_row()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- change log
create table public.config_changes (
  id         bigint generated always as identity primary key,
  table_name text not null,
  operation  text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_row    jsonb,
  new_row    jsonb,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index config_changes_changed_at_idx on public.config_changes (changed_at desc);

-- Security definer: admins can't write the log directly, only through their edits.
create function public.log_config_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.config_changes (table_name, operation, old_row, new_row, changed_by)
  values (tg_table_name, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['rating_settings', 'event_tiers', 'hackathon_settings', 'prize_tier_rules',
                           'prize_tier_overrides', 'rank_tiers'] loop
    execute format('create trigger log_config_change after insert or update or delete on public.%I
                    for each row execute function public.log_config_change()', t);
  end loop;
end;
$$;

-- Each rating run records exactly which config produced it.
alter table public.pipeline_runs add column config_snapshot jsonb;

-- ---------------------------------------------------------------- access
do $$
declare t text;
begin
  foreach t in array array['rating_settings', 'event_tiers', 'hackathon_settings', 'prize_tier_rules',
                           'prize_tier_overrides', 'rank_tiers', 'config_changes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['rating_settings', 'event_tiers', 'hackathon_settings', 'prize_tier_rules',
                           'prize_tier_overrides', 'rank_tiers'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "admins manage" on public.%I for all to authenticated
                    using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end;
$$;

grant select on public.config_changes to authenticated;
create policy "admins read the change log" on public.config_changes
  for select to authenticated using ((select public.is_admin()));

revoke execute on function public.stamp_config_row() from public, anon, authenticated;
revoke execute on function public.log_config_change() from public, anon, authenticated;

-- ---------------------------------------------------------------- which hackathons count
-- The one place the scope rule lives; the admin page and the rating pipeline both read it.
-- Rows are visible to admins and to direct database roles (the pipeline), never to anon.
create view public.hackathon_scope as
select h.id as hackathon_id, h.slug, h.title, h.ends_on, h.is_mlh, h.is_online, h.is_high_school,
       coalesce(s.counts, 'auto') as counts,
       s.event_tier,
       s.note,
       case
         when h.is_high_school or x.hackathon_id is not null then false
         when s.counts = 'include' then true
         when s.counts = 'exclude' then false
         else h.is_mlh and (not h.is_online or rs.mlh_digital_counts)
       end as is_rated,
       case
         when h.is_high_school then 'high-school event (never counts)'
         when x.hackathon_id is not null then 'excluded: ' || x.reason
         when s.counts = 'include' then 'included by an admin'
         when s.counts = 'exclude' then 'excluded by an admin'
         when not h.is_mlh then 'auto: not an MLH member event'
         when h.is_online and not rs.mlh_digital_counts then 'auto: MLH online event'
         else 'auto: in-person MLH member event'
       end as reason
from public.hackathons h
cross join public.rating_settings rs
left join public.hackathon_settings s on s.hackathon_id = h.id
left join public.excluded_hackathons x on x.hackathon_id = h.id
where current_user not in ('anon', 'authenticated') or (select public.is_admin());

grant select on public.hackathon_scope to authenticated;

-- ---------------------------------------------------------------- public labels
create view public.public_rank_tiers as
select name, top_percent, top_n, position from public.rank_tiers;

create view public.public_event_tiers as
select code, label, description, position from public.event_tiers;

grant select on public.public_rank_tiers, public.public_event_tiers to anon, authenticated;

-- Event tier badges on public event pages (labels only; never a rating multiplier).
create or replace view public.public_hackathons as
select h.id, h.slug, h.title, h.url, h.organization, h.location, h.is_online,
       h.starts_on, h.ends_on, h.registrations, h.prize_total_usd, h.themes,
       h.is_mlh, h.series_id, h.winners_announced,
       s.event_tier
from public.hackathons h
left join public.hackathon_settings s on s.hackathon_id = h.id
where not h.is_high_school
  and not exists (select 1 from public.excluded_hackathons x where x.hackathon_id = h.id);

-- ---------------------------------------------------------------- reordering prize rules
-- Swaps a rule with its neighbour in one transaction (positions are unique, checked at commit).
-- Security invoker: RLS still decides whether the caller may update the rules.
create function public.move_prize_rule(rule_id bigint, direction integer) returns void
language plpgsql
set search_path = ''
as $$
declare
  current_pos integer;
  other_id bigint;
  other_pos integer;
begin
  select position into current_pos from public.prize_tier_rules where id = rule_id;
  if current_pos is null then
    raise exception 'no prize rule with id %', rule_id;
  end if;
  select id, position into other_id, other_pos
  from public.prize_tier_rules
  where (direction < 0 and position < current_pos) or (direction > 0 and position > current_pos)
  order by case when direction < 0 then -position else position end
  limit 1;
  if other_id is null then
    return;  -- already first or last
  end if;
  update public.prize_tier_rules set position = other_pos where id = rule_id;
  update public.prize_tier_rules set position = current_pos where id = other_id;
end;
$$;

revoke execute on function public.move_prize_rule(bigint, integer) from public, anon;
grant execute on function public.move_prize_rule(bigint, integer) to authenticated;
