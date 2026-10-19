-- hacker_page: find teammates through indexed base tables. With real data (11k people) the
-- public_project_members view made every profile scan all project members, and 31 build
-- workers at once ran past anon's 3s statement timeout. Same output, same privacy rules
-- (hidden teammates are skipped, only public events count).

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
