# Find yourself, and get added: design

Date: 2026-10-29. Status: approved in chat; awaiting spec review.

## Goal

Most visitors will search for their own name. Make that the main thing the site does, and give
anyone who isn't found a clear, self-service way to get their hackathons onto HackLadder.

People go missing for three reasons, most common first:

1. Their events count but haven't been crawled yet (about 370 of 1,319 in-scope events have projects).
2. Their events don't count: online, not an MLH member event, or winners not announced (§8.7).
3. They've never entered a hackathon on Devpost.

Success: someone who searches, isn't found, and enters their Devpost username sees within about
two minutes which of their events count and what happens next. If any count, their profile is
live the same day.

## Non-goals

- Email when the profile goes live. There's no mail service yet (custom SMTP needs a verified
  domain, §16). The status page is the notification for now.
- Asking for an out-of-scope event to be counted. Admins already do this in `hackathon_settings`.
- Sign-in to request. Requests only read public Devpost data.

## 1. Home and search

- **Hero:** the headline becomes "Where do you rank?" with one large search field (the existing
  search box, enlarged), autofocused on desktop only (no keyboard pop-up on phones).
- **Under the field:** `{hackers} hackers · Not here? Add yourself →`, linking to `/add`.
- **Below the hero:** the top of the ladder, school top 10, hardest events and the claim CTA, as
  today, in that order.
- **No results** (the dropdown in `search-box.tsx` and the `/search` page): replace "Try your
  Devpost username." with "Not here yet? Add yourself with your Devpost username", linking to
  `/add?u=<query>` when the query is a valid username (rule in §4), else to `/add`.

## 2. Pages

- **`/add`:** one field, "Your Devpost username", with a hint ("devpost.com/**username**") and
  the field pre-filled from `?u=`. Submitting calls the `request_add` server action, then
  redirects to `/add/<username>`.
- **`/add/[username]`:** dynamic (not cached) and `noindex`. It checks status every 4 seconds
  while the request is unfinished, and stops once it's finished or after 10 minutes. States:

| Request status | What the page shows |
|---|---|
| `queued`, `looking_up` | "Reading your Devpost profile…" |
| `already_here` | "You're already on HackLadder", with a profile link and a claim link |
| `crawling` | Event list (below), then "Loading your events. Your rating publishes when this run finishes." If the daily backfill holds the lock, it adds "by about 14:00 UTC". |
| `live` | "You're live", with a profile link and a claim link |
| `nothing_counts` | Event list, with an explanation of what counts and a link to /how-ratings-work |
| `not_found` | "No Devpost user called <username>. Check devpost.com/<username>." |
| `failed` | "We couldn't reach Devpost. Try again in a few minutes." (and a retry button) |

  Event list rows: title, date and one state: **rated** (already on the site), **queued**,
  **loaded**, or **doesn't count**, with a reason (`online`, `not an MLH event`,
  `winners not announced`, `high school`, `not on HackLadder`).
- `robots.ts` disallows `/add`.

## 3. Pipeline

New workflow `.github/workflows/add-hacker.yml`, dispatched by the site with input
`username` (validated against the same regex in the workflow before use, like `crawl-events.yml`).

**Job 1, lookup** (`hl add lookup --username U`). It runs outside the `pipeline-db` concurrency
group, and its only writes are to `add_requests`:

1. Set the status to `looking_up`.
2. Fetch `devpost.com/<username>` through the existing fetcher (cache, rate limit, robots). A 404
   sets `not_found` and stops.
3. Parse the portfolio's project slugs (new `parse_portfolio`, reusing the gallery entry markup),
   taking at most 30, newest first.
4. If the account exists in `accounts` with a person who has a rating, set `already_here` with the
   person slug and stop.
5. Fetch each project page and collect `submissions[].hackathon_url`. Map each subdomain to
   `hackathons.slug`, then through `hackathon_scope`:
   - not in `hackathons`: **doesn't count**, `not on HackLadder`;
   - `is_rated` false: **doesn't count**, with a reason from the view's flags: `is_high_school`
     gives `high school`, `is_online` gives `online`, `not is_mlh` gives `not an MLH event`, and
     anything else (admin exclusions) gives `excluded`;
   - in scope but `winners_announced` false: **doesn't count yet**, `winners not announced`;
   - in scope with projects loaded: **rated**;
   - in scope without projects: **queued**, at most 20 per request.
6. Write `events`. If anything is queued, set `crawling` and mark those slugs as requested (step 2
   of Job 2). Otherwise set `nothing_counts` and stop.

**Job 2, crawl** (`needs: lookup`, only when something is queued). It runs in the `pipeline-db`
concurrency group:

1. `hl crawl events --slug …` for the queued slugs. As each event finishes, its row in `events`
   becomes **loaded**.
2. `hl rate --if-changed`, then revalidate (the same steps as `crawl-events.yml`).
3. `hl add finish --username U`: set `live` with the person slug, which now exists because the
   crawl created it.

**Backfill priority:** `crawl_events` without slugs (the daily backfill) first crawls slugs on
open `add_requests` with status `crawling`. It checks again every 10 events. A request made while
the backfill holds the lock is loaded within minutes, and goes live when that run rates:
`crawl-events.yml` runs `hl add finish --all` after its rate step, which marks every `crawling`
request whose queued events are all loaded as `live`. Job 2 of that request then waits behind the
lock. It finds nothing new and exits quickly, because `--if-changed` skips the rating and
already-crawled slugs are skipped by checkpoint.

**Dispatch:** the `request_add` server action creates or returns the request, and dispatches the
workflow only when the row is new, using the existing `dispatchWorkflow` (GitHub token in Vercel
env).

## 4. Data

Migration `add_requests`:

```
add_requests(
  id bigint generated always as identity primary key,
  username text not null check (username ~ '^[A-Za-z0-9_-]{1,40}$'),
  status text not null default 'queued'
    check (status in ('queued','looking_up','already_here','crawling','live','nothing_counts','not_found','failed')),
  events jsonb not null default '[]',   -- [{slug, title, ends_on, state, reason?}]
  person_slug text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
index on (lower(username), created_at desc)
```

- RLS is on with no policies: only security-definer functions and the pipeline (postgres) touch it.
- `request_add(p_username text) returns table (username text, status text, is_new boolean)`, for
  anon and authenticated:
  - It validates the username.
  - It returns the latest request for `lower(username)` if one was created in the last 24 hours
    and its status isn't `failed`.
  - Otherwise it inserts a new one, unless 200 requests have been created in the last 24 hours,
    in which case it raises `add_requests_busy`. The page shows "Lots of requests today, try
    again tomorrow".
- `add_request_status(p_username text) returns jsonb`, for anon and authenticated: the latest
  request's status, events, person slug and updated_at, or null.

## 5. Errors and limits

- Usernames are checked by the same regex in the database, the server action and the workflow.
- Devpost errors (5xx, timeouts) retry once in lookup, then set `failed`. Retrying creates a new
  request (failed ones don't dedupe).
- A crawl failure leaves the request `crawling`. The next daily backfill picks those slugs up first.
- No personal data is stored beyond the public Devpost username, which is already stored for
  everyone crawled. This is consistent with §9.

## 6. Tests

- **Parser:** a `parse_portfolio` fixture saved from a real public Devpost portfolio page under
  `pipeline/tests/fixtures/user/`.
- **pytest (DB):** lookup maps events to states (rated, queued, each doesn't-count reason) and
  `already_here`, with a fake fetcher. The backfill crawls requested slugs first. A request goes
  `live` after the rating run.
- **pgTAP:** `request_add` validates usernames, dedupes within 24 hours, re-creates after
  `failed`, and enforces the daily cap. `add_request_status` returns the latest request. anon
  can't select the table.
- **Web:** status-to-copy mapping for every state, the `/add?u=` pre-fill rule, and the
  no-results links.

## Files touched (expected)

- `supabase/migrations/20261030000100_add_requests.sql`, `supabase/tests/database/add_requests.test.sql`
- `pipeline/src/hackladder/parse/user.py` (`parse_portfolio`), `pipeline/src/hackladder/add.py`,
  `cli.py` (`hl add lookup`, `hl add finish [--username U | --all]`), `crawl/events.py` (request priority), tests
- `.github/workflows/add-hacker.yml`, `crawl-events.yml` (marking backfill-served requests live)
- `apps/web/app/(site)/page.tsx` (hero), `components/site/search-box.tsx`, `app/(site)/search/page.tsx`,
  `app/(site)/add/page.tsx`, `app/(site)/add/[username]/page.tsx`, `app/(site)/add/actions.ts`,
  `app/robots.ts`, `lib/add.ts` (status copy), tests
- CLAUDE.md §10 (routes), §12 (jobs), §15 (log)
