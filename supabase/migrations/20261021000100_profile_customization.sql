-- Claimed owners customize their profile (§4.4, §7.7, §9.2, §15 2026-10-21):
--   * a profile photo they upload (storage bucket `avatars`, a folder per person);
--   * profile_layout: the trophy cabinet's order, up to 3 pinned projects, hidden projects and a
--     project layout. Display only: hidden projects still count for ratings (§9.4 spirit).
-- Plus school search for the /me picker, now that ~10k universities are loaded (hl schools load).

alter table public.people
  add column avatar_path text
    check (avatar_path is null
           or (avatar_path ~ '^[0-9]+/[A-Za-z0-9_-]{8,64}\.(webp|jpg|png)$'
               and split_part(avatar_path, '/', 1) = id::text)),
  add column profile_layout jsonb not null default '{}';

-- What profile_layout may hold. Keys are optional; anything else is rejected.
--   projects: 'list' | 'cards' | 'compact'
--   trophies: trophy keys ("<project id>:<prize name>") in the owner's order
--   pinned:   project ids shown first (at most 3)
--   hidden:   project ids not shown on the profile
create function public.valid_profile_layout(l jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(l) = 'object'
    and not exists (select 1 from jsonb_object_keys(l) k where k not in ('projects', 'trophies', 'pinned', 'hidden'))
    and (not l ? 'projects' or l ->> 'projects' in ('list', 'cards', 'compact'))
    and (not l ? 'trophies' or (jsonb_typeof(l -> 'trophies') = 'array'
         and jsonb_array_length(l -> 'trophies') <= 300
         and not exists (select 1 from jsonb_array_elements(l -> 'trophies') e
                         where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 400)))
    and (not l ? 'pinned' or (jsonb_typeof(l -> 'pinned') = 'array'
         and jsonb_array_length(l -> 'pinned') <= 3
         and not exists (select 1 from jsonb_array_elements(l -> 'pinned') e where jsonb_typeof(e) <> 'number')))
    and (not l ? 'hidden' or (jsonb_typeof(l -> 'hidden') = 'array'
         and jsonb_array_length(l -> 'hidden') <= 500
         and not exists (select 1 from jsonb_array_elements(l -> 'hidden') e where jsonb_typeof(e) <> 'number')))
$$;

alter table public.people
  add constraint people_profile_layout_valid check (public.valid_profile_layout(profile_layout));

grant update (avatar_path, profile_layout) on public.people to authenticated;

-- ----------------------------------------------------------------------------- schools
-- The /hackers filter lists only schools someone is in; the full list is only searched.
create function public.school_options() returns table (id bigint, slug text, name text)
language sql stable security definer
set search_path = ''
as $$
  select s.id, s.slug, s.name from public.schools s
  where exists (select 1 from public.people p where p.school_id = s.id and not p.hidden)
  order by s.name
$$;

create function public.search_schools(q text, lim integer default 20)
returns table (id bigint, slug text, name text, country text)
language sql stable security definer
set search_path = ''
as $$
  -- Every word of the query appears in the name ("georgia tech" finds Georgia Institute of Technology).
  with needle as (select regexp_replace(lower(public.f_unaccent(btrim(q))), '[%_\\]', '', 'g') as n)
  select s.id, s.slug, s.name, s.country
  from public.schools s, needle
  where length(needle.n) >= 2
    and not exists (select 1 from regexp_split_to_table(needle.n, '\s+') w
                    where lower(public.f_unaccent(s.name)) not like '%' || w || '%')
  order by lower(public.f_unaccent(s.name)) = needle.n desc,
           lower(public.f_unaccent(s.name)) like needle.n || '%' desc,
           length(s.name), s.name
  limit least(greatest(lim, 1), 50)
$$;

revoke all on function public.school_options(), public.search_schools(text, integer) from public;
grant execute on function public.school_options(), public.search_schools(text, integer) to anon, authenticated;

-- ----------------------------------------------------------------------------- profile page
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

-- ----------------------------------------------------------------------------- photo storage
-- Public read (photos are shown on public profiles); an owner writes only inside the folder
-- named after their own claimed person. Local Postgres without Supabase Storage skips this.
do $storage$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'no storage schema: skipping the avatars bucket';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  -- Storage's remove() reads the object first, so owners also need select on their folder.
  create policy "owners see their photos" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] in
           (select p.id::text from public.people p where p.claimed_by = (select auth.uid())));
  create policy "owners upload their photo" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] in
                (select p.id::text from public.people p where p.claimed_by = (select auth.uid())));
  create policy "owners replace their photo" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] in
           (select p.id::text from public.people p where p.claimed_by = (select auth.uid())));
  create policy "owners delete their photo" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] in
           (select p.id::text from public.people p where p.claimed_by = (select auth.uid())));
end
$storage$;
