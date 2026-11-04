-- School search ignores a leading "The" when ranking (§15 2026-10-26): "university of alabama"
-- listed The University of Alabama third, after UAB and UAH, because only exact and prefix matches
-- on the full name ranked first. Matching is unchanged.

create or replace function public.search_schools(q text, lim integer default 20)
returns table (id bigint, slug text, name text, country text)
language sql stable security definer
set search_path = ''
as $$
  -- Every word of the query appears in the name ("georgia tech" finds Georgia Institute of Technology).
  with needle as (select regexp_replace(lower(public.f_unaccent(btrim(q))), '[%_\\]', '', 'g') as n),
  hits as (
    select s.id, s.slug, s.name, s.country,
           regexp_replace(lower(public.f_unaccent(s.name)), '^the\s+', '') as bare
    from public.schools s, needle
    where length(needle.n) >= 2
      and not exists (select 1 from regexp_split_to_table(needle.n, '\s+') w
                      where lower(public.f_unaccent(s.name)) not like '%' || w || '%')
  )
  select h.id, h.slug, h.name, h.country
  from hits h, needle
  order by h.bare = regexp_replace(needle.n, '^the\s+', '') desc,
           h.bare like regexp_replace(needle.n, '^the\s+', '') || '%' desc,
           length(h.bare), h.name
  limit least(greatest(lim, 1), 50)
$$;

revoke all on function public.search_schools(text, integer) from public;
grant execute on function public.search_schools(text, integer) to anon, authenticated;
