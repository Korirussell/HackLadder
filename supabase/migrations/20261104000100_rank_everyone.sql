-- Everyone is ranked from their first event (§15 2026-11-04, owner's call).
-- The pipeline now stores each hacker's exact position in ratings.rank (score, then the unrounded
-- conservative rating, then the most recent event, then the id; null when hidden or inactive at
-- run time). "Provisional" (fewer than rating_settings.provisional_min_events) stays only as a
-- label. With ~170k people on the board, pages read the stored rank instead of numbering the whole
-- board with a window function on every view.

alter table public.ratings add column rank integer;
alter table public.ratings_next add column rank integer;
create index ratings_rank on public.ratings (rank) where rank is not null;

-- Same columns as before, so every reader keeps working. "Remove me" still hides a person at
-- once; the positions below them close up at the next rating run.
create or replace view public.live_board as
select r.person_id, r.score, r.events, r.placements, r.grand_prizes, r.percentile, r.last_event_on,
       r.rank::bigint as rank
from public.ratings r
join public.people p on p.id = r.person_id
where r.rank is not null
  and not p.hidden;
revoke all on public.live_board from anon, authenticated;

create or replace function public.ladder(p_limit integer default 50, p_offset integer default 0,
                                         p_school text default null)
returns table (rank bigint, total bigint, slug text, display_name text, school_name text,
               school_slug text, score integer, events integer, placements integer,
               month_change integer, tier text, is_claimed boolean, best_event_slug text,
               best_event_title text, best_prize text)
language sql stable security definer
set search_path = ''
as $$
  with page as (
    select b.*
    from public.live_board b
    join public.people p on p.id = b.person_id
    left join public.schools s on s.id = p.school_id
    where p_school is null or s.slug = p_school
    order by b.rank
    limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ),
  total as (
    select count(*) as n
    from public.live_board b
    join public.people p on p.id = b.person_id
    left join public.schools s on s.id = p.school_id
    where p_school is null or s.slug = p_school
  )
  select pg.rank, t.n, p.slug, p.display_name, s.name, s.slug, pg.score, pg.events,
         pg.placements, public.month_change(pg.person_id), public.rank_tier(pg.rank, pg.percentile),
         p.claimed_by is not null, bw.event_slug, bw.event_title, bw.prize_name
  from page pg
  cross join total t
  join public.people p on p.id = pg.person_id
  left join public.schools s on s.id = p.school_id
  left join lateral public.best_win(pg.person_id) bw on true
  order by pg.rank
$$;

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
           h.id as hackathon_id, h.slug, h.title, h.ends_on, pr.id as project_id, pr.title as project,
           pr.source_id, w.prize_name, w.tier
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
  trophies as (
    -- Every placing prize (tier 1-4) the person's projects won, for the trophy cabinet.
    select distinct pr.id as project_id, pr.title as project, pr.source_id, h.slug, h.title, h.ends_on,
           w.prize_name, w.tier
    from person
    join public.accounts a on a.person_id = person.id
    join public.project_members m on m.account_id = a.id
    join public.projects pr on pr.id = m.project_id
    join public.public_hackathons h on h.id = pr.hackathon_id
    join public.prizes_won w on w.project_id = pr.id
    where w.tier < 5
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
  standing as (  -- the stored position; no window over the whole board (§15 2026-11-04)
    select b.rank, b.percentile, (select max(r.rank) from public.ratings r)::bigint as size
    from public.live_board b
    where b.person_id = (select id from person)
  )
  select jsonb_build_object(
    'slug', p.slug,
    'display_name', p.display_name,
    'is_claimed', p.claimed_by is not null,
    'profile_theme', case when p.claimed_by is not null then p.profile_theme end,
    'avatar_path', case when p.claimed_by is not null then p.avatar_path end,
    'layout', case when p.claimed_by is not null then p.profile_layout else '{}'::jsonb end,
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
    'board_size', (select max(r.rank) from public.ratings r),
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
                          'project_id', e.project_id, 'project', e.project, 'project_slug', e.source_id,
                          'prize', e.prize_name, 'tier', e.tier,
                          'change', rh.score_after - rh.score_before)
                          order by e.ends_on desc nulls last, e.title)
                        from entries e
                        left join public.rating_history rh
                          on rh.person_id = p.id and rh.hackathon_id = e.hackathon_id), '[]'),
    'trophies', coalesce((select jsonb_agg(jsonb_build_object(
                            'key', t.project_id || ':' || t.prize_name,
                            'prize', t.prize_name, 'tier', t.tier,
                            'project_id', t.project_id, 'project', t.project, 'project_slug', t.source_id,
                            'event_slug', t.slug, 'event', t.title, 'ends_on', t.ends_on)
                            order by t.tier, t.ends_on desc nulls last, t.prize_name)
                          from trophies t), '[]'),
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
