# HackElo

Rankings for hackathon hackers, teams, and events, built from public Devpost results.

## Quick start

```bash
pip install openskill beautifulsoup4 requests
python simulate.py                                          # sanity test on fake data (no network)
python scrape_devpost.py --check https://treehacks-2024.devpost.com/   # verify parsing on one real event
python scrape_devpost.py --pages 20 --min-registrations 200            # crawl ~180 events
python rate.py --top 25                                     # rebuild ratings + print leaderboards
python analyze_events.py --top 25                           # rank events + series, write CSVs
```

Run `--check` first. The gallery and project-page CSS selectors were written
against Devpost's known markup but haven't been run against the live site yet.
If the team member lists or prize names come back empty, adjust `parse_gallery`
or `parse_project` in `scrape_devpost.py`. Everything else is selector-independent.

## Files

| File | What it does |
|---|---|
| `schema.sql` | SQLite schema: hackathons, projects, prizes, hackers, claims/corrections, computed ratings |
| `scrape_devpost.py` | Devpost list API → project gallery → project pages. Cached in `./cache`, rate-limited, resumable |
| `rate.py` | Replays events in date order through OpenSkill (Plackett-Luce). Writes `ratings`, `hackathon_strength`, `pair_synergy` |
| `analyze_events.py` | Ranks every event and recurring series. Writes `events_ranked.csv` and `series_ranked.csv` |
| `simulate.py` | Fake hackers with a known true skill, used to check that the ratings recover it |

## How ranking works

Each event becomes a ranked finish:

1. Grand prize / 1st overall
2. 2nd / 3rd / runner-up
3. Track winner
4. Sponsor / "best use of X"
5. Submitted, didn't place (all tied)

Beating a strong field moves your rating more, which gives the shared-difficulty effect.
The score shown is conservative: `1000 + 40·(μ − 3σ)`, so new hackers start at 1000
and a single lucky win can't top the board.

- **Hackathon difficulty** is the pre-event average skill of the whole field, blended with the average of its 10 strongest entrants.
- **Duo rankings** combine placement rate together (shrunk toward average for small samples) with how far the pair beat the finish their ratings predicted.

## Which events are truly the top

`analyze_events.py` asks one question per event: what are the odds a strong team wins it?
A strong team here means hackers at the global 90th percentile.

- The odds are computed against that event's actual field, using everyone's final (hindsight) ratings. A first edition doesn't look weak just because nobody had a rating yet.
- Size and strength are both handled, because more strong teams means longer odds.
- First-timers count as unproven, not as wildcards. Without this, giant online beginner jams rank as the hardest events.
- The noise in "who wins on the day" is fitted to the data.
- Editions are grouped into series (`treehacks-2024` and `treehacks-2025` → `treehacks`). The series rating is averaged across editions and shrunk when there are only a few.

The headline event rating is 70% `elite` and 30% win odds. In the simulation, win odds alone
over-rated big online jams whose regulars mostly compete against each other: nobody strong ever
beats them, so their ratings stay inflated. Counting proven elite hackers isn't fooled by that.
On simulated data, this blend matched the true event difficulty with a rank correlation of 0.84
(team count alone: 0.28) and put no beginner jams in the top 20.

Extra columns:

- `elite`: how many entrants end up in the global top 5%. This is part of the headline rating.
- `win_odds`: the 1-in-N odds that a strong team wins this event. Read it with the elite count beside it.
- `judging`: whether the stronger teams actually placed. Low or negative values can flag noisy judging.

## Profiles and claims

Profiles are auto-created from public Devpost data only: username, display name, and projects.
LinkedIn, GitHub, and "open to recruiters" fields are filled in only by the owner after they claim.

- `hidden = 1` takes someone off every public page. Their results still count toward other people's ratings.
- The `corrections` table queues owner fixes: removing a project, merging accounts, or fixing a placement.
