"""
HackElo rating engine.

Replays every hackathon in date order through OpenSkill (Plackett-Luce), a
multiplayer, team-aware cousin of Elo/TrueSkill. Each hacker has a skill
estimate (mu) and an uncertainty (sigma). The public score is conservative
(mu - 3*sigma) so one lucky win doesn't outrank a long track record.

How an event becomes a ranking:
    rank 1  grand prize / 1st overall
    rank 2  2nd, 3rd, runner-up, finalist
    rank 3  track / category winner (and winner badge with no prize name)
    rank 4  sponsor or "best use of X" prize
    rank 5  submitted, didn't place (all tied)
Beating a strong field moves you more than beating a weak one; that falls out
of the model automatically, which is what gives us "shared difficulty".

Usage:  python rate.py            # rebuilds ratings, hackathon_strength, pair_synergy
        python rate.py --top 25   # also prints leaderboards
"""
import argparse, itertools, sqlite3
from collections import defaultdict
from pathlib import Path

from openskill.models import PlackettLuce

import os
DB = Path(os.environ.get("HACKELO_DB", Path(__file__).parent / "hackelo.db"))
NON_PLACING = 5
MIN_EVENTS_FOR_BOARD = 2
TOP_FIELD_N = 10


def display(mu, sigma):
    """Map conservative skill onto a familiar Elo-ish scale (new hacker = 1000)."""
    return round(1000 + 40 * (mu - 3 * sigma))


def load(con):
    events = con.execute("""SELECT id, title, ends_on FROM hackathons
                            WHERE ends_on IS NOT NULL ORDER BY ends_on, id""").fetchall()
    teams_by_event = defaultdict(list)                  # hack_id -> [(slug, rank, [users])]
    rows = con.execute("""
        SELECT p.hackathon_id, p.slug, p.is_winner, MIN(w.tier), GROUP_CONCAT(DISTINCT m.username)
        FROM projects p
        JOIN project_members m ON m.project_slug = p.slug
        LEFT JOIN prizes_won w ON w.project_slug = p.slug
        GROUP BY p.slug""").fetchall()
    for hid, slug, is_winner, best_tier, users in rows:
        if best_tier is not None:
            rank = best_tier
        elif is_winner:
            rank = 3
        else:
            rank = NON_PLACING
        teams_by_event[hid].append((slug, rank, users.split(",")))
    return events, teams_by_event


def dedupe_people(teams):
    """A person on two projects at one event keeps only their best-placed one."""
    seen, out = set(), []
    for slug, rank, users in sorted(teams, key=lambda t: t[1]):
        keep = [u for u in users if u not in seen]
        seen.update(keep)
        if keep:
            out.append((slug, rank, keep))
    return out


def percentiles(ranks):
    """Finish percentile in [0,1] (1 = best), ties share their average position."""
    n = len(ranks)
    if n < 2:
        return [0.5] * n
    order = sorted(range(n), key=lambda i: ranks[i])
    pos = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and ranks[order[j + 1]] == ranks[order[i]]:
            j += 1
        avg = (i + j) / 2
        for k in range(i, j + 1):
            pos[order[k]] = avg
        i = j + 1
    return [1 - p / (n - 1) for p in pos]


def run(con):
    model = PlackettLuce()
    R = {}                                              # username -> rating
    stats = defaultdict(lambda: {"events": 0, "wins": 0, "top": 0, "last": None})
    strength = []
    pair = defaultdict(lambda: [0, 0, 0.0])             # (a,b) -> [events, wins, overperf sum]

    events, teams_by_event = load(con)
    for hid, title, ends_on in events:
        teams = dedupe_people(teams_by_event.get(hid, []))
        if len(teams) < 2:
            continue
        for _, _, users in teams:
            for u in users:
                if u not in R:
                    R[u] = model.rating(name=u)

        # field strength measured BEFORE this event updates anyone
        team_mus = [sum(R[u].mu for u in users) / len(users) for _, _, users in teams]
        everyone = sorted((R[u].mu for _, _, us in teams for u in us), reverse=True)
        field_mean = sum(everyone) / len(everyone)
        top_field = sum(everyone[:TOP_FIELD_N]) / min(TOP_FIELD_N, len(everyone))
        strength.append((hid, len(teams), field_mean, top_field,
                         round(1000 + 40 * (0.5 * field_mean + 0.5 * top_field - 25))))

        # expected vs actual finish for synergy
        ranks = [r for _, r, _ in teams]
        actual = percentiles(ranks)
        expected = percentiles([-m for m in team_mus])

        new = model.rate([[R[u] for u in users] for _, _, users in teams], ranks=ranks)
        for (slug, rank, users), team_new, a, e in zip(teams, new, actual, expected):
            for u, r in zip(users, team_new):
                R[u] = r
                s = stats[u]
                s["events"] += 1
                s["last"] = ends_on
                if rank < NON_PLACING:
                    s["wins"] += 1
                if rank == 1:
                    s["top"] += 1
            for a_u, b_u in itertools.combinations(sorted(users), 2):
                p = pair[(a_u, b_u)]
                p[0] += 1
                p[1] += rank < NON_PLACING
                p[2] += a - e

    con.execute("DELETE FROM ratings")
    con.executemany("INSERT INTO ratings VALUES (?,?,?,?,?,?,?,?)",
                    [(u, r.mu, r.sigma, display(r.mu, r.sigma), stats[u]["events"],
                      stats[u]["wins"], stats[u]["top"], stats[u]["last"]) for u, r in R.items()])
    con.execute("DELETE FROM hackathon_strength")
    con.executemany("INSERT INTO hackathon_strength VALUES (?,?,?,?,?)", strength)
    con.execute("DELETE FROM pair_synergy")
    con.executemany("INSERT INTO pair_synergy VALUES (?,?,?,?,?)",
                    [(a, b, n, w, s / n) for (a, b), (n, w, s) in pair.items() if n >= 2])
    con.commit()
    return len(R), len(strength)


def boards(con, top):
    print(f"\n=== Top {top} hackers (min {MIN_EVENTS_FOR_BOARD} events) ===")
    for i, row in enumerate(con.execute("""
            SELECT COALESCE(h.display_name, r.username), r.score, r.events, r.wins, r.top_wins
            FROM ratings r JOIN hackers h USING(username)
            WHERE r.events >= ? AND h.hidden = 0 ORDER BY r.score DESC LIMIT ?""",
            (MIN_EVENTS_FOR_BOARD, top)), 1):
        print(f"{i:>3}. {row[0]:<24} {int(row[1]):>5}   {row[2]} events, {row[3]} placed, {row[4]} grand")

    print(f"\n=== Toughest hackathons ===")
    for i, row in enumerate(con.execute("""
            SELECT h.title, s.difficulty, s.field_size FROM hackathon_strength s
            JOIN hackathons h ON h.id = s.hackathon_id ORDER BY s.difficulty DESC LIMIT ?""", (top,)), 1):
        print(f"{i:>3}. {row[0]:<36} {int(row[1]):>5}   {row[2]} teams")

    print(f"\n=== Best duos (3+ events together) ===")
    for i, row in enumerate(con.execute("""
            SELECT ha.display_name, hb.display_name, p.events_together, p.wins_together, p.overperformance
            FROM pair_synergy p
            JOIN hackers ha ON ha.username = p.user_a JOIN hackers hb ON hb.username = p.user_b
            WHERE ha.hidden = 0 AND hb.hidden = 0 AND p.events_together >= 3
            ORDER BY (p.wins_together + 1.0) / (p.events_together + 4)
                     + 0.5 * p.overperformance * p.events_together / (p.events_together + 3) DESC LIMIT ?""",
            (min(top, 10),)), 1):
        print(f"{i:>3}. {row[0]} + {row[1]:<20} {row[3]}/{row[2]} placed, beat expectations by {row[4]:+.0%}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=0)
    args = ap.parse_args()
    con = sqlite3.connect(DB)
    con.executescript((Path(__file__).parent / "schema.sql").read_text())
    n_h, n_e = run(con)
    print(f"Rated {n_h} hackers across {n_e} hackathons.")
    if args.top:
        boards(con, args.top)
