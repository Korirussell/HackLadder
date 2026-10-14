-- Rating outputs, rebuilt from scratch every run (CLAUDE.md §7.6, §8). Never hand-edit.
-- The pipeline fills the *_next shadow tables, then calls publish_gold() to swap them in.

create table public.ratings (
  person_id     bigint primary key references public.people (id) on delete cascade,
  mu            double precision not null,
  sigma         double precision not null,
  score         integer not null,             -- 1000 + 40 * (mu - 3 * sigma)
  events        integer not null,
  placements    integer not null,
  grand_prizes  integer not null,
  last_event_on date,
  percentile    real,
  provisional   boolean not null              -- fewer than 3 rated events
);
create index ratings_score_idx on public.ratings (score desc) where not provisional;

create table public.rating_history (
  person_id    bigint not null references public.people (id) on delete cascade,
  hackathon_id bigint not null references public.hackathons (id) on delete cascade,
  ends_on      date,
  score_before integer not null,
  score_after  integer not null,
  primary key (person_id, hackathon_id)
);

create table public.hackathon_strength (
  hackathon_id bigint primary key references public.hackathons (id) on delete cascade,
  field_size   integer not null,
  field_mean   real,
  top_field    real,
  elite_count  integer not null,
  win_odds     real,                          -- 1-in-N for a 90th-percentile team
  event_rating real,
  judging_corr real
);

create table public.series_strength (
  series_id         bigint primary key references public.event_series (id) on delete cascade,
  editions          integer not null,
  rating            real,
  best_hackathon_id bigint references public.hackathons (id) on delete set null
);

create table public.pair_synergy (
  person_a            bigint not null references public.people (id) on delete cascade,
  person_b            bigint not null references public.people (id) on delete cascade,
  events_together     integer not null,
  placements_together integer not null,
  overperformance     real,
  score               real,
  primary key (person_a, person_b),
  check (person_a < person_b)
);

create table public.school_ratings (
  school_id     bigint not null references public.schools (id) on delete cascade,
  season        text not null,                -- e.g. 2025-26 (Aug-Jul; §16 OPEN)
  top10_avg     real not null,
  members_rated integer not null,
  rank          integer,
  primary key (school_id, season)
);

-- Shadow tables: same shape, no foreign keys (they're checked when copied into the live tables).
create table public.ratings_next (like public.ratings including defaults including constraints);
create table public.rating_history_next (like public.rating_history including defaults including constraints);
create table public.hackathon_strength_next (like public.hackathon_strength including defaults including constraints);
create table public.series_strength_next (like public.series_strength including defaults including constraints);
create table public.pair_synergy_next (like public.pair_synergy including defaults including constraints);
create table public.school_ratings_next (like public.school_ratings including defaults including constraints);

-- Swap the shadow tables in atomically. Copying (rather than renaming tables) keeps every view
-- pointing at the live tables: views bind to a table's OID, so a rename swap would leave them
-- reading the old data. Readers block for the moment of the swap and never see a partial state.
create function public.publish_gold() returns void
language plpgsql
set search_path = ''
as $$
begin
  truncate public.ratings, public.rating_history, public.hackathon_strength,
           public.series_strength, public.pair_synergy, public.school_ratings;
  insert into public.ratings select * from public.ratings_next;
  insert into public.rating_history select * from public.rating_history_next;
  insert into public.hackathon_strength select * from public.hackathon_strength_next;
  insert into public.series_strength select * from public.series_strength_next;
  insert into public.pair_synergy select * from public.pair_synergy_next;
  insert into public.school_ratings select * from public.school_ratings_next;
  truncate public.ratings_next, public.rating_history_next, public.hackathon_strength_next,
           public.series_strength_next, public.pair_synergy_next, public.school_ratings_next;
end;
$$;
