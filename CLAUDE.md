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
2. **Events.** Ranking hackathons by how hard they are to win is the headline: every hackathon gets a page with field strength, winners and win odds, and a "hardest to win" board ranks events and recurring series.
3. **School vs school.** School leaderboards, as rivalries get shared. School comes from claimed profiles (§16), so this board fills in over time.
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

**The design reference is `design/reference.html`. Open it in a browser before building any page.** It has three pages (home, profile, event), switched from the dock, and the four shipped themes. If this section and the reference disagree, the reference wins; then update this section.

**The style in one line:** Brand Appart's structure, reskinned as a clean Japanese-tech desktop OS.

- **From brandappart.com:** enormous tight display type, a fixed left navigation, a fixed "Claim your profile" button, big section headlines and a closing line.
- **From 109ichiki.com:** a menu bar, windows with title and status bars, desktop icons, timecodes, a warped grid wallpaper, a boot screen and stickers. Japanese labels were tried and removed (§15).

**Retro in idea, modern in execution.** Nothing is pixelated, nothing is skeuomorphic, and there are no fake bevels. Take inspiration only: never copy either site's assets, copy or marks.

Earlier directions are archived:
- `design/rejected/v1-brandappart.html` (plain Brand Appart look)
- `design/explorations/themes.html` (all 8 candidate themes, with the removed Japanese labels)

### 4.1 Themes and tokens

Four themes ship, in this order everywhere they're listed (dock, `/me` picker, docs): **Paper, Sumi, Sakura, Midnight**. Every color in the UI comes from these tokens; nothing is hard-coded.

| Token | Paper (default light) | Sumi (default dark) | Sakura | Midnight | Use |
|---|---|---|---|---|---|
| `--bg` | `#F2EEE5` | `#171512` | `#ECE8FA` | `#050507` | desktop background |
| `--grid` | `#DCD5C7` | `#2A2621` | `#D3CBF0` | `#1E1E2A` | warped grid lines |
| `--win` | `#FFFDF8` | `#211E1A` | `#FFFFFF` | `#0F0F15` | window body |
| `--chrome` | `#E9E3D8` | `#2A2622` | `#E4DEF8` | `#191922` | title bars, tracks |
| `--chrome-2` | `#DDD6C9` | `#35302A` | `#D6CDF4` | `#24242F` | inactive window lights |
| `--ink` | `#17140F` | `#F2EEE5` | `#1B1530` | `#F3F1FA` | text, primary buttons |
| `--muted` | `#6F685E` | `#A39B8E` | `#6C6488` | `#8E8AA3` | secondary text, rating down |
| `--line` | `#D6CFC2` | `#3A352E` | `#DCD4F5` | `#26263A` | borders, row rules |
| `--accent` | `#FF5B14` | `#FF6A26` | `#FF3D7F` | `#FF2E93` | rating up, sticker, close light, featured outline |
| `--accent-ink` | `#FFFFFF` | `#171512` | `#FFFFFF` | `#0B0B0F` | text on accent |
| `--select` | `#2747FF` | `#6B85FF` | `#1B1530` | `#9B8CFF` | selected row, active nav, focus ring |
| `--select-ink` | `#FFFFFF` | `#0E0E12` | `#D4FF3A` | `#0B0B0F` | text on selection |
| `--rail` / `--rung` | ink / accent | ink / accent | ink / accent | ink / accent | the logo glyph in the menu bar |

**Sumi** is Paper's dark twin: the same warm palette and orange, in ink-wash charcoal. **Midnight** is the high-contrast black-and-fluorescent-pink option.

- **Accent is rationed.** It's used for: rating up, the sticker, the window close light, the featured card outline, the "#1" chip, and the chart's latest point and fill. If you're reaching for accent to make something pop, use size or weight instead.
- **Selection color is the OS highlight**, used for the selected row, the active menu item, the current desktop icon and focus rings. It is never used for decoration.
- **Rating changes:** up is shown in `--accent`, down in `--muted` (never red, since a dip isn't an error), and unchanged as `±0` in `--muted`.
- **Contrast:** every theme must pass WCAG AA for `--ink` and `--muted` on both `--bg` and `--win`. Check Sakura's `--muted` especially.

### 4.2 Typography

Two families, each with one job:

| Family | Job |
|---|---|
| **Bricolage Grotesque** (variable: opsz, wdth, wght) | All display and body text. This is the brand voice. |
| **IBM Plex Mono** | System chrome only: menu bar, window titles, status bars, timecodes, table headers, chips. It's the OS speaking, never content. |

| Role | Size | Settings |
|---|---|---|
| Hero display | `clamp(64px, 9vw, 156px)`; mobile `16vw` | Bricolage wght 800, opsz 96, wdth 82, tracking −0.055em, line-height 0.86 |
| Page title (profile or event name) | `clamp(56px, 7.5vw, 128px)` | same |
| Section display (h2) | `clamp(48px, 6vw, 96px)` | same |
| Rank numerals | 96px for #1, 44px for the rest; mobile 56 / 32 | wght 800, wdth 78, tracking −0.06em |
| Big stat (odds) | up to 190px on the event page, 56px on cards | wght 800, wdth 76–78 |
| Body | 16px / 1.5 | Bricolage wght 400, opsz 14 |
| System text | 11–12.5px | Plex Mono 400–600 |

`font-variant-numeric: tabular-nums` is set globally. There are no all-caps labels and no "→" appended to buttons.

### 4.3 Layout and chrome (the OS)

- **Menu bar** (fixed, 34px, translucent with blur):
  - Left: the logo glyph and "HackLadder".
  - Middle: nav items Hackers, Schools, Events, Crews, Method. The active item takes `--select`.
  - Right: the **countdown in timecode format** `DD:HH:MM:SS` to the next big event, with an accent dot. It replaces Brand Appart's local clock.
- **Desktop icons** (fixed, left): the Brand Appart rail, reskinned. Each is a 52px rounded tile with a lowercase label under it: hackers, schools, events, crews, profile. The current page's tile takes `--select`.
- **Claim button:** fixed top-right below the menu bar, in ink.
- **Windows:** every block of content lives in a window.
  - The title bar has three lights (the first in accent), a file-style title (`search.app`, `~/ladder`, `rating_history`, `treehacks_2026.mov`) and right-aligned meta.
  - An optional status bar at the bottom reads like an OS: "1 of 412,880 selected", "page 1 / 8,258".
  - Radius is 14.
- **Dock** (fixed, bottom-center): quick page links plus the theme swatches. On mobile it becomes a full-width bottom bar, and it replaces the old **OPEN** question about a tab bar vs. hamburger.
- **Wallpaper:** a warped grid (fisheye bulge) drawn as thin vector lines in `--grid`, fixed behind everything, redrawn on resize. Smaller warped grids sit inside media-player screens.
- **Page frame:** max-width 1440, left padding 140px (clearing the icons), and a 16px gutter on mobile with no horizontal scroll.
- **Alignment:** headlines are left-aligned. Section heads have the h2 on the left and a short `--muted` explainer on the right.

### 4.4 Components

- **Search window** (`search.app`): an input with a ⌘K hint and a "Find me" button. Results appear in an instant dropdown (150ms debounce, top 8, grouped as hackers, schools, events). Focus shows a `--select` ring.
- **File-list table:** this is how leaderboards are shown.
  - Mono column headers.
  - The #1 row is shown as the *selected* row (`--select`) with a 96px numeral.
  - The rating column is in mono with the monthly change beneath it.
  - The status bar shows the selection and page.
- **Bar list** (schools): rank, name, a 6px track and a value.
- **Media-player card** (events): a `.mov` title, a screen with a mini warped grid and big "1 in N" odds, the title, a meta line, and transport controls (play button, timecode, scrub bar). The featured card gets a 2px accent outline.
- **Event page:**
  - A big screen window with the odds.
  - A **timeline track** (kickoff, judging, winners) with timecode ticks.
  - A `field` properties window.
  - A `winners` podium window.
- **Profile page:**
  - Giant name (with the owner's photo once claimed), then chips: rank (accent), percentile, school, Devpost handle, website / GitHub / LinkedIn, claimed.
  - `rating_history`: a stats row plus a line chart with an accent area fill and the latest point marked.
  - `trophy_cabinet`: every placing prize (tiers 1–4) as tiles, best first or in the owner's order.
  - `event_log` (`projects` in the cards and compact layouts): date, event, placement and change. Owners pin up to 3 projects first, hide projects (display only, ratings unchanged) and pick list, cards or compact (`people.profile_layout`, edited on `/me`).
  - `properties` and `frequent_teammates` windows, then the share and correction buttons.
- **Sticker:** a round accent badge, rotated −12°, used for announcements ("Season 2026"). One per page at most.
- **Chips:** mono, pill-shaped. Only the most important chip uses the accent.
- **Provisional:** hackers with fewer than 3 rated events show a "Provisional" chip in place of a rank.
- **Rank tier badge:** next to the rating, the hacker's rank tier (§8.7), e.g. "Architect" or "Hall of Fame", as a chip. Text only, no game-style emblems; accent stays rationed.
- **Empty states** say what to do: "No results for 'kori r'. Try your Devpost username."

### 4.5 Motion

- **One orchestrated moment: the boot screen.** On the first visit per session, a centered panel shows `hackladder` on the left and `loading... 0%` on the right, a thin accent progress bar, and `412,880 hackers` / `12,400 hackathons` (live counts) beneath. It runs about 1 second, then fades out.
  - Never call it an "os" in the copy.
  - Never show it twice in one session (track with `sessionStorage`, wrapped in try/catch).
  - Skip it under `prefers-reduced-motion`.
  - It must never delay real content: render the page underneath, and the boot screen only covers it.
- Nothing else animates on load. No scroll-triggered entrances.
- **Live elements:** the menu-bar countdown ticks every second.
- Motion that answers an action is welcome: the search dropdown, a window "opening" when a row is clicked, a claim succeeding, a rating counter ticking up on profile load.
- Respect `prefers-reduced-motion` everywhere.

### 4.6 Copy voice

The voice is plain, confident and a little competitive: "Every hacker who's won, ranked." "You're probably already on here." Errors explain how to fix the problem and never apologize. Never say "Elo" in UI copy; say "rating". All UI text is in English; there are no Japanese labels.

### 4.7 Theme behavior

- **First visit:** follow the device. Light mode gets **Paper**; dark mode gets **Sumi**.
- **Switching:** the dock swatches switch the theme. The choice is saved in `localStorage` (`hl-theme`) as a per-viewer convenience, wrapped in try/catch. A signed-in user's choice also saves to their account (`people.ui_theme`) so it follows them across devices.
- **Profile themes (claim perk):** a claimed hacker picks a theme for their **profile page and share card** (`people.profile_theme`).
  - Visitors see that profile in the owner's theme. The menu bar shows a small "theme: Sakura" chip and a "use mine" toggle that switches back to the viewer's own theme.
  - Unclaimed profiles render in the viewer's theme.
- **OG share cards** (`/og/h/[slug]`) render in the profile's theme. Unclaimed profiles use Paper.
- **Implementation:** set `data-theme` on `<html>` before first paint, using a tiny inline script in `<head>`, to avoid a flash of the wrong theme. Each theme is one CSS block of the tokens in §4.1. Adding a theme later means adding one block, one swatch and one OG palette; the archived candidates (Washi, Platinum, Metro, Matcha) are ready in `design/explorations/themes.html`.

### 4.8 Logo: the H-ladder mark

The mark is a slanted H drawn as a two-rung ladder, with the top rung in signal orange. It should be as simple and rigid as a big-tech mark: one shape, two colors, and it still works in one color. `design/logo/brand.html` shows every approved use.

**Construction** (`design/logo/mark.py` generates every file, so edit the generator, never the SVGs). On a 100-unit grid, before a 12° forward skew around the center:

- **Rails:** 19 × 84 at x=20 and x=61, corner radius 3.
- **Rungs:** 24 × 12, tucked 1 unit into each rail. The top rung sits at y=24 in `--signal`; the crossbar sits at y=54 in ink.
- **Ladder read:** the rails run past both rungs at the top and bottom. That overrun is what makes it a ladder and not just an H.

**Files:**

| File | Use |
|---|---|
| `mark.svg` | Primary: ink rails, orange top rung |
| `mark-reverse.svg` | On dark backgrounds |
| `mark-mono.svg` | One color (print, embossing, single-color contexts) |
| `avatar-ink.svg` | Ink circle; GitHub, X, Discord, social avatars |
| `avatar-signal.svg` | Orange circle with an ink top rung; alternate avatar |
| `app-icon.svg` | Ink rounded square (radius 22.5%); PWA and app icons |
| `favicon.svg` | App icon with a larger glyph, for 16px |

**Lockup:** the mark followed by the "HackLadder" wordmark in Bricolage Grotesque (wght 800, wdth 82, −0.05em tracking). Mark height is about 1.4× the wordmark's cap height, with a gap of about 0.2× the mark height. In the site header the wordmark is stacked ("Hack / Ladder") next to a 48px mark.

**Rules:**
- The orange top rung is the only orange in the mark. Never recolor the rails.
- **In-site exception:** the small glyph in the menu bar uses the theme tokens `--rail` and `--rung`, so its top rung matches the theme accent (orange in Paper and Sumi, pink in Sakura and Midnight). Everywhere else (logo files, favicon, app icon, social avatars, OG cards) uses the official orange.
- Minimum size is 16px (tested).
- Clear space around the mark is at least one rail width.

**Don't:**
- add rungs
- change the slant
- outline it, put it on a gradient, or add shadows
- put it inside headlines (it reads as a stray letter)
- redraw it with a font glyph

Rejected explorations, with the reasons each was rejected, are in `design/logo/rejected/`: brown wood (too illustrative), pixel art (too retro), and converging or stepped rails (read as an "A" or as broken).

---

## 5. Repository layout

```
hackladder/
├── CLAUDE.md                  ← this file
├── design/
│   ├── reference.html         ← visual source of truth (4 themes, 3 pages)
│   ├── logo/                  ← mark.py generator + SVGs; brand.html shows approved uses
│   ├── explorations/          ← themes.html: all 8 candidate themes
│   └── rejected/              ← earlier directions, kept for reference
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
│   ├── config/                ← default prize tier rules (seeded into the DB, §8.7)
│   ├── src/hackladder/
│   │   ├── crawl/             ← fetch, cache, rate limit, checkpoints
│   │   ├── parse/             ← pure functions: HTML → dataclasses
│   │   ├── load/              ← upsert into Postgres
│   │   ├── resolve/           ← entity resolution
│   │   ├── rate/              ← rating replay, crews, event analysis
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
2. Filter: `winners_announced = true`, not `invite_only`, not a high-school event (§9), **and the event is in scope** (§8.7): by default an in-person MLH member event; the admin can include any other event or exclude any event in `hackathon_settings`. Everything else (open online jams, corporate challenges) is out of scope for ratings. That also keeps re-submitted projects (§6.6) from farming results, and makes the backfill far smaller.
3. `hl crawl events` crawls galleries and projects (use `--limit` to work in chunks), events per chunk, newest first. Checkpoints go in `crawl_checkpoints`, so killing and restarting it loses nothing.
4. `hl parse --all` parses from storage, then `hl resolve`, `hl rate`, `hl analyze`, `hl publish`.
5. Run a spot-check script that prints 20 random events with parsed winners and team members next to their Devpost URLs, for a human to eyeball.

### 6.5 Parsing outputs

Parsers are **pure functions** (`html → dataclass`), with no I/O, and each has fixture tests.

- `parse_hackathon_list(json) -> HackathonListPage(hackathons: tuple[HackathonMeta], total_count, per_page)`
- `parse_gallery(html) -> GalleryPage(entries: tuple[GalleryEntry], has_next: bool)`
- `parse_project(html, hackathon_host) -> ProjectPage(members, submissions, prizes_at_this_event, built_with, description_text, ...)`
- `parse_user(html) -> UserPage(username, display_name, bio?, location?)`. There is no `school`: Devpost doesn't publish one (§16). `bio` is kept because claim verification reads it (§11).
- `parse_mlh_season(html) -> MlhSeasonPage(season, events: tuple[MlhEvent(name, starts_at, ends_at, format, location, website_url, is_high_school, ...)])`

Markup the parser wasn't written for raises `ParseError` instead of guessing, so it shows up in `hl check` and `crawl_failures`.

Prize tiers (the owner's call, 2026-10-14):

| Tier | Meaning | Examples |
|---|---|---|
| 1 | Grand prize / best overall / 1st overall | "Grand Prize ($10k Cash)", "1st Place Overall" |
| 2 | Main track winner, or overall runner-up | "Health Grand Prize", "Best Hardware Hack", "2nd Place" |
| 3 | Sponsor challenge, judged by a sponsor | "Reazon Holdings: Best Senior-Focused Hack" |
| 4 | MLH and "best use of X" tech prizes | "[MLH] Best Use of ElevenLabs", "Best Use of Vultr" |
| 5 | Not a placement | "Workshop Raffle Prizes" |

Many events have no "best overall" at all, only topic tracks, so track winners are the second-biggest result. Some sponsor challenges are genuinely hard; promote those individually with an override rather than loosening the rules.

**Tiers are config, not code.** The live rules are in Postgres and edited on the admin page (§8.7); `pipeline/config/prize_tiers.toml` is the default set, loaded with `hl config seed`. A rule set holds the ordered rules (first match wins, case-insensitive regex on the name with `(...)`/`[...]` reward text removed), the default tier for names no rule matches, and per-event overrides for exact prize names. Every rule lists real example names, and the tests fail if an example doesn't land in its rule's tier. `uv run hl prizes` prints every cached prize name with its tier and the rule that decided it, to review after editing. Parsers return raw prize names only; tiers are derived when loading, so a config change re-tiers everything without re-crawling.

### 6.6 Devpost field notes (keep this updated)

- The list API returns `prize_amount` as an HTML string (`$<span data-currency-value>1,024</span>`). Strip the tags before parsing.
- `submission_period_dates` comes in forms like `Aug 21 - Oct 02, 2026`, `Feb 16 - 18, 2024` and `Dec 28, 2025 - Jan 02, 2026`. The end date is what orders events.
- A project page lists **every** hackathon the project was submitted to, with that event's prizes. Only take prizes from the block whose link matches the current hackathon host.

Verified against the live site on 2026-10-14 (fixtures in `pipeline/tests/fixtures/`, provenance in `manifest.json`; `hl check https://treehacks-2024.devpost.com/` parses all 329 projects with zero warnings):

- **robots.txt** allows everything for `*`; it only blocks a few named bots (BLEXBot, Omgilibot, Omgili, ImagesiftBot, Bytespider).
- **List API.** 9 per page; `meta.total_count` was 13,889 ended events. The default order is **not chronological**: pages 40 and 120 were sorted by `registrations_count` descending, with ties newest first. `order_by=deadline` is mostly newest-ending first, but the first ~4 results on page 1 are pinned featured events of any date (`recently-added` and `submission-deadline` behave similarly). `hl crawl list --incremental` sorts by deadline and stops at the first page where every event ended before the cutoff. The `search=` parameter is fuzzy (unrelated events come back), so match the exact URL. **Paging the deadline order skips events** (found 2026-10-20): dozens of events end the same weekend, their order among ties shifts between requests, and DubHacks '26 (ended Oct 18) never appeared in pages 1–26. `--incremental` therefore also searches every MLH event that ended in the settle window by name (`search_mlh_events`). `registrations_count` can be nonsense (CodeCatalyst 2024 had **-6**), so negative or non-integer counts load as null. `prize_amount` is not always dollars: `₹ <span…>1,475,001</span>` and `€<span…>26,200</span>` exist, so `prize_total_usd` is null for those.
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
- **Track grand prizes and "Sponsor: Prize" names.** TreeHacks calls its track winners "Education Grand Prize", "Health Grand Prize" and so on; these are tier 2 (main track), not tier 1. Sponsor challenges are usually written `Sponsor: Prize name` (e.g. "Fetch.ai: Smartest AI Agent Prize"); the colon prefix maps them to tier 3. Both are rules in `config/prize_tiers.toml` (§6.5).
- **Multi-event submissions are rare at in-person events but extreme online.** None of the 329 TreeHacks 2024 projects (and none of 27 sampled elsewhere) were submitted to a second event, yet on Local Hack Day: Share (2020) `sequoia-tgnryh` went to 12 events and `smarttracker-covid19` to 21, including "Teens Take On COVID" (a minors-rule signal, §9). Fetch each project page **once** and parse it per event; don't refetch it for every gallery it appears in.
- **User pages have no school field** (checked three users; §16). They show name, `(username)`, an optional free-text bio (`#portfolio-user-bio`), and `#portfolio-user-links` (location via `.ss-location`, plus website/GitHub, which we don't parse, §9.3). The bio is also shown under each member's name on project pages.
- The software search API (`/software/search?query=`) returns JSON with members and a winner flag but **not** which hackathons a project was submitted to.

MLH, verified 2026-10-15 (fixtures in `pipeline/tests/fixtures/mlh/`):

- **robots.txt** allows `/seasons/` (it blocks `/account/`, `/v4/`, `/graphql` and a few others).
- **Season pages are an Inertia.js app.** All data is JSON in `<script type="application/json" data-page="app">` (`component: "SeasonEvents/Index"`), in `props.pastEvents` and `props.upcomingEvents`. Each event has an `id` (UUID), `slug`, `name`, ISO `startsAt`/`endsAt` (UTC), `formatType` (`physical`, `digital`, `hybrid_physical`), `location`, `venueAddress`, `websiteUrl` and `customFields.underserved_types`.
- **Paging:** 24 past events per page, newest first, via `?page=N`; for a finished season a page past the end has empty lists. The `month` filter in the props is ignored as a query parameter. The 2025 season was 195 events over 9 pages.
- **The current season repeats its upcoming events on every page** (verified 2026-10-16): 2027 had 49 past and 69 upcoming events, and every page carried all 69 upcoming ones, so from page 4 on pages were never empty and the crawl ran to its 40-page guard. `hl mlh crawl` stops a season at the first page that adds no new event ids.
- **Seasons before 2021 are regional.** `seasons/2020/events` is a 404; the schedules are at `seasons/na-2020` (`seriesName` "2020 NA") and `seasons/eu-2020` ("2020 Europe"). The crawler tries `YYYY` first and falls back to `na-YYYY` and `eu-YYYY`, storing MLH's `seriesName` as `mlh_events.season`. mlh.io now redirects to www.mlh.com.
- **An MLH season runs July to June** (season "2025" = 2024-07-12 to 2025-06-27). Ours runs August to July (§16), so map by date, not by MLH season name.
- **High school flag:** `customFields.underserved_types` contains `"High School Students Only"` (6 of 195 events in 2025, e.g. JAMHacks, MasseyHacks). Use it alongside the §9 keyword rules; don't rely on it alone.
- **MLH rarely links to Devpost:** `websiteUrl` is the event's own site (2 of 195 pointed at Devpost), so MLH events must be matched to Devpost events by name and dates.
- **Not every flagship is MLH:** TreeHacks and HackMIT were absent from the 2025 season. PennApps, Cal Hacks, HackGT, MHacks, Hack the North, HackPrinceton, LA Hacks, nwHacks, HackTX, HackUMass, Hack@Brown and BoilerMake were members. Non-MLH flagships need the vetted list.
- **Online MLH events** (Global Hack Week weeks, "Hack Your Portfolio") have `formatType: "digital"`, no venue, and location "Everywhere, Worldwide".

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
- `people(id, slug, display_name, school_id → schools, claimed_by → auth.users, claimed_at, hidden bool, linkedin_url, github_url, website_url, bio, open_to_recruiters bool, ui_theme text, profile_theme text check (profile_theme in ('paper','sumi','sakura','midnight')), avatar_path text /* avatars bucket, <person id>/<file> */, profile_layout jsonb /* valid_profile_layout() */)`. One row per human. Entity resolution maps accounts to people (§7.5).
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
- `crews(members bigint[], size, events_together, placements_together, overperformance, score)`: public only while every member exists and none is hidden
- `school_ratings(school_id, season, top10_avg, members_rated, rank)`

Write all of these into `_next` shadow tables, then swap them in one transaction, so the site never reads a half-built state.

### 7.7 Row-level security

- Public (anon) can `select` only from views: `public_people` (where not hidden), `public_ratings`, `public_hackathons`, and so on. No direct table access.
- Authenticated users can `update` only their own `people` row, only the owner-editable columns (links, bio, school, open_to_recruiters, hidden, ui_theme, profile_theme).
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
- Each event becomes a ranking by prize tier (§6.5): 1 grand / overall, 2 main track or overall runner-up (also a winner badge with no prize name), 3 sponsor challenge, 4 MLH or "best use of X" tech prize, then everyone who submitted but didn't place, tied (this group includes tier 5, "not a placement").
- Each project's entry at each event counts on its own (§15). A team is rated as its members, including anonymous seats (private/deleted accounts), which count as unrated average players.
- A person on two projects at one event keeps only their best-placed one (`dedupe_people`).
- **Field-size correction:** Plackett-Luce divides every update by c ≈ √(teams), which made a win at an 11-team event worth 3× one at a 150-team event. Each event's change in μ, and its shrink in σ, are scaled by `(teams / 50)^0.75` (`field_scale`, capped at 6), so a bigger field is worth more (§15).
- **Extra prizes:** each placing prize after a team's best one adds a bonus (tier 1/2: 0.5, tier 3: 0.35, tier 4: 0.25, capped at 1; `prize_bonus`). It breaks ties within the best prize's tier and multiplies the team's μ gain by `1 + bonus × min(1, field_scale)` (§15).
- Display score: `1000 + 40 × (μ − 3σ)`, so new hackers start at about 1000 and a single lucky win can't top the board.
- Leaderboard eligibility: at least 3 rated events (the prototype used 2; **use 3**). Below that, the profile is labeled "Provisional".

### 8.2 Event ranking (`prototype/analyze_events.py`)

- Every entrant is judged by their **final** (hindsight) rating, conservatively (μ − 1σ), so first-timers count as unproven rather than as wildcards.
- `win_odds` is the 1-in-N chance that a team at the global 90th percentile takes 1st against that exact field. It's computed exactly by numerical integration, with per-event noise **calibrated** on who actually won.
- `elite` is the number of entrants who end up in the global top 5%.
- **Event rating = 70% z(log1p(elite)) + 30% z(log(win_odds)).** Elite-heavy on purpose: win odds alone over-rated big online beginner jams whose regulars only ever play each other.
- Series rating is the mean of edition z-scores, shrunk by n/(n+1).
- `judging` is the rank correlation between pre-event team strength and finish. It's shown on event pages as context, not used in the rating.

### 8.3 Crews (`crews`)

A crew is two or more people who were on the same team at 2 or more events (`rate/crews.py`). A group is kept only if no bigger group has exactly the same events, so three people who always hack together are one crew, not also three pairs. Score = (placements + 1)/(events + 4) + 0.5 × overperformance × events/(events + 3). (Replaced duos, pairs with 3+ events, on 2026-10-20.)

### 8.4 Schools

School rating = mean score of the school's top 10 non-provisional hackers who were active this season (Aug–Jul). A school needs at least 5 rated members to appear.

### 8.5 Validation: the simulation is a regression test

`prototype/simulate.py` generates hackers with hidden true skill, recurring series with hidden prestige, and big beginner-only online jams. Port it to `tests/test_rating_quality.py` and assert these minimums (latest results in brackets):

| Metric | Floor | Last measured |
|---|---|---|
| Hacker rank correlation with true skill (3+ events) | ≥ 0.55 | 0.62 |
| Event rating vs true win odds | ≥ 0.75 | 0.84 |
| Series rating vs true prestige | ≥ 0.80 | 0.88 |
| Beginner jams in the event top 20 | 0 | 0 |
| Planted synergy duo's rank among crews | top 10 | #1 |

### 8.6 Known issue to fix before launch (Phase 1 task)

**Isolated-pool inflation in hacker ratings.** Hackers who mostly compete in big beginner online jams rise because nobody strong ever beats them. With jams in the simulation, hacker ratings (0.59) are no better than plain win rate (0.60). Candidate fixes, to evaluate in the simulation:

- (a) Weight each event's update by field strength, for example scaling the update's effect by a function of the event's `elite` count.
- (b) Cap the rating gain from events whose field mean is far below the hacker's own rating.
- (c) Report a "proven" score that only counts events with at least k elite entrants.

Pick whichever raises hacker correlation the most without breaking the other floors, and log the decision in §15.

**2026-10-20:** (a) was tried on top of the field-size correction (strength factor exp(α·(top-10% pre-event μ−σ − global 90th pct)), α 0.5 to 1.5): hacker correlation fell from 0.62 to 0.55–0.59, so it was not adopted. The field-size correction alone raised it from 0.59 to 0.62. (b) and (c) are still open.

---

### 8.7 Admin-configurable rating system

The owner tunes the system from the website (`/admin`), not by editing code, because tiers and eligibility change over time. **Config lives in Postgres and is an input, like `corrections`:** ratings are always rebuilt from scratch from raw data plus the current config, and every run stores a snapshot of the config it used in `pipeline_runs.config_snapshot`, so any published rating can be reproduced.

| What | Table | Effect |
|---|---|---|
| Event eligibility and event tier | `hackathon_settings` | `counts`: `auto` (in-person MLH member event counts, anything else doesn't), `include` or `exclude`. `event_tier` (S/A/B/C, from `event_tiers`) is a badge and filter only: how much a win is worth always comes from field strength, so tiers can't double-count or be gamed. High-school and `excluded_hackathons` events never count, whatever the setting (§9). |
| Prize tier rules | `prize_tier_rules` | Ordered rules: first match wins (§6.5). Each has examples that must land in its tier. |
| Prize overrides | `prize_tier_overrides` | Exact prize name at one hackathon, fixed tier. |
| Rank tiers | `rank_tiers` | Display bands over non-provisional hackers by percentile, plus a top-N title. Defaults: Legend top 1%, Principal 5%, Architect 15%, Shipper 35%, Committer 60%, Hello World everyone else; Hall of Fame = top 100 overall. |
| Global settings | `rating_settings` (one row) | Default prize tier, provisional threshold (3 events), months until inactive (18), whether MLH online events count. |
| History | `config_changes` | Every insert, update and delete on the tables above, with who did it and the old and new rows. |

The admin pages live at `/admin` (email magic-link sign-in at `/sign-in`). Every page and Server Action calls `requireAdmin()`, and non-admins get a 404. The browser preview of prize tiers (`apps/web/lib/prize-tiers.ts`) mirrors the pipeline, and a test runs every default example through both. Only admins (`admins` table, `is_admin()`) can read or write these tables; the public sees rank and event tier names through views. Changes take effect at the next rating run; the admin page has a "Recompute ratings" button that starts one. Changing the rating *math* (formula constants, the model) is still a code change that needs the §8.5 simulation rerun.

**Rank presentation** (owner's call, 2026-10-15): the rating number stays primary (CS2-Premier-style), with a named tier badge (Valorant/League-style, hacker-flavored names). One all-time rating that never resets; each Aug–Jul season gets its own board (biggest climb, peak rating) and end-of-season badges. People with no rated event in 18 months drop off the live leaderboard but keep their rating and profile; there is no decay.

## 9. Privacy, safety and fairness (hard rules)

1. **No minors.** Exclude high-school hackathons entirely: MLH high-school events, titles or themes containing "high school", "HS", "middle school", "secondary", or "for teens". Keep an admin-editable `excluded_hackathons` list. If a person's only events are excluded, they don't exist on HackLadder. **When in doubt, exclude.**
2. **Public data only.** Profiles are auto-created only from what a person already published on Devpost: username, display name, projects and prizes. No emails, no avatars pulled from anywhere (render initials), no location unless the person adds it. A claimed owner may upload their own photo (owner's call, 2026-10-21): re-encoded in the browser to a 512px WebP (which drops EXIF/GPS), max 1 MB, stored in the `avatars` bucket in a folder only they can write, and shown only while the profile is claimed.
3. **No LinkedIn scraping, ever.** LinkedIn, GitHub and website links come only from the owner after claiming.
4. **"Remove me" is instant and unconditional.** It's available without an account through the bio-code check, and it hides the person everywhere. Their past results still count for opponents' ratings, but they're shown as "Hidden hacker".
5. **Corrections are easy** and reviewed within a week. Every profile has a "Something wrong?" link.
6. **Recruiter features** only ever show people who claimed their profile **and** opted in.
7. Respect Devpost: polite crawling (§6.2), link back to the original Devpost project and profile on every page, and never present Devpost content as our own. Email Devpost about the project **after** launch (owner's call, 2026-10-14).

---

## 10. Pages and routes (web)

All public pages are statically generated with ISR (revalidated on publish through an on-demand revalidation webhook the pipeline calls). Every page has OG metadata.

| Route | Content |
|---|---|
| `/` | Hero search, top 5 ladder, school top 10, hardest 3 events, methodology teaser, claim CTA (exactly the reference) |
| `/hackers` | Full ladder, paginated (50 per page). Filters: season (all-time or a season), school, country (later). Shows "Provisional" count. |
| `/h/[slug]` | Profile: name, rating, percentile, monthly change, rating-history chart, events table (event, date, placement, prize, rating change), frequent teammates, best crew, claim CTA or claimed badge, "Something wrong?" |
| `/schools` | School ladder, by season |
| `/s/[slug]` | School page: rating, rank, top hackers, recent wins, rival schools nearby in rank |
| `/events` | "Hardest to win" ranking of events and series, with filters: year, in-person or online, size |
| `/e/[slug]` | Event page: odds, field strength, elite count, winners with ratings, judging correlation, link to Devpost, other editions in the series |
| `/series/[slug]` | All editions, series rating trend |
| `/crews` | Best crews board (`/duos` redirects here) |
| `/how-ratings-work` | Full public methodology: plain language first, math in expandable sections, simulation results |
| `/claim` | Claim flow (§11) |
| `/me` | Signed-in owner dashboard: edit links, bio, school; **profile theme picker** (Paper, Sumi, Sakura, Midnight, with a live preview of profile and share card); manage merges; corrections status; hide profile; email preferences |
| `/remove` | No-login removal through the bio code |
| `/og/h/[slug]`, `/og/s/[slug]`, `/og/e/[slug]` | 1200×630 share cards styled as an OS window on the warped grid: giant rank numeral, name, rating, "Top 3%", best win. Profiles render in their owner's `profile_theme`. |
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
- **Accessibility:** WCAG AA contrast (check `--muted` on `--bg` and `--win` in every theme), visible focus everywhere, full keyboard navigation of rail and search, and charts with text alternatives (a table toggle).
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
- [x] Supabase project linked; migrations applied to the hosted project (2026-10-15)
- [x] Design tokens and font in `globals.css` matching `design/reference.html` (kept in sync by `apps/web/tests/tokens.test.ts`)
- [x] Design tokens for all four themes, both font families, and the no-flash theme script in `globals.css` and the root layout, matching the redesigned `design/reference.html` (kept in sync by `tests/tokens.test.ts`)

### Phase 1: Data (the hard part)
- [x] Save real fixtures: list API page, 3 galleries (big, small, multi-page), 10 project pages (winners, non-winners, multi-event submissions, solo teams), 3 user pages
- [x] Port parsers from the prototype; make every fixture test pass; record findings in §6.6
- [x] `hl check <event-url>`, polite client (rate limit, back-off, robots.txt), local raw cache
- [ ] Crawler with raw storage in Supabase Storage, `raw_pages_index`, checkpoints, `crawl_failures`
- [x] Postgres migrations for §7 (plus RLS/privacy tests in `supabase/tests/`)
- [x] Loaders; idempotent upserts
- [x] Parse MLH season pages (`parse_mlh_season`)
- [x] `hl crawl list` (checkpointed, raw pages kept, keyword high-school detection) and `hl mlh crawl`/`hl mlh match` with the `/admin/mlh` review page; matches set `is_mlh` and MLH's high-school flag
- [x] `hl crawl events`: galleries and project pages for in-scope events, newest first, checkpointed; loaders for projects, prizes, members, accounts and people (one person per account)
- [x] Admin-configurable rating system (§8.7): config tables and change log; pipeline reads config from the DB; email sign-in; `/admin` pages for events, prize tiers, ranks and settings, change log
- [x] Admin "Recompute ratings" button (starts the Rate workflow; needs GITHUB_DISPATCH_TOKEN) and the nightly rate + weekly crawl workflows
- [x] Configurable prize tiers (`config/prize_tiers.toml`, `hl prizes`)
- [x] Port ratings, event analysis, duos (now crews) and simulation to `src/hackladder/rate/` with the §8.5 regression test (reproduces the prototype exactly); `hl rate` rebuilds and publishes everything
- [ ] Fix §8.6 isolated-pool inflation
- [ ] School normalization for owner-entered schools (§16)
- [ ] Backfill run plus spot-check report

### Phase 2: Site core
- [x] OS chrome: menu bar with timecode countdown, desktop icons, claim button, window component, dock with theme switcher, warped-grid wallpaper, boot screen, mobile bottom bar
- [x] Home, `/hackers`, `/h/[slug]`, `/schools`, `/s/[slug]`, `/events`, `/e/[slug]`, `/series/[slug]`, `/crews`, `/how-ratings-work`, `/search`, `/upcoming` (schedule only), sitemap, robots
- [ ] Season boards on `/hackers` (biggest climb, peak rating per Aug–Jul season, §8.7)
- [x] Search RPC plus instant dropdown (⌘K)
- [x] OG share cards (`/og/h|s|e/[slug]`, profile theme for claimed hackers)

### Phase 3: Claim and trust
- [x] Auth, claim flow, merges, `/me` (with the profile theme picker), `/remove`, corrections plus `/admin/corrections`
- [ ] Pipeline applies approved `remove_project` / `add_to_project` corrections in `hl rate` (today an admin fixes the input by hand)
- [ ] GitHub OAuth sign-in (needs the provider enabled in Supabase)
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
uv run hl prizes [--default] [--event E] [--csv out.csv]  # review how cached prize names are tiered
uv run hl config seed [--replace]                  # load default prize rules into the DB (§8.7)
uv run hl config show                              # the config the next rating run would use
uv run hl schools load                             # universities for the /me school picker (safe to rerun)
uv run pytest -m db                                # tests needing DATABASE_URL (a migrated Postgres)
uv run hl crawl list [--incremental] [--max-pages N] [--restart]  # full crawl resumes from its checkpoint
uv run hl mlh crawl && uv run hl mlh match    # MLH seasons, then match them to Devpost (review at /admin/mlh)
uv run hl crawl events [--limit N] [--slug S]  # galleries + projects for in-scope events, resumable
uv run hl parse --all
uv run hl rate                                 # replay, analyze, write *_next, publish_gold(), refresh search
curl -X POST $SITE/api/revalidate -H "Authorization: Bearer $REVALIDATE_SECRET"  # refresh cached pages (the workflows do this)

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
- 2026-10-14: Ratings cover only MLH member events and a hand-vetted list (`config/vetted_events.toml`). The owner cares about competitive, legitimate events; open online jams are noise and invite re-submission farming.
- 2026-10-14: Prize tiers are owner-defined: grand/overall 1, main track or overall runner-up 2, sponsor challenge 3, MLH/"best use of" 4, not a placement 5. Many events have only topic tracks, so track wins rank right after grand prizes. Rules, the default and per-event overrides live in `config/prize_tiers.toml` (versioned inputs, §2), and parsers emit raw names only.
- 2026-10-14: Each project-at-event entry counts on its own. Anonymous team seats count as unrated average players in the team rating.
- 2026-10-14: Product priority: ranking hackathons is pillar 2, school vs school is pillar 3. School comes only from claimed owners; season is Aug–Jul; Devpost gets an email after launch.
- 2026-10-15: The rating config (event eligibility and tiers, prize rules and overrides, rank tiers, settings) moves from TOML into Postgres with an admin UI. The owner wants to tune it on the site as things change. Config is a versioned input with a change log and a per-run snapshot, so ratings stay reproducible. This supersedes `vetted_events.toml`; `prize_tiers.toml` becomes the default seed.
- 2026-10-15: Rank presentation: rating number plus a hacker-flavored tier badge, an all-time rating with season boards, no decay (inactive after 18 months drops off the live board), and event tiers that are labels, not multipliers. Hackers compete only a few times a year, so resets and decay would make ranks noisy and unfair.
- 2026-10-16: Raw pages are stored in the local gzipped cache for now, with `raw_pages_index.storage_path` pointing at it. The backfill runs on a laptop (§3); moving the store to the `raw-pages` bucket comes with the scheduled GitHub Actions crawl, which needs a service-role key.
- 2026-10-16: MLH events are matched to Devpost by name and a ±3-day deadline window. Clear winners are applied automatically; the rest go to `/admin/mlh`. Admin decisions are never overwritten, and a trigger keeps `hackathons.is_mlh` in step with accepted matches.
- 2026-10-16: MLH matching ranks candidates by how the names relate (same name > one contains the other > merely similar) before the fuzzy score, and an exact name no other candidate shares is accepted automatically even with a similar runner-up. Why: the fuzzy score alone suggested "hackPHS 2022" for HackPSU, over "HackPSU Fall 2022"; on the live data the exact rule moved 34 suggestions to automatic, all correct, and changed no existing automatic match.
- 2026-10-16: `/admin/mlh` is a work queue. The matcher stores its top 3 candidates per event (`mlh_event_matches.candidates`), so fixing a suggestion is one click or key. "Likely right" suggestions (same or contained name, deadline within a day, no rival name) come pre-checked for a batch confirm, decisions are optimistic with undo, and events that haven't happened yet have their own tab. Why: the first full crawl left 591 events to review one form at a time.
- 2026-10-16: `hackathon_strength.field_mean`/`top_field` hold the hindsight values from the event analysis (final ratings), not the prototype's pre-event values, because those are what event pages show. Ranks come from prize names re-tiered with the live config at rate time, so admin tier changes apply without re-crawling.
- 2026-10-16: The hero headline drops the circled chevron; a mark inside a headline reads as a stray letter.
- 2026-10-16: The logo is the flat H-ladder mark (a slanted H with two rungs and an orange top rung), refined to big-tech standards with mono, reverse, avatar and app-icon variants. Brown wood and pixel-art versions were explored and rejected.
- 2026-10-16: Reskinned as "HackLadder OS": Brand Appart structure plus a clean Japanese-tech desktop (menu bar, windows, timecodes, warped grid), inspired by 109ichiki.com. Claimed profiles choose their profile and share-card theme, as a claim perk.
- 2026-10-16: Themes are Paper (default light), Sumi (default dark), Sakura and Midnight, in that order. Japanese labels were removed. The boot screen stays, reading "hackladder" and "loading...", never "os".
- 2026-10-16: Every public page reads through one security-definer SQL function (`ladder`, `hacker_page`, `event_page`, ...; migration `20261016000400`) with a session-less client, cached with `"use cache"` under the `ratings` tag and revalidated by `/api/revalidate` after each rating run (hourly lifetime as the fallback). Why: the privacy rules stay in the database in one place, and cached reads can't depend on cookies.
- 2026-10-16: Claim and "remove me" bio codes are checked inside Postgres (`verify_claim`, `verify_removal`) with the `http` extension, which fetches `devpost.com/<username>` once and only reads `#portfolio-user-bio`. Why: a check in the web app could be skipped by calling the database directly, and this needs no service-role key in Vercel. 5 checks per hour per user or username.
- 2026-10-16: Verifying a second Devpost account while you already own a profile merges it: the account moves to your person and the emptied person is deleted (§7.5). Schools an owner can't find arrive as `set_school` corrections; approving one creates or reuses the school.
- 2026-10-16: The rating chart is server-rendered SVG (with a table alternative), not Recharts. Why: it's one line and a fill, and the profile ships no chart JavaScript (§12 bundle budget). Event pages show field strength in μ, not as a rating, because `field_mean`/`top_field` are mean final μ (§8.2).
- 2026-10-20: Each event's rating update is scaled by `(teams / 50)^0.75` (capped at 6). Plain Plackett-Luce gave a fresh 1st place +45 at 11 teams and +9 at 300, so the live #1 and #2 were a single win at an 11-team event. Simulation (§8.5), before → after: hacker correlation 0.593 → 0.622, event 0.837 → 0.837, series 0.890 → 0.882, beginner jams in the event top 20 0 → 0, planted duo #1 → #1; fresh 1st-place gain at 11/33/147/300 teams +45/+27/+13/+9 → +14/+20/+30/+35. Powers 0.5–1.0 and reference sizes 30–80 all landed at 0.62; 0.75 is the smallest power where a bigger field is clearly worth more. A field-strength factor (§8.6 a) lowered hacker correlation and was dropped.
- 2026-10-20: Duos become crews: groups of two or more with at least 2 events together, a group dropped only when a bigger group has exactly the same events. The owner asked for groups, not just pairs; the same score formula keeps small samples shrunk, and the planted duo is still #1 in the simulation.
- 2026-10-20: Default prize tier 2 → 3, with new rules (beginner, fun awards, Hackathons UK, overall runner-ups, best overall variants, sponsor brackets / dashes / "by X", challenges, host and topic tracks). On the live data 1,039 of 3,314 prizes fell to the default, mostly sponsor and company prizes ("[SPONSOR] Figma", "Waymo") counted as track wins; 231 still do, now as sponsor prizes. Overall winners moved 74 → 127 tier-1 prizes.
- 2026-10-20: MLH matches whose name is the MLH name or contains it, with the deadline within a day and no other same-named candidate, are accepted automatically. /admin/mlh already pre-checked exactly these; 186 of the 189 waiting on the live data were right, and the auto tab still lets an admin reject one.
- 2026-10-20: Winning several prizes at one event counts for more (owner's call): extra placing prizes break ties within the best prize's tier and scale the team's μ gain by up to 2×, shrunk below 50 teams because sweeping prizes at an 11-team event is easy (one Victor Hacks team took Best Overall plus 3 MLH prizes). Simulation unchanged (0.622 / 0.837 / 0.882 / 0 / #1), since simulated teams win one prize each. On the live data the #1 becomes jerryhe365 (Best Overall at Knight Hacks VIII, 168 teams, and SwampHacks XI, 112). Also a "Core: Prize" rule (tier 2) for host tracks written like a sponsor prefix (CUhackit).
- 2026-10-20: **Known issue:** σ barely shrinks (p10/p50/p90 ≈ 8.334/8.336/8.338 on the live data, vs 8.333 for a new hacker), because Plackett-Luce's per-player variance update is tiny in big fields and τ adds some back. So μ − 3σ is effectively μ − 25 and "proven" isn't rewarded. Revisit after the backfill, with the simulation.
- 2026-10-21: Confirming a past MLH event in /admin/mlh starts the "Crawl events" workflow (`crawl-events.yml`, up to 100 slugs per batch) to crawl it and then rate and publish, so it appears without waiting for Monday's crawl. The web app can't crawl itself: an event takes 20–40 minutes at 1 request per 1.5s. In both crawl workflows the crawl step has its own timeout and doesn't fail the job, so with a backlog the run still rates what it loaded, and the next run carries on from the checkpoints.
- 2026-10-21: Profile customization for claimed owners (owner's request): an uploaded photo, a trophy cabinet they can arrange, up to 3 pinned projects, hidden projects (display only) and a list / cards / compact project layout. The layout is one validated jsonb column (`people.profile_layout`), not new tables: it's small, owned by one row, and only ever read with the profile. The server keeps only the owner's own trophy keys and project ids. Photos go through the server action with the owner's session, so storage RLS (folder = their person id) applies.
- 2026-10-21: The school picker searches ~10k universities from Hipo's university-domains-list (MIT, `pipeline/config/schools/`, `hl schools load`) by every word of the name; the `/hackers` filter lists only schools someone is in (`school_options()`). The table had 0 schools, so nobody could pick one. Owners still choose their school themselves (§16); unlisted schools still go to an admin.
- 2026-10-21: Rating math experiments, not adopted: letting σ shrink with experience (an explicit precision gain per event) froze ratings, since Plackett-Luce's μ step scales with σ² (simulation hacker correlation 0.62 → −0.04); scaling up non-placing losses ×2/×4/×8 gave 0.43/0.26/0.16 and let beginner jams into the event top 20. The live ladder's problems are coverage: 167 of 1,319 in-scope events had projects.
- 2026-10-15: The domain is www.hackladder.com (apex redirects to www). Hosting: Vercel for `apps/web` (root directory `apps/web`), Supabase for data and auth, GitHub Actions for the scheduled pipeline, and a laptop for the multi-day backfill. Production env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL=https://www.hackladder.com, GITHUB_DISPATCH_TOKEN, and optionally REVALIDATE_SECRET (also a GitHub Actions secret).
- 2026-10-14: The web app is a standalone pnpm project in `apps/web` (no root workspace yet). There's one JS package; add a workspace when a second one appears.

---

## 16. Open questions

- **School data:** does a public Devpost user page show school? **Answered 2026-10-14: no.** Public user pages have no school or education field (checked `aaravwattal`, `NilsIrl`, `dylanjpaulson`; the only "Education" on the page is an interest tag). Devpost may collect school privately for eligibility, but it isn't published. School sometimes appears in the free-text bio ("EE+CS @ Stanford"), which is also shown under the member's name on project pages. So school comes from claims, and school boards start sparse. **Decided:** school comes only from the owner after claiming (no bio parsing, no inference). School boards fill in as people claim.
- ~~**Analytics:**~~ Vercel Web Analytics (decided 2026-10-15; `<Analytics />` in the root layout). Page views are free; custom events (search, claim_started, ...) need a paid Vercel plan, so revisit when Phase 4 adds them.
- ~~**Mobile nav:**~~ the dock becomes a full-width bottom bar on mobile (§4.3, redesign 2026-10-16).
- ~~**Domain:**~~ **www.hackladder.com** (bought 2026-10-15). The apex hackladder.com redirects to www. Site URL, Supabase auth redirects and the Resend sending domain all use it.
- ~~**Devpost outreach:** before launch or after.~~ After launch (§9.7).
- ~~**Season definition:**~~ Aug–Jul academic year (decided 2026-10-14).

---

## 17. Glossary

- **Rating / score:** displayed number, `1000 + 40(μ − 3σ)`.
- **μ, σ:** OpenSkill skill estimate and its uncertainty.
- **Provisional:** fewer than 3 rated events; shown without a rank.
- **Rank tier:** the named band a rating falls in (Hello World … Legend, Hall of Fame for the top 100); admin-editable (§8.7).
- **Event tier:** an admin's S/A/B/C label on a hackathon; a badge and filter, never a rating multiplier.
- **Elite hacker:** global top 5% by conservative rating, with at least 3 events.
- **Win odds:** 1-in-N chance a 90th-percentile team wins a given event.
- **Series:** all editions of one recurring hackathon.
- **Account vs person:** a Devpost account vs a resolved human; one person can have several accounts.
- **Claim:** proving you own an account through a bio code.
- **Gold tables:** the published rating and analysis outputs the site reads.
