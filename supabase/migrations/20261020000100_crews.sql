-- Crews replace duos (§8.3): groups of two or more people with at least 2 events together,
-- not only pairs with 3. A crew is stored as its sorted member ids; it's public only while every
-- member exists and none is hidden, so "remove me" hides each crew the person was in.

create table public.crews (
  members             bigint[] primary key,
  size                integer generated always as (cardinality(members)) stored,
  events_together     integer not null,
  placements_together integer not null,
  overperformance     real,
  score               real,
  check (cardinality(members) >= 2)
);
create index crews_members_gin on public.crews using gin (members);
create table public.crews_next (like public.crews including defaults including constraints including generated);

alter table public.crews enable row level security;
alter table public.crews_next enable row level security;
revoke all on public.crews, public.crews_next from anon, authenticated;

create or replace function public.publish_gold() returns void
language plpgsql
set search_path = ''
as $$
begin
  truncate public.ratings, public.rating_history, public.hackathon_strength,
           public.series_strength, public.crews, public.school_ratings;
  insert into public.ratings select * from public.ratings_next;
  insert into public.rating_history select * from public.rating_history_next;
  insert into public.hackathon_strength select * from public.hackathon_strength_next;
  insert into public.series_strength select * from public.series_strength_next;
  insert into public.crews (members, events_together, placements_together, overperformance, score)
    select members, events_together, placements_together, overperformance, score from public.crews_next;
  insert into public.school_ratings select * from public.school_ratings_next;
  truncate public.ratings_next, public.rating_history_next, public.hackathon_strength_next,
           public.series_strength_next, public.crews_next, public.school_ratings_next;
end;
$$;
revoke execute on function public.publish_gold() from public, anon, authenticated;

drop function public.duo_board(integer, integer);
drop view public.public_pair_synergy;
drop table public.pair_synergy, public.pair_synergy_next;

-- A crew's members as [{slug, name}] in id order, and how many of them are visible (exist and
-- aren't hidden). Internal: callers show a crew only when visible = its size. Plain SQL, so it's
-- inlined into the board and the profile.
create function public.crew_members(p_members bigint[])
returns table (members jsonb, visible bigint)
language sql stable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('slug', p.slug, 'name', p.display_name) order by u.ord),
         count(p.id) filter (where not p.hidden)
  from unnest(p_members) with ordinality u(id, ord)
  left join public.people p on p.id = u.id
$$;

create function public.crew_board(p_limit integer default 50, p_offset integer default 0)
returns table (rank bigint, members jsonb, size integer, events integer, placements integer,
               overperformance real, score real)
language sql stable security definer
set search_path = ''
as $$
  select row_number() over (order by c.score desc nulls last, c.size desc, c.members),
         m.members, c.size, c.events_together, c.placements_together, c.overperformance, c.score
  from public.crews c
  cross join lateral public.crew_members(c.members) m
  where m.visible = c.size
  order by c.score desc nulls last, c.size desc, c.members
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.crew_members(bigint[]), public.crew_board(integer, integer)
  from public, anon, authenticated;
grant execute on function public.crew_board(integer, integer) to anon, authenticated;

-- hacker_page: best_duo becomes best_crew; everything else as in 20261019000100.
create or replace function public.hacker_page(p_slug text) returns jsonb
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
    -- Base tables, not public_project_members: that view can't take the person filter, so it
    -- joined every member of every project (about 40k rows) on each profile.
    select o.id as person_id, o.slug as person_slug,
           coalesce(o.display_name, oa.display_name) as display_name,
           count(distinct pr.hackathon_id) as events
    from person
    join public.accounts a on a.person_id = person.id
    join public.project_members m on m.account_id = a.id
    join public.projects pr on pr.id = m.project_id
    join public.public_hackathons h on h.id = pr.hackathon_id
    join public.project_members om on om.project_id = pr.id
    join public.accounts oa on oa.id = om.account_id
    join public.people o on o.id = oa.person_id
    where o.id <> person.id and not o.hidden
    group by o.id, o.slug, coalesce(o.display_name, oa.display_name)
    order by events desc, display_name
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
    'best_crew', (select jsonb_build_object('members', m.members, 'events', c.events_together, 'score', c.score)
                  from public.crews c
                  cross join lateral public.crew_members(c.members) m
                  where c.members @> array[p.id] and m.visible = c.size
                  order by c.score desc nulls last, c.size desc limit 1),
    'toughest_win', (select jsonb_build_object('slug', bw.event_slug, 'title', bw.event_title,
                                               'prize', bw.prize_name, 'win_odds', bw.win_odds)
                     from public.best_win(p.id) bw),
    'active_since', (select min(e.ends_on) from entries e)
  )
  from person p
$$;
