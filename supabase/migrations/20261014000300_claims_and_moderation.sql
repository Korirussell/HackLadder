-- Claims, corrections and moderation (CLAUDE.md §7.4, §9, §11).

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- Bio-code claim attempts. Written and verified server-side with the service role (§11).
create table public.claim_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  bigint not null references public.accounts (id) on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now(),
  verified_at timestamptz,
  expires_at  timestamptz not null,
  check (expires_at > created_at)
);
-- Supports the 5-attempts-per-hour limit per user.
create index claim_attempts_user_created_idx on public.claim_attempts (user_id, created_at);

create table public.corrections (
  id           bigint generated always as identity primary key,
  person_id    bigint not null references public.people (id) on delete cascade,
  submitted_by uuid references auth.users (id) on delete set null,
  kind         text not null check (kind in (
                 'remove_project', 'add_to_project', 'merge_accounts',
                 'split_account', 'fix_placement', 'set_school')),
  payload      jsonb not null default '{}',
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer     uuid references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null))
);
create index corrections_status_idx on public.corrections (status, created_at);
create trigger set_updated_at before update on public.corrections
  for each row execute function public.set_updated_at();

-- "Remove me" is instant and unconditional (§9.4): recording a removal hides the person.
create table public.removals (
  person_id    bigint primary key references public.people (id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason       text
);

create function public.hide_removed_person() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.people set hidden = true where id = new.person_id;
  return new;
end;
$$;

create trigger hide_removed_person after insert on public.removals
  for each row execute function public.hide_removed_person();
