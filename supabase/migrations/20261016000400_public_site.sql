-- The public site's read surface, themes, and the bio-code flows (CLAUDE.md §4.7, §7.7, §10, §11).
--
-- Every page reads through one security-definer function here, so the privacy rules (hidden
-- people, high-school and excluded events, §9) stay in the views and functions of the database,
-- never in page code. All of them are stable, take only plain parameters, and are granted to anon.

-- ---------------------------------------------------------------- themes (§4.7)
alter table public.people
  add column ui_theme text check (ui_theme in ('paper', 'sumi', 'sakura', 'midnight')),
  add column profile_theme text check (profile_theme in ('paper', 'sumi', 'sakura', 'midnight'));

grant update (ui_theme, profile_theme) on public.people to authenticated;

-- Same view with profile_theme appended (create or replace can only add columns at the end).
-- Visitors see a profile in its owner's theme only once it's claimed.
create or replace view public.public_people as
select p.id, p.slug, p.display_name, p.school_id,
       p.claimed_by is not null as is_claimed,
       case when p.claimed_by is not null then p.linkedin_url end as linkedin_url,
       case when p.claimed_by is not null then p.github_url end as github_url,
       case when p.claimed_by is not null then p.website_url end as website_url,
       case when p.claimed_by is not null then p.bio end as bio,
       case when p.claimed_by is not null then p.profile_theme end as profile_theme
from public.people p
where not p.hidden;

-- ---------------------------------------------------------------- shared helpers
-- The rank tier for a place on the live board (§8.7): the top-N title first, then percentile bands.
create function public.rank_tier(p_rank bigint, p_top_percent real) returns text
language sql stable security definer
set search_path = ''
as $$
  select t.name from public.rank_tiers t
  where (t.top_n is not null and p_rank is not null and p_rank <= t.top_n)
     or (t.top_percent is not null and p_top_percent is not null and p_top_percent <= t.top_percent)
     or (t.top_n is null and t.top_percent is null)
  order by t.position
  limit 1
$$;

-- The live leaderboard: non-provisional, not hidden, active within rating_settings' window.
create view public.live_board as
select r.person_id, r.score, r.events, r.placements, r.grand_prizes, r.percentile, r.last_event_on,
       row_number() over (order by r.score desc, r.person_id) as rank
from public.ratings r
join public.people p on p.id = r.person_id
cross join public.rating_settings rs
where not r.provisional
  and not p.hidden
  and (r.last_event_on is null
       or r.last_event_on >= current_date - make_interval(months => rs.inactive_after_months::int));
revoke all on public.live_board from anon, authenticated;

-- Rating change over the last 30 days ("this month").
create function public.month_change(p_person bigint) returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(rh.score_after - rh.score_before), 0)::int
  from public.rating_history rh
  where rh.person_id = p_person and rh.ends_on > current_date - 30
$$;

-- A person's hardest placement (tier 1-4) at a public event: the "best win" on the ladder.
create function public.best_win(p_person bigint)
returns table (event_slug text, event_title text, prize_name text, win_odds real)
language sql stable security definer
set search_path = ''
as $$
  select h.slug, h.title, w.prize_name, hs.win_odds
  from public.accounts a
  join public.project_members m on m.account_id = a.id
  join public.projects pr on pr.id = m.project_id
  join public.public_hackathons h on h.id = pr.hackathon_id
  join public.prizes_won w on w.project_id = pr.id and w.tier <= 4
  left join public.hackathon_strength hs on hs.hackathon_id = h.id
  where a.person_id = p_person
  order by hs.event_rating desc nulls last, w.tier, h.ends_on desc nulls last
  limit 1
$$;

-- ---------------------------------------------------------------- site-wide
create function public.site_stats()
returns table (hackers bigint, rated_hackers bigint, hackathons bigint, rated_events bigint,
               updated_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select (select count(*) from public.people where not hidden),
         (select count(*) from public.live_board),
         (select count(*) from public.public_hackathons),
         (select count(*) from public.public_hackathon_strength),
         (select max(finished_at) from public.pipeline_runs where job = 'rate' and status = 'succeeded')
$$;

-- The menu-bar countdown (§4.3): the next MLH member event that hasn't started. MLH's own
-- high-school flag and the §9 keywords keep minors' events out.
create function public.next_event()
returns table (name text, starts_at timestamptz, ends_at timestamptz, location text, website_url text)
language sql stable security definer
set search_path = ''
as $$
  select e.name, e.starts_at, e.ends_at, e.location, e.website_url
  from public.mlh_events e
  where e.starts_at > now()
    and not e.is_high_school
    and e.name !~* '(high school|middle school|secondary|\mhs\M|for teens)'
  order by e.starts_at
  limit 1
$$;

create function public.upcoming_events(p_limit integer default 60)
returns table (name text, starts_at timestamptz, ends_at timestamptz, format text, location text,
               website_url text)
language sql stable security definer
set search_path = ''
as $$
  select e.name, e.starts_at, e.ends_at, e.format, e.location, e.website_url
  from public.mlh_events e
  where e.ends_at > now()
    and not e.is_high_school
    and e.name !~* '(high school|middle school|secondary|\mhs\M|for teens)'
  order by e.starts_at
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

-- ---------------------------------------------------------------- hackers
create function public.ladder(p_limit integer default 50, p_offset integer default 0,
                              p_school text default null)
returns table (rank bigint, total bigint, slug text, display_name text, school_name text,
               school_slug text, score integer, events integer, placements integer,
               month_change integer, tier text, is_claimed boolean, best_event_slug text,
               best_event_title text, best_prize text)
language sql stable security definer
set search_path = ''
as $$
  with page as (
    select b.*, count(*) over () as total
    from public.live_board b
    join public.people p on p.id = b.person_id
    left join public.schools s on s.id = p.school_id
    where p_school is null or s.slug = p_school
    order by b.rank
    limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select pg.rank, pg.total, p.slug, p.display_name, s.name, s.slug, pg.score, pg.events,
         pg.placements, public.month_change(pg.person_id), public.rank_tier(pg.rank, pg.percentile),
         p.claimed_by is not null, bw.event_slug, bw.event_title, bw.prize_name
  from page pg
  join public.people p on p.id = pg.person_id
  left join public.schools s on s.id = p.school_id
  left join lateral public.best_win(pg.person_id) bw on true
  order by pg.rank
$$;

create function public.provisional_count() returns bigint
language sql stable security definer
set search_path = ''
as $$
  select count(*) from public.ratings r join public.people p on p.id = r.person_id
  where r.provisional and not p.hidden
$$;

-- Everything /h/[slug] shows, or null for a hidden or unknown person (the page 404s).
create function public.hacker_page(p_slug text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with person as (
    select p.* from public.people p where p.slug = p_slug and not p.hidden
  ),
  entries as (
    -- One row per event entered: the best-placed project there (§8.1 dedupe_people).
    select distinct on (h.id)
           h.id as hackathon_id, h.slug, h.title, h.ends_on, pr.title as project, pr.source_id,
           w.prize_name, w.tier
    from person
    join public.accounts a on a.person_id = person.id
    join public.project_members m on m.account_id = a.id
    join public.projects pr on pr.id = m.project_id
    join public.public_hackathons h on h.id = pr.hackathon_id
    left join lateral (
      select w.prize_name, w.tier from public.prizes_won w
      where w.project_id = pr.id order by w.tier, w.prize_name limit 1
    ) w on true
    order by h.id, w.tier nulls last
  ),
  mates as (
    select pm.person_id, pm.person_slug, pm.display_name, count(distinct pr.hackathon_id) as events
    from person
    join public.accounts a on a.person_id = person.id
    join public.project_members m on m.account_id = a.id
    join public.public_projects pr on pr.id = m.project_id
    join public.public_project_members pm on pm.project_id = pr.id
    where pm.person_id is distinct from person.id and pm.person_id is not null
    group by pm.person_id, pm.person_slug, pm.display_name
    order by events desc, pm.display_name
    limit 6
  ),
  standing as (
    select x.rank, x.percentile, x.size from (
      select b.person_id, b.rank, b.percentile, count(*) over () as size from public.live_board b
    ) x
    where x.person_id = (select id from person)
  )
  select jsonb_build_object(
    'slug', p.slug,
    'display_name', p.display_name,
    'is_claimed', p.claimed_by is not null,
    'profile_theme', case when p.claimed_by is not null then p.profile_theme end,
    'bio', case when p.claimed_by is not null then p.bio end,
    'links', jsonb_strip_nulls(jsonb_build_object(
      'linkedin', case when p.claimed_by is not null then p.linkedin_url end,
      'github', case when p.claimed_by is not null then p.github_url end,
      'website', case when p.claimed_by is not null then p.website_url end)),
    'school', (select jsonb_build_object('slug', s.slug, 'name', s.name)
               from public.schools s where s.id = p.school_id),
    'usernames', coalesce((select jsonb_agg(a.source_id order by a.source_id)
                           from public.accounts a where a.person_id = p.id and a.source = 'devpost'),
                          '[]'),
    'rating', (select jsonb_build_object(
                 'score', r.score, 'events', r.events, 'placements', r.placements,
                 'grand_prizes', r.grand_prizes, 'percentile', r.percentile,
                 'provisional', r.provisional, 'last_event_on', r.last_event_on,
                 'mu', r.mu, 'sigma', r.sigma)
               from public.ratings r where r.person_id = p.id),
    'rank', (select s.rank from standing s),
    'board_size', coalesce((select s.size from standing s), (select count(*) from public.live_board)),
    'tier', (select public.rank_tier(s.rank, s.percentile) from standing s),
    'month_change', public.month_change(p.id),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
                           'ends_on', rh.ends_on, 'score', rh.score_after, 'event', h.title)
                           order by rh.ends_on, rh.hackathon_id)
                         from public.rating_history rh
                         join public.public_hackathons h on h.id = rh.hackathon_id
                         where rh.person_id = p.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                          'slug', e.slug, 'title', e.title, 'ends_on', e.ends_on,
                          'project', e.project, 'project_slug', e.source_id,
                          'prize', e.prize_name, 'tier', e.tier,
                          'change', rh.score_after - rh.score_before)
                          order by e.ends_on desc nulls last, e.title)
                        from entries e
                        left join public.rating_history rh
                          on rh.person_id = p.id and rh.hackathon_id = e.hackathon_id), '[]'),
    'teammates', coalesce((select jsonb_agg(jsonb_build_object(
                             'slug', m.person_slug, 'name', m.display_name, 'events', m.events)
                             order by m.events desc, m.display_name)
                           from mates m), '[]'),
    'best_duo', (select jsonb_build_object('slug', o.slug, 'name', o.display_name,
                                           'events', d.events_together, 'score', d.score)
                 from public.pair_synergy d
                 join public.people o on o.id = case when d.person_a = p.id then d.person_b else d.person_a end
                 where (d.person_a = p.id or d.person_b = p.id) and not o.hidden
                 order by d.score desc nulls last limit 1),
    'toughest_win', (select jsonb_build_object('slug', bw.event_slug, 'title', bw.event_title,
                                               'prize', bw.prize_name, 'win_odds', bw.win_odds)
                     from public.best_win(p.id) bw),
    'active_since', (select min(e.ends_on) from entries e)
  )
  from person p
$$;

-- ---------------------------------------------------------------- events
create function public.event_board(p_limit integer default 50, p_offset integer default 0,
                                   p_year integer default null, p_online boolean default null,
                                   p_min_teams integer default null)
returns table (rank bigint, total bigint, slug text, title text, location text, is_online boolean,
               ends_on date, teams integer, elite integer, win_odds real, event_rating real,
               event_tier text, series_slug text)
language sql stable security definer
set search_path = ''
as $$
  with ranked as (
    select h.*, s.field_size, s.elite_count, s.win_odds, s.event_rating,
           row_number() over (order by s.event_rating desc nulls last, h.id) as rank
    from public.public_hackathons h
    join public.hackathon_strength s on s.hackathon_id = h.id
  )
  select r.rank, count(*) over (), r.slug, r.title, r.location, r.is_online, r.ends_on,
         r.field_size, r.elite_count, r.win_odds, r.event_rating, r.event_tier, es.slug
  from ranked r
  left join public.event_series es on es.id = r.series_id
  where (p_year is null or extract(year from r.ends_on) = p_year)
    and (p_online is null or r.is_online = p_online)
    and (p_min_teams is null or r.field_size >= p_min_teams)
  order by r.rank
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.series_board(p_limit integer default 50)
returns table (rank bigint, slug text, name text, editions integer, rating real,
               best_slug text, best_title text)
language sql stable security definer
set search_path = ''
as $$
  select row_number() over (order by s.rating desc nulls last, es.id), es.slug, es.name,
         s.editions, s.rating, h.slug, h.title
  from public.series_strength s
  join public.event_series es on es.id = s.series_id
  left join public.public_hackathons h on h.id = s.best_hackathon_id
  order by s.rating desc nulls last, es.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- Everything /e/[slug] shows, or null for an unknown, high-school or excluded event.
create function public.event_page(p_slug text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with ev as (select h.* from public.public_hackathons h where h.slug = p_slug),
  winners as (
    select pr.id, pr.title, pr.source_id, pr.tagline, min(w.tier) as tier,
           array_agg(w.prize_name order by w.tier, w.prize_name) as prizes
    from ev
    join public.projects pr on pr.hackathon_id = ev.id
    join public.prizes_won w on w.project_id = pr.id and w.tier <= 4
    group by pr.id
  )
  select jsonb_build_object(
    'slug', ev.slug, 'title', ev.title, 'url', ev.url, 'organization', ev.organization,
    'location', ev.location, 'is_online', ev.is_online, 'starts_on', ev.starts_on,
    'ends_on', ev.ends_on, 'registrations', ev.registrations,
    'prize_total_usd', ev.prize_total_usd, 'is_mlh', ev.is_mlh, 'event_tier', ev.event_tier,
    'winners_announced', ev.winners_announced,
    'projects', (select count(*) from public.projects pr where pr.hackathon_id = ev.id),
    'prizes', (select count(*) from public.prizes_won w
               join public.projects pr on pr.id = w.project_id
               where pr.hackathon_id = ev.id and w.tier <= 4),
    'strength', (select jsonb_build_object(
                   'teams', s.field_size, 'field_mean', s.field_mean, 'top_field', s.top_field,
                   'elite', s.elite_count, 'win_odds', s.win_odds, 'event_rating', s.event_rating,
                   'judging', s.judging_corr)
                 from public.hackathon_strength s where s.hackathon_id = ev.id),
    'rank', (select b.rank from (
               select s.hackathon_id, row_number() over (order by s.event_rating desc nulls last, h.id) as rank
               from public.hackathon_strength s join public.public_hackathons h on h.id = s.hackathon_id
             ) b where b.hackathon_id = ev.id),
    'series', (select jsonb_build_object(
                 'slug', es.slug, 'name', es.name,
                 'editions', coalesce((select jsonb_agg(jsonb_build_object(
                                         'slug', o.slug, 'title', o.title, 'ends_on', o.ends_on)
                                         order by o.ends_on desc nulls last)
                                       from public.public_hackathons o where o.series_id = es.id), '[]'))
               from public.event_series es where es.id = ev.series_id),
    'winners', coalesce((select jsonb_agg(jsonb_build_object(
                           'title', w.title, 'project_slug', w.source_id, 'tagline', w.tagline,
                           'tier', w.tier, 'prizes', to_jsonb(w.prizes),
                           'team_rating', (select round(avg(r.score))::int
                                           from public.project_members m
                                           join public.accounts a on a.id = m.account_id
                                           join public.ratings r on r.person_id = a.person_id
                                           where m.project_id = w.id),
                           'members', coalesce((select jsonb_agg(jsonb_build_object(
                                                   'slug', pm.person_slug, 'name', pm.display_name)
                                                   order by pm.display_name)
                                                 from public.public_project_members pm
                                                 where pm.project_id = w.id), '[]'))
                           order by w.tier, w.title)
                         from winners w), '[]')
  )
  from ev
$$;

create function public.series_page(p_slug text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', es.slug, 'name', es.name,
    'strength', (select jsonb_build_object('editions', s.editions, 'rating', s.rating,
                                           'best_slug', b.slug, 'best_title', b.title)
                 from public.series_strength s
                 left join public.public_hackathons b on b.id = s.best_hackathon_id
                 where s.series_id = es.id),
    'editions', coalesce((select jsonb_agg(jsonb_build_object(
                            'slug', h.slug, 'title', h.title, 'ends_on', h.ends_on,
                            'location', h.location, 'teams', st.field_size, 'elite', st.elite_count,
                            'win_odds', st.win_odds, 'event_rating', st.event_rating)
                            order by h.ends_on desc nulls last)
                          from public.public_hackathons h
                          left join public.hackathon_strength st on st.hackathon_id = h.id
                          where h.series_id = es.id), '[]')
  )
  from public.event_series es
  where es.slug = p_slug
    and exists (select 1 from public.public_hackathons h where h.series_id = es.id)
$$;

-- ---------------------------------------------------------------- schools
create function public.school_board(p_season text default null)
returns table (rank integer, slug text, name text, rating real, members integer, season text)
language sql stable security definer
set search_path = ''
as $$
  with season as (
    select coalesce(p_season, (select max(sr.season) from public.school_ratings sr)) as s
  )
  select sr.rank, sc.slug, sc.name, sr.top10_avg, sr.members_rated, sr.season
  from public.school_ratings sr
  join public.schools sc on sc.id = sr.school_id
  cross join season
  where sr.season = season.s
  order by sr.rank
$$;

create function public.school_seasons() returns setof text
language sql stable security definer
set search_path = ''
as $$ select distinct season from public.school_ratings order by season desc $$;

create function public.school_page(p_slug text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with sc as (select * from public.schools where slug = p_slug),
  latest as (
    select sr.* from public.school_ratings sr, sc
    where sr.school_id = sc.id order by sr.season desc limit 1
  )
  select jsonb_build_object(
    'slug', sc.slug, 'name', sc.name, 'country', sc.country,
    'members', (select count(*) from public.people p where p.school_id = sc.id and not p.hidden),
    'rating', (select jsonb_build_object('season', l.season, 'rating', l.top10_avg,
                                         'members_rated', l.members_rated, 'rank', l.rank)
               from latest l),
    'rivals', coalesce((select jsonb_agg(jsonb_build_object(
                          'slug', o.slug, 'name', o.name, 'rank', sr.rank, 'rating', sr.top10_avg)
                          order by sr.rank)
                        from latest l
                        join public.school_ratings sr on sr.season = l.season
                          and sr.school_id <> l.school_id and abs(sr.rank - l.rank) <= 2
                        join public.schools o on o.id = sr.school_id), '[]'),
    'recent_wins', coalesce((select jsonb_agg(r.x order by r.ends_on desc nulls last) from (
                               select d.x, d.ends_on from (
                                 select distinct on (h.id, p.id) h.ends_on, jsonb_build_object(
                                   'event_slug', h.slug, 'event', h.title, 'ends_on', h.ends_on,
                                   'prize', w.prize_name, 'person_slug', p.slug,
                                   'person', p.display_name) as x
                                 from public.people p
                                 join public.accounts a on a.person_id = p.id
                                 join public.project_members m on m.account_id = a.id
                                 join public.projects pr on pr.id = m.project_id
                                 join public.public_hackathons h on h.id = pr.hackathon_id
                                 join public.prizes_won w on w.project_id = pr.id and w.tier <= 4
                                 where p.school_id = sc.id and not p.hidden
                                 order by h.id, p.id, w.tier
                               ) d
                               order by d.ends_on desc nulls last
                               limit 12) r), '[]')
  )
  from sc
$$;

-- ---------------------------------------------------------------- duos
create function public.duo_board(p_limit integer default 50, p_offset integer default 0)
returns table (rank bigint, a_slug text, a_name text, b_slug text, b_name text, events integer,
               placements integer, overperformance real, score real)
language sql stable security definer
set search_path = ''
as $$
  select row_number() over (order by d.score desc nulls last, d.person_a, d.person_b),
         a.slug, a.display_name, b.slug, b.display_name, d.events_together,
         d.placements_together, d.overperformance, d.score
  from public.pair_synergy d
  join public.people a on a.id = d.person_a
  join public.people b on b.id = d.person_b
  where not a.hidden and not b.hidden
  order by d.score desc nulls last, d.person_a, d.person_b
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------- sitemap
create function public.sitemap_entries()
returns table (kind text, slug text, updated_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select 'hacker', p.slug, p.updated_at from public.people p
  where not p.hidden and exists (select 1 from public.ratings r where r.person_id = p.id)
  union all
  select 'school', s.slug, s.updated_at from public.schools s
  union all
  select 'event', h.slug, null from public.public_hackathons h
  where exists (select 1 from public.hackathon_strength s where s.hackathon_id = h.id)
  union all
  select 'series', es.slug, es.updated_at from public.event_series es
  where exists (select 1 from public.series_strength s where s.series_id = es.id)
$$;

-- ---------------------------------------------------------------- bio codes (§11, §9.4)
-- Claims and "remove me" both prove control of a Devpost account by a code in its public bio.
-- The check runs here, not in the web app, so a client can't simply assert that it passed.
create extension if not exists http with schema extensions;

create table public.removal_attempts (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references public.accounts (id) on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now(),
  verified_at timestamptz,
  expires_at  timestamptz not null,
  check (expires_at > created_at)
);
create index removal_attempts_account_idx on public.removal_attempts (account_id, created_at);

-- One row per bio check, for the 5-checks-per-hour limits.
create table public.bio_checks (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('claim', 'removal')),
  user_id    uuid references auth.users (id) on delete cascade,
  account_id bigint not null references public.accounts (id) on delete cascade,
  found      boolean not null,
  checked_at timestamptz not null default now()
);
create index bio_checks_user_idx on public.bio_checks (user_id, checked_at);
create index bio_checks_account_idx on public.bio_checks (account_id, checked_at);

alter table public.removal_attempts enable row level security;
alter table public.bio_checks enable row level security;
revoke all on public.removal_attempts, public.bio_checks from anon, authenticated;

create function public.new_bio_code() returns text
language sql volatile
set search_path = ''
as $$
  select 'hl-' || upper(substr(h, 1, 4)) || '-' || upper(substr(h, 5, 2))
  from (select replace(gen_random_uuid()::text, '-', '') as h) r
$$;

-- True if the code appears in the bio paragraph of a Devpost user page (#portfolio-user-bio,
-- §6.6). Only the bio counts: project titles on the same page can be edited by teammates.
create function public.bio_has_code(p_html text, p_code text) returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(length(p_code) >= 6
    and position(upper(p_code) in
          upper(split_part(split_part(p_html, 'id="portfolio-user-bio"', 2), '</p>', 1))) > 0, false)
$$;

-- One polite fetch of https://devpost.com/<username>; null when the profile doesn't exist.
create function public.devpost_user_html(p_username text) returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  res extensions.http_response;
begin
  if p_username !~ '^[A-Za-z0-9_.-]{1,64}$' then
    raise exception 'That isn''t a Devpost username.';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '10');
  res := extensions.http((
    'GET', 'https://devpost.com/' || p_username,
    array[extensions.http_header('User-Agent', 'HackLadderBot/1.0 (+https://hackladder.com/bot)')],
    null, null)::extensions.http_request);
  if res.status = 404 then
    return null;
  end if;
  if res.status <> 200 then
    raise exception 'Devpost didn''t answer (HTTP %). Try again in a few minutes.', res.status;
  end if;
  return res.content;
end;
$$;

-- The account a username names, with its person. Usernames match case-insensitively.
create function public.account_for(p_username text)
returns table (account_id bigint, username text, display_name text, person_id bigint,
               claimed_by uuid)
language sql stable
set search_path = ''
as $$
  select a.id, a.source_id, a.display_name, a.person_id, p.claimed_by
  from public.accounts a
  join public.people p on p.id = a.person_id
  where a.source = 'devpost' and lower(a.source_id) = lower(btrim(p_username))
  limit 1
$$;

-- Step 1 of claiming: a code for this account, valid 48 hours (reused while it's valid).
create function public.start_claim(p_username text)
returns table (attempt_id bigint, code text, expires_at timestamptz, username text,
               display_name text)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  acc record;
  att record;
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;
  select * into acc from public.account_for(p_username);
  if acc.account_id is null then
    raise exception 'No Devpost account called "%" is on HackLadder yet. Check the spelling on your Devpost profile URL.', btrim(p_username);
  end if;
  if acc.claimed_by = uid then
    raise exception 'That profile is already yours.';
  end if;
  if acc.claimed_by is not null then
    raise exception 'Someone else has claimed that profile. Send a correction from the profile page and an admin will sort it out.';
  end if;
  select * into att from public.claim_attempts c
  where c.user_id = uid and c.account_id = acc.account_id and c.verified_at is null and c.expires_at > now()
  order by c.created_at desc limit 1;
  if att.id is null then
    if (select count(*) from public.claim_attempts c
        where c.user_id = uid and c.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'That''s a lot of codes in one hour. Try again later.';
    end if;
    insert into public.claim_attempts (user_id, account_id, code, expires_at)
    values (uid, acc.account_id, public.new_bio_code(), now() + interval '48 hours')
    returning * into att;
  end if;
  return query select att.id, att.code, att.expires_at, acc.username, acc.display_name;
end;
$$;

-- Step 2: check the bio once. Claims the person, or, if this user already owns a profile,
-- merges the account into it (§7.5: merges need a verified code for every account).
-- Returns claimed | merged | code_missing | profile_missing.
create function public.verify_claim(p_attempt_id bigint) returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  att record;
  html text;
  found_code boolean;
  mine bigint;
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;
  select c.id, c.code, c.expires_at, c.verified_at, a.id as account_id, a.source_id as username,
         a.person_id
  into att
  from public.claim_attempts c join public.accounts a on a.id = c.account_id
  where c.id = p_attempt_id and c.user_id = uid;
  if att.id is null then
    raise exception 'That code isn''t yours. Start the claim again.';
  end if;
  if att.verified_at is not null then
    return 'claimed';
  end if;
  if att.expires_at <= now() then
    raise exception 'That code expired. Get a new one.';
  end if;
  if (select count(*) from public.bio_checks b
      where b.user_id = uid and b.checked_at > now() - interval '1 hour') >= 5 then
    raise exception 'You''ve checked 5 times this hour. Wait an hour, then press Verify again.';
  end if;

  html := public.devpost_user_html(att.username);
  found_code := html is not null and public.bio_has_code(html, att.code);
  insert into public.bio_checks (kind, user_id, account_id, found)
  values ('claim', uid, att.account_id, found_code);
  if html is null then
    return 'profile_missing';
  end if;
  if not found_code then
    return 'code_missing';
  end if;

  update public.claim_attempts set verified_at = now() where id = att.id;
  select id into mine from public.people where claimed_by = uid;
  if mine is null then
    update public.people set claimed_by = uid, claimed_at = now()
    where id = att.person_id and claimed_by is null;
    if not found then
      raise exception 'Someone else claimed this profile first. Send a correction and an admin will sort it out.';
    end if;
    return 'claimed';
  end if;
  if mine = att.person_id then
    return 'claimed';
  end if;
  if (select claimed_by from public.people where id = att.person_id) is not null then
    raise exception 'That account belongs to someone else''s profile. Send a correction and an admin will sort it out.';
  end if;
  update public.accounts set person_id = mine where id = att.account_id;
  delete from public.people p
  where p.id = att.person_id and not exists (select 1 from public.accounts a where a.person_id = p.id);
  return 'merged';
end;
$$;

-- The signed-in user's open claim codes, so /claim can pick up where they left off.
create function public.my_claim_attempts()
returns table (attempt_id bigint, code text, expires_at timestamptz, username text,
               display_name text)
language sql stable security definer
set search_path = ''
as $$
  select c.id, c.code, c.expires_at, a.source_id, a.display_name
  from public.claim_attempts c join public.accounts a on a.id = c.account_id
  where c.user_id = auth.uid() and c.verified_at is null and c.expires_at > now()
  order by c.created_at desc
$$;

-- Possible duplicate accounts for the signed-in owner ("Are these also you?", §7.5).
create function public.my_merge_candidates()
returns table (username text, display_name text, score real)
language sql stable security definer
set search_path = ''
as $$
  select o.source_id, o.display_name, mc.score
  from public.people me
  join public.accounts mine on mine.person_id = me.id
  join public.merge_candidates mc on mine.id in (mc.account_a, mc.account_b)
  join public.accounts o on o.id = case when mc.account_a = mine.id then mc.account_b else mc.account_a end
  where me.claimed_by = auth.uid() and o.person_id is distinct from me.id
  order by mc.score desc
$$;

-- "Remove me" without an account (§9.4): a code for the username, then one bio check.
create function public.start_removal(p_username text)
returns table (code text, expires_at timestamptz, username text, display_name text)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  acc record;
  att record;
begin
  select * into acc from public.account_for(p_username);
  if acc.account_id is null then
    raise exception 'No Devpost account called "%" is on HackLadder, so there''s nothing to remove.', btrim(p_username);
  end if;
  select * into att from public.removal_attempts r
  where r.account_id = acc.account_id and r.verified_at is null and r.expires_at > now()
  order by r.created_at desc limit 1;
  if att.id is null then
    if (select count(*) from public.removal_attempts r
        where r.account_id = acc.account_id and r.created_at > now() - interval '1 hour') >= 5 then
      raise exception 'Too many codes for that username this hour. Try again later.';
    end if;
    insert into public.removal_attempts (account_id, code, expires_at)
    values (acc.account_id, public.new_bio_code(), now() + interval '48 hours')
    returning * into att;
  end if;
  return query select att.code, att.expires_at, acc.username, acc.display_name;
end;
$$;

-- Returns removed | code_missing | profile_missing.
create function public.verify_removal(p_username text, p_code text) returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  acc record;
  att record;
  html text;
  found_code boolean;
begin
  select * into acc from public.account_for(p_username);
  if acc.account_id is null then
    raise exception 'No Devpost account called "%" is on HackLadder.', btrim(p_username);
  end if;
  select * into att from public.removal_attempts r
  where r.account_id = acc.account_id and upper(r.code) = upper(btrim(p_code)) and r.expires_at > now()
  order by r.created_at desc limit 1;
  if att.id is null then
    raise exception 'That code doesn''t match or has expired. Get a new one.';
  end if;
  if att.verified_at is not null then
    return 'removed';
  end if;
  if (select count(*) from public.bio_checks b
      where b.account_id = acc.account_id and b.kind = 'removal'
        and b.checked_at > now() - interval '1 hour') >= 5 then
    raise exception 'That username was checked 5 times this hour. Wait an hour, then try again.';
  end if;

  html := public.devpost_user_html(acc.username);
  found_code := html is not null and public.bio_has_code(html, att.code);
  insert into public.bio_checks (kind, user_id, account_id, found)
  values ('removal', auth.uid(), acc.account_id, found_code);
  if html is null then
    return 'profile_missing';
  end if;
  if not found_code then
    return 'code_missing';
  end if;

  update public.removal_attempts set verified_at = now() where id = att.id;
  insert into public.removals (person_id, reason) values (acc.person_id, 'self-removal (bio code)')
  on conflict (person_id) do nothing;
  update public.people set hidden = true where id = acc.person_id;  -- also if a removal already existed
  return 'removed';
end;
$$;

-- ---------------------------------------------------------------- schools from corrections
-- Owners pick their school (people.school_id). A school we don't list yet arrives as a
-- set_school correction, and approving it creates or reuses the school (§16: no inference).
create function public.slugify(p_text text) returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(lower(public.f_unaccent(p_text)), '[^a-z0-9]+', '-', 'g'), '-'), '')
$$;

create function public.approve_school_correction(p_correction_id bigint, p_school_name text)
returns bigint
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  c record;
  school bigint;
  base text;
  candidate text;
  n integer := 1;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve corrections.' using errcode = '42501';
  end if;
  select * into c from public.corrections where id = p_correction_id and kind = 'set_school';
  if c.id is null then
    raise exception 'No set_school correction %.', p_correction_id;
  end if;
  if coalesce(btrim(p_school_name), '') = '' then
    raise exception 'Give the school a name.';
  end if;
  select s.id into school from public.schools s
  where lower(s.name) = lower(btrim(p_school_name))
     or lower(btrim(p_school_name)) = any (select lower(x) from unnest(s.aliases) x)
  limit 1;
  if school is null then
    base := coalesce(public.slugify(p_school_name), 'school');
    candidate := base;
    while exists (select 1 from public.schools where slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    insert into public.schools (slug, name) values (candidate, btrim(p_school_name)) returning id into school;
  end if;
  update public.people set school_id = school where id = c.person_id;
  update public.corrections
  set status = 'approved', reviewer = auth.uid(), reviewed_at = now(),
      note = coalesce(note, 'school: ' || btrim(p_school_name))
  where id = c.id;
  return school;
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function
  public.rank_tier(bigint, real), public.month_change(bigint), public.best_win(bigint),
  public.site_stats(), public.next_event(), public.upcoming_events(integer),
  public.ladder(integer, integer, text), public.provisional_count(), public.hacker_page(text),
  public.event_board(integer, integer, integer, boolean, integer), public.series_board(integer),
  public.event_page(text), public.series_page(text), public.school_board(text),
  public.school_seasons(), public.school_page(text), public.duo_board(integer, integer),
  public.sitemap_entries(), public.new_bio_code(), public.bio_has_code(text, text),
  public.devpost_user_html(text), public.account_for(text), public.start_claim(text),
  public.verify_claim(bigint), public.my_claim_attempts(), public.my_merge_candidates(),
  public.start_removal(text), public.verify_removal(text, text), public.slugify(text),
  public.approve_school_correction(bigint, text)
from public, anon, authenticated;

grant execute on function
  public.rank_tier(bigint, real), public.site_stats(), public.next_event(),
  public.upcoming_events(integer), public.ladder(integer, integer, text),
  public.provisional_count(), public.hacker_page(text),
  public.event_board(integer, integer, integer, boolean, integer), public.series_board(integer),
  public.event_page(text), public.series_page(text), public.school_board(text),
  public.school_seasons(), public.school_page(text), public.duo_board(integer, integer),
  public.sitemap_entries(), public.start_removal(text), public.verify_removal(text, text)
to anon, authenticated;

grant execute on function
  public.start_claim(text), public.verify_claim(bigint), public.my_claim_attempts(),
  public.my_merge_candidates(), public.approve_school_correction(bigint, text)
to authenticated;
