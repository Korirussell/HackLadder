# CLAUDE.md: HackLadder

This file is the single source of context for building HackLadder. Read it fully before starting any task. When a decision here conflicts with something you'd do by default, this file wins. When a section is marked **OPEN**, ask the owner before deciding. When something is marked **VERIFY**, check it against the real world (the live site, the docs, the data) before you build on it.

Owner: Kori Russell (solo developer). This is a personal project meant to get real users and be portfolio-quality, so the code quality bar is "would hold up in a senior engineer's code review."

---

## 1. What HackLadder is

HackLadder ranks hackathon hackers, schools, teams and events, using public results from Devpost.

There is no good place today to see who the best hackathon hackers are, which events are hardest to win, or which schools dominate. HackLadder answers all three. Its rating model weights every win by **who you beat**, not just by how many times you won.

**Core moment:** someone types their name, finds out they're already ranked, and wants to show people. Every hacker who has ever placed at a Devpost hackathon already has a profile on day one. Everything in the product either feeds that moment or gives people a reason to come back.

**Long-term vision (not v1):** become a hackathon platform in our own right, hosting events, submissions and judging natively, Devpost-style. v1 does none of that, but the data model must not block it. See §7.9 and the `source` column throughout.

### 1.1 Product pillars, in priority order

1. **Find yourself.** Search is the homepage. Every result lands on a profile with a rating, the rating's history, wins weighted by difficulty, and frequent teammates.
2. **School vs school.** School leaderboards are the main growth lever: rivalries get shared far more than individual ranks.
3. **Events.** Every hackathon gets a page with field strength, winners and win odds. A "hardest to win" board ranks events and recurring series.
4. **Share and claim.** People get a shareable rank card (an OG image) and can claim their profile through a Devpost bio code.
5. **Trust.** A public methodology page, an easy corrections flow, and "remove me" honored without argument.
6. **Return loop.** Ratings update weekly, and people who claimed their profile get an email when their rating moves.
7. **Phase 2, the useful part:** an upcoming-events page showing your personal odds of winning each event.
8. **Later:** teammate finder, domain leaderboards (best healthcare hackers and so on), and a recruiter view of opted-in profiles only.

### 1.2 Non-goals for v1

- Hosting hackathons, accepting submissions, judging.
- Scraping LinkedIn or any site other than Devpost and MLH. This is a hard rule (§9).
- Social features: comments, follows, DMs.
- A mobile app. The site must be excellent on mobile, though.

---

## 2. How to work in this repo (instructions for Claude)

- **Read before writing.** Before changing a module, read it and its tests. Before building UI, open `design/reference.html` and match it.
- **Small, verifiable steps.** After each meaningful change, run the relevant tests, typecheck and lint. Don't report something as done until it has run.
- **Never invent data.** Seed and sample data must be clearly labeled as fake. Never write made-up ratings for real people or real events into the production database or into committed fixtures that could be mistaken for real.
- **Parsers are tested against real saved HTML.** Every scraper selector has a pytest fixture: a real page saved under `pipeline/tests/fixtures/`. If a selector change breaks a fixture test, fix the parser. Don't fix the test.
- **Ratings are reproducible.** The pipeline rebuilds all ratings from scratch from raw data. Never hand-edit a rating row. Corrections change *inputs* (the `corrections` table), never outputs.
- **Ask when it's marked OPEN.** Otherwise make the reasonable call, note it in the PR or commit message, and move on.
- **Keep this file current.** When you make an architectural decision, add it to §15 (Decision log). When you discover something about Devpost's markup or behavior, add it to §6.6 (Devpost field notes).
- **Commits:** conventional commits (`feat(web): …`, `fix(pipeline): …`, `chore: …`). One logical change per commit.
- **Secrets** live only in `.env.local` (web), `pipeline/.env`, Vercel env vars, and GitHub Actions secrets. Never commit them. `.env.example` files list every variable with a comment.

---

## 3. Tech stack

Every piece is here because the problem needs it. Don't add infrastructure without a reason that fits in one sentence. Add that sentence to §15.

| Layer | Choice | Why |
|---|---|---|
| Web app | **Next.js (App Router, current stable), TypeScript strict** | Static generation and ISR for fast public pages; good SEO; OG image generation built in |
| Styling | **Tailwind CSS v4**, tokens defined in CSS (`@theme`) | Tokens mirror `design/reference.html` exactly |
| Fonts | **Bricolage Grotesque** (variable: opsz, wdth, wght) via `next/font/google` | One family for display and body (see §4) |
| Charts | **Recharts** (rating history, distributions) | Simple, SSR-friendly enough, styleable to the tokens |
| Database | **Supabase Postgres** | Postgres plus auth plus row-level security plus storage in one place |
| Auth | **Supabase Auth** (email magic link plus GitHub OAuth) | Needed for claiming and corrections |
| Search | **Postgres `pg_trgm`** plus `unaccent` | Fuzzy name search without another service |
| Pipeline | **Python 3.12**, managed with **uv** | Scraper, entity resolution, ratings, event analysis |
| Rating math | **openskill** (Plackett-Luce), numpy, scipy | Already prototyped and validated (§8) |
| HTML parsing | **selectolax** (fast) or BeautifulSoup | Prototype uses BeautifulSoup; switch to selectolax only if it's a measured bottleneck |
| Scheduling | **GitHub Actions cron** | Weekly incremental crawl plus nightly ratings; free and visible |
| Backfill runner | Local machine or a small VM | The one-time backfill runs for days, longer than Actions' 6-hour job limit (§6.4) |
| Raw page storage | **Supabase Storage** bucket `raw-pages` (gzipped HTML) | Re-parse without re-crawling when parsers change |
| Hosting | **Vercel** | Native Next.js; preview deploys per PR |
| Email | **Resend** plus React Email | Claim confirmations and weekly "you moved" emails |
| Errors | **Sentry** (web plus pipeline) | Free tier is enough |
| Product analytics | **PostHog** or Vercel Analytics (**OPEN**) | To measure searches, claims and shares, which are the numbers for the resume |
| Testing | **pytest** (pipeline), **Vitest** (web units), **Playwright** (e2e) | — |

**Explicitly rejected:** Databricks/Spark (the data fits in one Postgres database; the rating replay is sequential), Kafka (batch problem, not streaming), Datadog (Sentry plus logs is enough at this scale), Neo4j (Postgres handles the teammate queries at this size).

---

## 4. Design system

**The design reference is `design/reference.html`. Open it in a browser before building any page.** It's a static mock of the homepage, and it defines the tokens, type, layout and components below. If this section and the reference disagree, the reference wins; then update this section.

The style is heavily inspired by brandappart.com: a warm paper background, enormous tight black display type, a single orange accent, a fixed left icon rail, generous space and very little chrome. Take inspiration only. Never copy their logo, copy, images or the © mark; our signature mark is the circled up-chevron.

### 4.1 Tokens

```css
--paper:    #F6F3EC;  /* page background (never pure white) */
--ink:      #17140F;  /* text, primary buttons, rules under section heads */
--signal:   #FF5B14;  /* THE accent. Mark, rating went up, focus rings. Nothing else. */
--tile:     #ECE7DE;  /* rail tiles, inputs, event cards, quiet surfaces */
--graphite: #6F685E;  /* secondary text, rating went down */
--rule:     #DDD6CA;  /* hairlines between rows */
```

- **Signal orange is rationed.** It appears on the logo mark, upward rating movement, focus rings and at most one other thing per page. If you're reaching for orange to make something "pop", use size or weight instead.
- Rating up shows in `--signal`; down shows in `--graphite` (never red, because a rating dip isn't an error); unchanged shows `±0` in graphite.
- **Dark mode: not in v1.** Keep every color as a token so it can be added later.

### 4.2 Typography

One family: **Bricolage Grotesque** (variable). The personality comes from its axes.

| Role | Size | Axes and settings |
|---|---|---|
| Hero display | `clamp(64px, 9.4vw, 164px)`; mobile `17vw` | wght 800, opsz 96, wdth 82, letter-spacing −0.055em, line-height 0.86 |
| Section display (h2) | `clamp(48px, 6.4vw, 104px)` | same as hero |
| Rank numerals | 168 / 104 / 64px for #1 / #2–3 / the rest | wght 800, opsz 96, wdth 78, tracking −0.06em |
| Big stat (odds, rating) | 34–76px | wght 800, wdth 80, tracking −0.05em |
| Sub-headline | `clamp(22px, 2.2vw, 32px)` | wght 400, tracking −0.02em, line-height 1.22, max-width 22ch |
| Body | 17px / 1.5 | wght 400, opsz 14 |
| Small / meta | 14–15px | wght 400–600, `--graphite` |
| Buttons | 16px | wght 700, sentence case |

- `font-variant-numeric: tabular-nums` globally, so numbers align in tables.
- **No all-caps labels, no eyebrow labels above headings, no monospace data labels, no "→" appended to buttons or links.**
- Headlines are statements in sentence case: "The ladder", "School vs school", "Hardest to win".

### 4.3 Layout and chrome

- **Fixed left rail** (desktop ≥900px): six 72×72 tiles, radius 16, `--tile` background, icon `--graphite`. Hover or current page inverts to `--ink` background and `--paper` icon, with a tooltip label to the right. The order is Hackers, Schools, Events, Duos, How ratings work, Claim.
- **Logo** fixed top-left: "Hack / Ladder" stacked, wght 800, wdth 80, 27px, line-height 0.82.
- **Primary CTA** fixed top-right: black "Claim your profile" button.
- **Bottom-left:** "Menu" with three dots, which opens a full-screen menu.
- **Bottom-right:** a live "Next big event: HackGT closes in 2d 04h" countdown, our version of the reference's local clock. Data comes from upcoming events.
- **Right edge:** a thin vertical scroll-progress line with a ringed dot.
- **Content column:** max-width 1240px, left padding = rail width + 40px.
- **Mobile (<900px):** rail, progress line, menu label and countdown are hidden. The logo and CTA become absolutely positioned (not fixed), page gutter is 16px, there's no horizontal scroll, and a bottom tab bar holds the rail's six destinations (**OPEN**: tab bar vs. hamburger).
- Hero is centered. Everything else is left-aligned. Section heads have the h2 on the left and a short graphite explainer on the right, over a 1px `--ink` rule.

### 4.4 Components

- **Button:** `--ink` background, `--paper` text, radius 14, padding 14×20, wght 700. A ghost variant is text-only. Labels say exactly what happens: "Claim your profile", "Find me", "Send correction".
- **Search bar:** `--tile` pill, radius 20, 21px input, inline black "Find me" button. Focus shows a 3px `--signal` ring. Results appear as an instant dropdown (debounced 150ms, top 8: hackers, schools, events, grouped).
- **Ladder row:** grid of rank numeral / name with school and event count / best win / rating with monthly change. Ranks 1–3 get oversized numerals; this is the page's one bold typographic move.
- **School row:** rank, name, a thin `--ink` bar on `--tile` track, rating.
- **Event card:** `--tile` card, radius 24, min-height 340. Title, a meta line, and big "1 in N" odds at the bottom. The #1 card is inverted (ink background).
- **Profile header:** giant display name (hero scale), rating as a huge numeral, percentile ("Top 3%"), claim status, rating-history chart beneath.
- **Provisional badge:** hackers with fewer than 3 rated events show a "Provisional" text tag, not a number rank.
- **Empty states** say what to do: "No results for 'kori r'. Try your Devpost username."

### 4.5 Motion

- **One orchestrated moment:** the hero headline rises line by line and the circled mark spins in (see the reference). Nothing else animates on load. No fade-up on scroll for sections.
- Motion that answers an action is welcome: the search dropdown opening, a claim succeeding, a rating counter ticking when a profile loads.
- Respect `prefers-reduced-motion` everywhere.

### 4.6 Copy voice

Plain, confident, a little competitive. "Every hacker who's won, ranked." "You're probably already on here." Errors explain what happened and how to fix it, and never apologize. Never say "Elo" in UI copy, because it isn't Elo. Say "rating". The methodology page explains the model.

---

## 5. Repository layout

```
hackladder/
├── CLAUDE.md                  ← this file
├── design/
│   └── reference.html         ← visual source of truth
├── apps/
│   └── web/                   ← Next.js app
│       ├── app/
│       │   ├── (site)/        ← public pages
│       │   ├── (auth)/        ← claim, sign-in, /me
│       │   ├── api/           ← route handlers (search, claim verify, corrections)
│       │   └── og/            ← OG image routes
│       ├── components/
│       ├── lib/               ← supabase clients, queries, formatting
│       └── tests/
├── pipeline/
│   ├── prototype/             ← validated prototype; read-only reference, see §8
│   ├── src/hackladder/
│   │   ├── crawl/             ← fetch, cache, rate limit, checkpoints
│   │   ├── parse/             ← pure functions: HTML → dataclasses
│   │   ├── load/              ← upsert into Postgres
│   │   ├── resolve/           ← entity resolution
│   │   ├── rate/              ← rating replay, duos, event analysis
│   │   ├── schools/           ← school normalization
│   │   ├── publish/           ← build "gold" tables the site reads
│   │   └── cli.py             ← `hl crawl|parse|rate|analyze|publish|check`
│   ├── tests/
│   │   ├── fixtures/          ← real saved Devpost HTML/JSON
│   │   └── test_*.py
│   └── pyproject.toml
├── supabase/
│   ├── migrations/            ← SQL, timestamped, never edited after merge
│   └── seed.sql               ← clearly fake dev data only
└── .github/workflows/
    ├── ci.yml                 ← lint, typecheck, tests on PRs
    ├── crawl-weekly.yml
    └── rate-nightly.yml
```

---

## 6. Data acquisition

### 6.1 Sources

| Source | What we take | How |
|---|---|---|
| Devpost hackathon list API | Every hackathon: id, title, url, dates, location, themes, registrations, prize total, winners-announced flag | `GET https://devpost.com/api/hackathons?status[]=ended&page=N` (JSON, 9 per page, about 13.9k ended in Oct 2026) |
| Devpost upcoming list | Upcoming and open events, for the countdown and Phase 2 odds | Same API with `status[]=upcoming` and `status[]=open` |
| Devpost gallery pages | Every submitted project per hackathon, plus winner badges | `https://<event>.devpost.com/project-gallery?page=N` (HTML) |
| Devpost project pages | Team members (usernames plus display names) and prizes won **at this hackathon** | `https://devpost.com/software/<slug>` (HTML) |
| Devpost user pages | Display name, plus school only if publicly listed (**VERIFY**) | `https://devpost.com/<username>` (HTML) |
| MLH season pages | Which events are MLH member events, and **which are high-school events** (for the minors rule, §9) | mlh.io season event lists (HTML) |

### 6.2 Crawl rules

- **One request at a time, at least 1.5 seconds apart, to all of devpost.com combined.** Identify with a real User-Agent: `HackLadderBot/1.0 (+https://hackladder.com/bot)`.
- Check and honor `robots.txt` at crawl start, and log what it says.
- Back off on 429 or 5xx: wait 10s, 20s, 40s, then give up on that URL and record it in `crawl_failures`.
- **Every fetched page is stored raw** (gzipped) in the `raw-pages` bucket, keyed by URL hash, with fetch time and status in `raw_pages_index`. Parsing is a separate step that reads from storage. That means:
  - when a parser bug is fixed, re-parse everything with **zero** new requests;
  - the crawl is resumable: a URL already fetched within its freshness window is skipped.
- Freshness windows: ended-event galleries and projects get refetched only if the event ended less than 60 days ago, since winners and late edits settle. Older event pages are effectively immutable. User pages: 90 days. List API: every run.

### 6.3 Cadence ("the scrapes won't be super often, right?")

Right. After the first backfill it's light:

| Job | When | Roughly how much |
|---|---|---|
| **Backfill** (once) | Manually, from a laptop or VM | All ended events with winners announced. Order of magnitude: several hundred thousand project pages, which is **days** of crawling at 1 req/1.5s (**VERIFY** once the real counts are known). Resumable, in chunks. |
| **Weekly incremental** | Mondays 06:00 UTC, GitHub Actions | List API pages until we hit events we've already seen, plus galleries and projects for events that ended in the last 60 days. A few thousand requests, under an hour. |
| **Daily upcoming** | Daily 05:00 UTC | List API for upcoming and open events only. A handful of requests. |
| **Ratings and publish** | After each weekly crawl, plus nightly to apply approved corrections | No crawling. Pure compute against Postgres. |

The site shows "Updated every Monday".

### 6.4 Backfill procedure

1. `hl crawl list --all` fetches the entire hackathon list (about 1,550 pages). Store it.
2. Filter: `winners_announced = true`, not `invite_only`, registrations ≥ 20, not a high-school event (§9).
3. `hl crawl events --backfill --chunk 200` crawls galleries and projects, 200 events per chunk, newest first. Checkpoints go in `crawl_checkpoints`, so killing and restarting it loses nothing.
4. `hl parse --all` parses from storage, then `hl resolve`, `hl rate`, `hl analyze`, `hl publish`.
5. Run a spot-check script that prints 20 random events with parsed winners and team members next to their Devpost URLs, for a human to eyeball.

### 6.5 Parsing outputs

Parsers are **pure functions** (`html → dataclass`), with no I/O, and each has fixture tests.

- `parse_hackathon_list(json) -> HackathonListPage(hackathons: tuple[HackathonMeta], total_count, per_page)`
- `parse_gallery(html) -> GalleryPage(entries: tuple[GalleryEntry], has_next: bool)`
- `parse_project(html, hackathon_host) -> ProjectPage(members, submissions, prizes_at_this_event, built_with, description_text, ...)`
- `parse_user(html) -> UserPage(username, display_name, bio?, location?)`. There is no `school`: Devpost doesn't publish one (§16). `bio` is kept because claim verification reads it (§11).
- `parse_mlh_season(html) -> list[MlhEvent(name, dates, is_high_school)]` (not built yet)

Markup the parser wasn't written for raises `ParseError` instead of guessing, so it shows up in `hl check` and `crawl_failures`.

Prize tiers (from the prototype's `prize_tier`): 1 = grand / 1st / overall, 2 = 2nd / 3rd / runner-up / finalist, 3 = track or category (the default), 4 = sponsor / "best use of X" / MLH, **5 = not a placement** (raffle, participation, attendance; the rating treats it like "submitted, didn't place"). Tiers are derived from the name with `(...)` and `[...]` reward descriptions removed (§6.6). Store the raw prize name too, so tiers can be re-derived.

### 6.6 Devpost field notes (keep this updated)

- The list API returns `prize_amount` as an HTML string (`$<span data-currency-value>1,024</span>`). Strip the tags before parsing.
- `submission_period_dates` comes in forms like `Aug 21 - Oct 02, 2026`, `Feb 16 - 18, 2024` and `Dec 28, 2025 - Jan 02, 2026`. The end date is what orders events.
- A project page lists **every** hackathon the project was submitted to, with that event's prizes. Only take prizes from the block whose link matches the current hackathon host.

Verified against the live site on 2026-10-14 (fixtures in `pipeline/tests/fixtures/`, provenance in `manifest.json`; `hl check https://treehacks-2024.devpost.com/` parses all 329 projects with zero warnings):

- **robots.txt** allows everything for `*`; it only blocks a few named bots (BLEXBot, Omgilibot, Omgili, ImagesiftBot, Bytespider).
- **List API.** 9 per page; `meta.total_count` was 13,889 ended events. The default order is **not chronological**: pages 40 and 120 were sorted by `registrations_count` descending, with ties newest first. Don't rely on order for incremental crawls; filter on dates. The `search=` parameter is fuzzy (unrelated events come back), so match the exact URL. `prize_amount` is not always dollars: `₹ <span…>1,475,001</span>` and `€<span…>26,200</span>` exist, so `prize_total_usd` is null for those.
- **Gallery selectors confirmed.** Entries are `div.gallery-item[data-software-id]` with `a.link-to-software`, `.software-entry-name h5` (title) and `.tagline`. The winner flag is `aside.entry-badge img.winner`. Winners are sorted first, so page 1 of a big event can be 100% winners (that's why "every entry showed Winner").
- **Gallery pagination.** Next page is `ul.pagination li.next_page a[rel=next]`; on the last page that `li` has class `unavailable`. A small single-page gallery has **no pagination element at all**. 24 entries per page.
- **Gallery members are only a preview**: at most 4 avatars (`span.user-profile-link[data-url]`, name in `img[alt]`), then "+ N". Private-mode members are folded into the "+ N"; deleted accounts show as a bare `img` with no link. Always take the team from the project page.
- **Project page team.** `#app-team li.software-team-member` holds **two** `a.user-profile-link`s: the first wraps only the avatar (no text), the second has the display name. The prototype read the first one, so every display name came out as the username. Fixed.
- **Anonymous members.** Private-mode users render as `<span title="This user is in private mode">Private user</span>`; deleted accounts as `<span title="This user has been deleted">deleted deleted</span>`. Neither has a username. They're kept as anonymous seats (`Member.kind = private | deleted`) and must not become accounts. TreeHacks 2024 had 14.
- **Display name = username** when the user never set a name (e.g. `dylanjpaulson`). That's correct, not a parse bug.
- **Same name, two accounts on one team**: `shamify` lists `sanchez-adrianacs` and `as2758`, both "Adriana Sanchez". This is a real §7.5 duplicate-account case.
- **Prizes.** `#submissions ul.software-list-with-thumbnail > li`; the event link is in `.software-list-content`; each prize is an `li` with `span.winner` followed by the prize name. Host matching must be **exact**: the prototype's `a[href*=host]` substring match would accept `hacks-2024.devpost.com` for `treehacks-2024`.
- **Prize names carry their rewards**, including placings: `Best Use of Monster Generative AI APIs (4x XBox Series S [1st] & … [2nd] & $400 Cash [3rd])`. The prototype's tier-1 rule matched that `[1st]`: **16 of the 22 prizes it rated tier 1 at TreeHacks 2024 were sponsor prizes.** Tiers are now computed on the name without `(...)`/`[...]`, leaving 6 tier-1 prizes.
- **Raffles are "prizes" too**: `test-project-skqc27` (a project literally titled "Test Project") won "Workshop Raffle Prizes ($10k in Prizes)". Now tier 5, not a placement.
- **Open tier questions (need data from more events, not one):** TreeHacks names its track winners "Education Grand Prize", "Health Grand Prize" and so on, which tier as 1 alongside the real "Grand Prize ($10k Cash)"; arguably they're tier 3. Many sponsor prizes are written `Sponsor: Prize name` (e.g. "Fetch.ai: Smartest AI Agent Prize") and fall to the tier-3 default; a colon-prefix rule might be tier 4. Decide both during the backfill spot-check.
- **Multi-event submissions are rare at in-person events but extreme online.** None of the 329 TreeHacks 2024 projects (and none of 27 sampled elsewhere) were submitted to a second event, yet on Local Hack Day: Share (2020) `sequoia-tgnryh` went to 12 events and `smarttracker-covid19` to 21, including "Teens Take On COVID" (a minors-rule signal, §9). Fetch each project page **once** and parse it per event; don't refetch it for every gallery it appears in.
- **User pages have no school field** (checked three users; §16). They show name, `(username)`, an optional free-text bio (`#portfolio-user-bio`), and `#portfolio-user-links` (location via `.ss-location`, plus website/GitHub, which we don't parse, §9.3). The bio is also shown under each member's name on project pages.
- The software search API (`/software/search?query=`) returns JSON with members and a winner flag but **not** which hackathons a project was submitted to.

---

## 7. Data model (Postgres)

Migrations live in `supabase/migrations/`. Everything below is the target. The prototype's `schema.sql` is the SQLite ancestor.

### 7.1 Conventions

- `snake_case`, plural table names, `id bigint generated always as identity` unless a natural key is better.
- Every source-derived row has `source text not null default 'devpost'` and `source_id text`, unique on `(source, source_id)`. The future native platform uses `source = 'native'`. **Don't hard-code Devpost assumptions into column names.**
- `created_at`, `updated_at timestamptz` on mutable tables.

### 7.2 Raw layer

- `raw_pages_index(url_hash pk, url, kind, fetched_at, status, storage_path, parser_version)`
- `crawl_checkpoints(job, cursor, updated_at)`
- `crawl_failures(url, kind, status, error, attempts, last_attempt_at)`

### 7.3 Core entities

- `hackathons(id, source, source_id, slug, title, url, organization, location, is_online, starts_on, ends_on, registrations, prize_total_usd, themes jsonb, is_mlh, is_high_school, series_id → event_series, winners_announced)`
- `event_series(id, slug, name)`. Groups editions: treehacks-2024 and treehacks-2025 go to `treehacks`. Use the prototype's `series_key()` and allow manual overrides in `series_overrides`.
- `projects(id, source, source_id /*slug*/, hackathon_id, title, tagline, is_winner, built_with text[], description text)`
- `prizes_won(project_id, prize_name, tier smallint)`
- `accounts(id, source, source_id /*devpost username*/, display_name, school_raw, location_raw, person_id → people)`. One row per Devpost account.
- `people(id, slug, display_name, school_id → schools, claimed_by → auth.users, claimed_at, hidden bool, linkedin_url, github_url, website_url, bio, open_to_recruiters bool)`. One row per human. Entity resolution maps accounts to people (§7.5).
- `project_members(project_id, account_id)`
- `schools(id, slug, name, aliases text[], country)`

### 7.4 Claims, corrections, moderation

- `claim_attempts(id, user_id, account_id, code, created_at, verified_at, expires_at)`
- `corrections(id, person_id, submitted_by, kind /* remove_project | add_to_project | merge_accounts | split_account | fix_placement | set_school */, payload jsonb, status /* pending | approved | rejected */, reviewer, reviewed_at, note)`
- `add_to_project` corrections are approved by **any already-listed teammate who has claimed their profile**, or by an admin.
- `removals(person_id, requested_at, reason)`. Removal is immediate: `people.hidden = true`.

### 7.5 Entity resolution (Devpost-only)

Accounts are not people. Some people have two Devpost accounts, and there are many "Alex Chen"s.

- **Default:** one account is one person. Never auto-merge on name alone.
- **Candidate duplicates:** pairs of accounts with name similarity (trigram ≥ 0.8 on normalized name), *and* at least one of: a shared teammate, the same school, or overlapping event dates in the same city. These are stored in `merge_candidates(account_a, account_b, score, reasons jsonb)` and shown to the person when they claim ("Are these also you?").
- **Merges** only happen through a verified claim of *both* accounts (both bio codes) or admin action. A split undoes a merge.
- **Unclaimed wins** stay on the auto-created person and count fully toward ratings. Claiming controls the profile, not whether results count.

### 7.6 Rating outputs (rebuilt every run)

- `ratings(person_id pk, mu, sigma, score int, events, placements, grand_prizes, last_event_on, percentile, provisional bool)`
- `rating_history(person_id, hackathon_id, ends_on, score_before, score_after)`, for the profile chart and the "you moved" emails
- `hackathon_strength(hackathon_id pk, field_size, field_mean, top_field, elite_count, win_odds, event_rating, judging_corr)`
- `series_strength(series_id pk, editions, rating, best_hackathon_id)`
- `pair_synergy(person_a, person_b, events_together, placements_together, overperformance, score)`
- `school_ratings(school_id, season, top10_avg, members_rated, rank)`

Write all of these into `_next` shadow tables, then swap them in one transaction, so the site never reads a half-built state.

### 7.7 Row-level security

- Public (anon) can `select` only from views: `public_people` (where not hidden), `public_ratings`, `public_hackathons`, and so on. No direct table access.
- Authenticated users can `update` only their own `people` row, only the owner-editable columns (links, bio, school, open_to_recruiters, hidden).
- `corrections`: insert is allowed for authenticated users; select only their own; update only for admins.
- The pipeline uses the service-role key, server-side only.

### 7.8 Search

Use a `search_index` materialized view (name, username, school, kind, rank_score), with a `pg_trgm` GIN index on an unaccented, lowercased name. Query through an RPC `search(q text, limit int)` that ranks exact username > name prefix > trigram similarity, and breaks ties by rating.

### 7.9 Future native platform

Nothing to build now. Just keep `source` everywhere, keep `projects` and `hackathons` free of Devpost-only columns (put those in `*_devpost_meta` side tables if needed), and keep ratings source-agnostic: they read projects, placements and members, regardless of where they came from.

---

## 8. Rating methodology

The prototype in `pipeline/prototype/` is validated. Port its logic into `src/hackladder/rate/` with tests. **Don't change the math without rerunning the simulation (§8.5) and recording before and after numbers in §15.**

### 8.1 Hacker ratings (`prototype/rate.py`)

- Replay all events in date order through **OpenSkill Plackett-Luce** (team-aware, multiplayer).
- Each event becomes a ranking: 1 grand, 2 runner-up, 3 track (or winner badge with no prize name), 4 sponsor, 5 everyone who submitted but didn't place (tied).
- A person on two projects at one event keeps only their best-placed one (`dedupe_people`).
- Display score: `1000 + 40 × (μ − 3σ)`, so new hackers start at about 1000 and a single lucky win can't top the board.
- Leaderboard eligibility: at least 3 rated events (the prototype used 2; **use 3**). Below that, the profile is labeled "Provisional".

### 8.2 Event ranking (`prototype/analyze_events.py`)

- Every entrant is judged by their **final** (hindsight) rating, conservatively (μ − 1σ), so first-timers count as unproven rather than as wildcards.
- `win_odds` is the 1-in-N chance that a team at the global 90th percentile takes 1st against that exact field. It's computed exactly by numerical integration, with per-event noise **calibrated** on who actually won.
- `elite` is the number of entrants who end up in the global top 5%.
- **Event rating = 70% z(log1p(elite)) + 30% z(log(win_odds)).** Elite-heavy on purpose: win odds alone over-rated big online beginner jams whose regulars only ever play each other.
- Series rating is the mean of edition z-scores, shrunk by n/(n+1).
- `judging` is the rank correlation between pre-event team strength and finish. It's shown on event pages as context, not used in the rating.

### 8.3 Duos (`pair_synergy`)

Pairs need at least 3 events together. Score = (placements + 1)/(events + 4) + 0.5 × overperformance × events/(events + 3).

### 8.4 Schools

School rating = mean score of the school's top 10 non-provisional hackers who were active this season (Aug–Jul). A school needs at least 5 rated members to appear.

### 8.5 Validation: the simulation is a regression test

`prototype/simulate.py` generates hackers with hidden true skill, recurring series with hidden prestige, and big beginner-only online jams. Port it to `tests/test_rating_quality.py` and assert these minimums (latest results in brackets):

| Metric | Floor | Last measured |
|---|---|---|
| Hacker rank correlation with true skill (3+ events) | ≥ 0.55 | 0.59 |
| Event rating vs true win odds | ≥ 0.75 | 0.84 |
| Series rating vs true prestige | ≥ 0.80 | 0.89 |
| Beginner jams in the event top 20 | 0 | 0 |
| Planted synergy duo rank | top 10 | #1 |

### 8.6 Known issue to fix before launch (Phase 1 task)

**Isolated-pool inflation in hacker ratings.** Hackers who mostly compete in big beginner online jams rise because nobody strong ever beats them. With jams in the simulation, hacker ratings (0.59) are no better than plain win rate (0.60). Candidate fixes, to evaluate in the simulation:

- (a) Weight each event's update by field strength, for example scaling the update's effect by a function of the event's `elite` count.
- (b) Cap the rating gain from events whose field mean is far below the hacker's own rating.
- (c) Report a "proven" score that only counts events with at least k elite entrants.

Pick whichever raises hacker correlation the most without breaking the other floors, and log the decision in §15.

---

## 9. Privacy, safety and fairness (hard rules)

1. **No minors.** Exclude high-school hackathons entirely: MLH high-school events, titles or themes containing "high school", "HS", "middle school", "secondary", or "for teens". Keep an admin-editable `excluded_hackathons` list. If a person's only events are excluded, they don't exist on HackLadder. **When in doubt, exclude.**
2. **Public data only.** Profiles are auto-created only from what a person already published on Devpost: username, display name, projects and prizes. No emails, no avatars stored (render initials), no location unless the person adds it.
3. **No LinkedIn scraping, ever.** LinkedIn, GitHub and website links come only from the owner after claiming.
4. **"Remove me" is instant and unconditional.** It's available without an account through the bio-code check, and it hides the person everywhere. Their past results still count for opponents' ratings, but they're shown as "Hidden hacker".
5. **Corrections are easy** and reviewed within a week. Every profile has a "Something wrong?" link.
6. **Recruiter features** only ever show people who claimed their profile **and** opted in.
7. Respect Devpost: polite crawling (§6.2), link back to the original Devpost project and profile on every page, and never present Devpost content as our own. **OPEN:** email Devpost about the project before public launch.

---

## 10. Pages and routes (web)

All public pages are statically generated with ISR (revalidated on publish through an on-demand revalidation webhook the pipeline calls). Every page has OG metadata.

| Route | Content |
|---|---|
| `/` | Hero search, top 5 ladder, school top 10, hardest 3 events, methodology teaser, claim CTA (exactly the reference) |
| `/hackers` | Full ladder, paginated (50 per page). Filters: season (all-time or a season), school, country (later). Shows "Provisional" count. |
| `/h/[slug]` | Profile: name, rating, percentile, monthly change, rating-history chart, events table (event, date, placement, prize, rating change), frequent teammates, best duo, claim CTA or claimed badge, "Something wrong?" |
| `/schools` | School ladder, by season |
| `/s/[slug]` | School page: rating, rank, top hackers, recent wins, rival schools nearby in rank |
| `/events` | "Hardest to win" ranking of events and series, with filters: year, in-person or online, size |
| `/e/[slug]` | Event page: odds, field strength, elite count, winners with ratings, judging correlation, link to Devpost, other editions in the series |
| `/series/[slug]` | All editions, series rating trend |
| `/duos` | Best duos board |
| `/how-ratings-work` | Full public methodology: plain language first, math in expandable sections, simulation results |
| `/claim` | Claim flow (§11) |
| `/me` | Signed-in owner dashboard: edit links, bio, school; manage merges; corrections status; hide profile; email preferences |
| `/remove` | No-login removal through the bio code |
| `/og/h/[slug]`, `/og/s/[slug]`, `/og/e/[slug]` | 1200×630 share cards in the design style: giant rank numeral, name, rating, "Top 3%", best win |
| `/upcoming` (Phase 2) | Upcoming events with field-strength forecasts and, for signed-in claimed users, "your odds" |

---

## 11. Claim flow

1. The user clicks "Claim your profile" (on their profile, or globally and then searches themselves).
2. They sign in (magic link or GitHub).
3. We generate a code such as `hl-7KQ2-X9`, valid for 48 hours, and show it with: "Add this anywhere in your Devpost bio, then press Verify. You can delete it afterward."
4. On "Verify", the server fetches `devpost.com/<username>` **once** (rate-limited per user: 5 attempts per hour) and looks for the code.
5. On success: set `people.claimed_by` and `claimed_at`, send a confirmation email, and show any `merge_candidates` ("Are these also you?"), each of which needs its own code.
6. Edge cases:
   - An account that's already claimed by someone else becomes a dispute, routed to admin.
   - A Devpost profile that is private or 404 gets a clear error and a path to admin review.

---

## 12. Quality bar

- **Performance:** public pages have LCP under 1.5s on 4G, the profile JS bundle is under 120kb, and search responds in under 150ms at p95.
- **Accessibility:** WCAG AA contrast (check `--graphite` on `--paper` and `--tile`), visible focus everywhere, full keyboard navigation of rail and search, and charts with text alternatives (a table toggle).
- **SEO:** `sitemap.xml` covers all non-hidden people, schools, events and series. Profiles get canonical URLs and person-appropriate meta. Hidden people return 404 with `noindex`.
- **Tests:**
  - Parsers have 100% fixture coverage.
  - The rating-quality test (§8.5) runs in CI.
  - Playwright covers: search → profile, claim happy path (with a mocked Devpost fetch), corrections submit, remove-me.
- **Observability:**
  - Sentry on web and pipeline.
  - The pipeline logs a run summary to a `pipeline_runs` table (pages fetched, failures, events added, people rated, duration).
  - The weekly crawl opens a GitHub issue automatically if failures exceed 2%.

---

## 13. Roadmap

Work top to bottom. Check items off here as they're done.

### Phase 0: Setup
- [x] Monorepo scaffold per §5; uv project; Next.js app; CI running lint, typecheck and tests (pipeline, web, database jobs)
- [ ] Supabase project linked (needs the owner's Supabase account: `supabase link --project-ref <ref>`)
- [x] Design tokens and font in `globals.css` matching `design/reference.html` (kept in sync by `apps/web/tests/tokens.test.ts`)

### Phase 1: Data (the hard part)
- [x] Save real fixtures: list API page, 3 galleries (big, small, multi-page), 10 project pages (winners, non-winners, multi-event submissions, solo teams), 3 user pages
- [x] Port parsers from the prototype; make every fixture test pass; record findings in §6.6
- [x] `hl check <event-url>`, polite client (rate limit, back-off, robots.txt), local raw cache
- [ ] Crawler with raw storage in Supabase Storage, `raw_pages_index`, checkpoints, `crawl_failures`
- [x] Postgres migrations for §7 (plus RLS/privacy tests in `supabase/tests/`)
- [ ] Loaders; idempotent upserts
- [ ] MLH high-school detection plus `excluded_hackathons`
- [ ] Port ratings, event analysis, duos and simulation to `src/hackladder/rate/` with the §8.5 regression test
- [ ] Fix §8.6 isolated-pool inflation
- [ ] School normalization (§16 OPEN)
- [ ] Backfill run plus spot-check report

### Phase 2: Site core
- [ ] Layout chrome: rail, logo, CTA, menu, progress line, countdown, mobile nav
- [ ] Home, `/hackers`, `/h/[slug]`, `/schools`, `/s/[slug]`, `/events`, `/e/[slug]`, `/series/[slug]`, `/duos`, `/how-ratings-work`
- [ ] Search RPC plus instant dropdown
- [ ] OG share cards

### Phase 3: Claim and trust
- [ ] Auth, claim flow, merges, `/me`, `/remove`, corrections plus a minimal admin review page
- [ ] Emails: claim confirmation, weekly "you moved" digest (opt-in)

### Phase 4: Launch
- [ ] Analytics events: `search`, `profile_view`, `claim_started`, `claim_verified`, `share_card_downloaded`
- [ ] Load test search; Lighthouse ≥ 95 on home and profile
- [ ] Launch plan: hackathon Discords, r/hackathon, X during a big hackathon weekend; seed share cards for top 100 hackers' schools

### Phase 5: Useful
- [ ] `/upcoming` with field-strength forecasts and personal odds

### Later
- Teammate finder; domain leaderboards (an LLM classifies projects by domain, evaluated against a hand-labeled sample); recruiter view; native event hosting (§7.9)

---

## 14. Commands

```bash
# pipeline
cd pipeline
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check . && uv run mypy
uv run hl check https://treehacks-2024.devpost.com/   # crawl and parse one event verbosely (-q: summary only)
uv run python scripts/fetch_fixtures.py               # (re)capture parser fixtures politely
uv run hl crawl list --all
uv run hl crawl events --backfill --chunk 200
uv run hl parse --all
uv run hl rate && uv run hl analyze && uv run hl publish

# prototype (reference only, SQLite)
cd pipeline/prototype && python simulate.py

# web
cd apps/web
pnpm i
pnpm dev
pnpm test && pnpm typecheck && pnpm lint
pnpm e2e

# database
supabase start
supabase db reset          # applies migrations plus seed (fake data)
supabase test db           # pgTAP privacy/RLS tests in supabase/tests/
supabase migration new <name>
```

---

## 15. Decision log

Append-only. Format: `YYYY-MM-DD: decision. Why.`

- 2026-10-14: Name is **HackLadder**. Style is inspired by brandappart.com; the visual source of truth is `design/reference.html`.
- 2026-10-14: Use OpenSkill Plackett-Luce, not Elo. Hackathons are many-team, team-based events.
- 2026-10-14: Event rating is 70% elite count and 30% win odds. In simulation, win odds alone over-rated beginner jams (event correlation 0.46 → 0.84 with the blend).
- 2026-10-14: No Databricks, Kafka, Datadog or Neo4j. The data fits one Postgres database and the rating replay is sequential.
- 2026-10-14: Claim verification is a code in the Devpost bio. Devpost offers no third-party sign-in (as far as we know; **VERIFY**).
- 2026-10-14: High-school events are excluded entirely (minors).
- 2026-10-14: A `projects` row is a project's **entry in one hackathon**, unique on `(source, source_id, hackathon_id)`, not `(source, source_id)`. One Devpost project can be submitted to many events and win different prizes at each (seen: 12 and 21 events).
- 2026-10-14: Prize tier 5, "not a placement" (raffles, participation), ranks with "submitted, didn't place". Tiers are classified on the prize name with `(...)`/`[...]` reward text stripped. Both fix input classification, not the rating math (§8): the prototype was misreading `[1st]` in sponsor rewards as grand prizes.
- 2026-10-14: Private-mode and deleted team members are kept as anonymous seats (`projects.anonymous_members`), never as accounts. They're real teammates, but there's no one to rate or show.
- 2026-10-14: Parsers raise `ParseError` on unexpected structure rather than guessing, so markup changes surface in `hl check` and `crawl_failures` instead of as wrong data.
- 2026-10-14: The gold-table swap copies `*_next` into the live tables in one transaction (`publish_gold()`) rather than renaming tables. Views bind to table OIDs, so a rename swap would leave the public views reading stale data.
- 2026-10-14: Public reads go only through `public_*` views that run with owner rights and apply the privacy rules (hidden people, high-school and excluded events) in one place. New tables get no anon/authenticated grants by default; access is opted into per migration.
- 2026-10-14: `search()` is a security-definer RPC that re-checks `people.hidden` live, so "remove me" is instant even before `search_index` is refreshed. It matches on exact username, name prefix, or trigram similarity / word similarity (typo-tolerant). Ranking still needs tuning against real names in Phase 2.
- 2026-10-14: Local raw-page cache (`pipeline/.cache/raw`, gzipped, keyed by sha256 of the URL) mirrors the `raw-pages` bucket layout, so `hl check` and fixture capture re-run with zero requests. The Supabase Storage backend comes with the crawler.
- 2026-10-14: httpx for the pipeline's HTTP client. It has typed APIs and a mock transport for testing the rate limiter and back-off offline.
- 2026-10-14: The web app is a standalone pnpm project in `apps/web` (no root workspace yet). There's one JS package; add a workspace when a second one appears.

---

## 16. Open questions

- **School data:** does a public Devpost user page show school? **Answered 2026-10-14: no.** Public user pages have no school or education field (checked `aaravwattal`, `NilsIrl`, `dylanjpaulson`; the only "Education" on the page is an interest tag). Devpost may collect school privately for eligibility, but it isn't published. School sometimes appears in the free-text bio ("EE+CS @ Stanford"), which is also shown under the member's name on project pages. So school comes from claims, and school boards start sparse. **Still OPEN, which fallback:** (a) parse school names out of public bios, matched against `schools.aliases` and labeled "from Devpost bio" (public data, but noisy: "ex-Google", "@ Stanford '19"); (b) infer from repeated attendance at one campus's events (weak, label it "inferred"); (c) launch school boards only once at least N claimed profiles exist.
- **Analytics:** PostHog or Vercel Analytics.
- **Mobile nav:** bottom tab bar or full-screen menu only.
- **Domain:** hackladder.com, .dev, or .gg (availability?).
- **Devpost outreach:** before launch or after.
- **Season definition:** Aug–Jul academic year (proposed) or calendar year.

---

## 17. Glossary

- **Rating / score:** displayed number, `1000 + 40(μ − 3σ)`.
- **μ, σ:** OpenSkill skill estimate and its uncertainty.
- **Provisional:** fewer than 3 rated events; shown without a rank.
- **Elite hacker:** global top 5% by conservative rating, with at least 3 events.
- **Win odds:** 1-in-N chance a 90th-percentile team wins a given event.
- **Series:** all editions of one recurring hackathon.
- **Account vs person:** a Devpost account vs a resolved human; one person can have several accounts.
- **Claim:** proving you own an account through a bio code.
- **Gold tables:** the published rating and analysis outputs the site reads.
