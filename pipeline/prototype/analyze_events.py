"""
Which hackathons are truly the top events?

Ranks every event and every recurring series (all editions of e.g. TreeHacks)
on who actually showed up and who won, judged with hindsight: each entrant is
scored by their FINAL rating, not the rating they had walking in. That fixes
the cold-start problem where early events look weak only because nobody had
a rating yet.

Headline signal:
    win_odds    1-in-N chance that a strong reference team (hackers at the global
                90th percentile) would take 1st against this exact field. Accounts for
                both how strong the room is AND how many teams are in it. Every hacker is
                judged by a conservative estimate (mu - sigma), so a room full of
                first-timers counts as unproven rather than as dangerous.

Supporting signals:
    top10       avg final skill of the 10 strongest entrants      (how stacked the top is)
    field       avg final skill of all entrants                   (how deep the room is)
    elite       # entrants who end up in the global top 5%        (star power)
    winners     avg final skill of 1st/2nd/3rd place members      (quality of who won)
    judging     rank corr between pre-event team skill and finish (did stronger teams place? context only)

Event rating = 1000 + 100 * weighted z-score: 70% elite count, 30% log(win_odds).
The noise in "who wins on the day" is calibrated from the data: it's set to the value
that best predicts which team actually took 1st across all events.
Series rating = average over editions, shrunk toward average when there are few editions.

Usage:  python analyze_events.py --top 25         # prints boards, writes events_ranked.csv, series_ranked.csv
"""
import argparse, csv, math, os, random, re, sqlite3, statistics as st
from collections import defaultdict
from pathlib import Path

import numpy as np
from openskill.models import PlackettLuce
from scipy.stats import norm

import rate

ROOT = Path(__file__).parent
WEIGHTS = {"win_odds": 0.30, "elite": 0.70}   # elite-heavy: resists isolated pools (see README)
REF_PCTL = 0.90
UNPROVEN_K = 1.0
MIN_TEAMS = 8


def series_key(url, title):
    sub = re.sub(r"^https?://", "", url).split(".")[0].lower()
    if sub in ("devpost", "www", ""):
        sub = title.lower()
    sub = re.sub(r"[-_ ]?(19|20)\d{2}.*$", "", sub)                  # treehacks-2024 -> treehacks
    sub = re.sub(r"[-_ ]?(fall|spring|winter|summer|s\d\d|f\d\d)$", "", sub)
    sub = re.sub(r"[-_ ]?v?\d+(\.\d+)?$", "", sub)                   # hackx-3 / hackx-2.0 -> hackx
    return sub.replace("_", "-").strip("- ") or sub


def spearman(x, y):
    if len(x) < 3:
        return None
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    a, b = rk(x), rk(y)
    ma, mb = st.mean(a), st.mean(b)
    num = sum((p - ma) * (q - mb) for p, q in zip(a, b))
    den = math.sqrt(sum((p - ma) ** 2 for p in a) * sum((q - mb) ** 2 for q in b))
    return num / den if den else None


def replay(con):
    """Same replay as rate.py, but keep each event's entrants and pre-event ratings."""
    model = PlackettLuce()
    R, snapshots = {}, []
    events, teams_by_event = rate.load(con)
    for hid, title, ends_on in events:
        teams = rate.dedupe_people(teams_by_event.get(hid, []))
        if len(teams) < 2:
            continue
        for _, _, users in teams:
            for u in users:
                R.setdefault(u, model.rating(name=u))
        pre = [sum(R[u].mu for u in us) / len(us) for _, _, us in teams]
        snapshots.append((hid, teams, pre))
        new = model.rate([[R[u] for u in us] for _, _, us in teams], ranks=[r for _, r, _ in teams])
        for (_, _, us), tn in zip(teams, new):
            for u, r in zip(us, tn):
                R[u] = r
    return R, snapshots


def p_ref_wins(ref_strength, ref_sd, strengths, sds):
    """Exact P(reference team's performance beats every other team), each team ~ Normal.
    Integrates over the reference team's performance on a fine grid."""
    x = np.linspace(ref_strength - 6 * ref_sd, ref_strength + 6 * ref_sd, 2001)
    dens = norm.pdf(x, ref_strength, ref_sd)
    log_beat_all = np.zeros_like(x)
    for m, sd in zip(strengths, sds):
        log_beat_all += norm.logcdf((x - m) / sd)
    return float(np.trapezoid(dens * np.exp(log_beat_all), x))


def p_team_first(j, strengths, sd, grid=801):
    """P(team j finishes 1st) with every team's performance ~ Normal(strength, sd)."""
    m = strengths[j]
    x = np.linspace(m - 6 * sd, m + 6 * sd, grid)
    others = np.delete(np.asarray(strengths), j)
    logc = norm.logcdf((x[:, None] - others[None, :]) / sd).sum(axis=1)
    return float(np.trapezoid(norm.pdf(x, m, sd) * np.exp(logc), x))


def calibrate_noise(fields):
    """Pick the per-event performance noise that best predicts who actually took 1st.
    fields: [(strengths, index_of_first_place_team)]"""
    best = None
    for sd in np.geomspace(1, 40, 25):
        ll = sum(math.log(max(p_team_first(j, f, sd), 1e-12)) for f, j in fields)
        if best is None or ll > best[1]:
            best = (sd, ll)
    return best[0]


def zscores(vals):
    m, s = st.mean(vals), st.pstdev(vals) or 1
    return [(v - m) / s for v in vals]


def analyze(con):
    R, snapshots = replay(con)
    final = {u: r.mu for u, r in R.items()}
    events_of = defaultdict(int)
    for _, teams, _ in snapshots:
        for _, _, us in teams:
            for u in us:
                events_of[u] += 1
    seasoned = sorted((r.mu - 3 * r.sigma for u, r in R.items() if events_of[u] >= 3), reverse=True)
    elite_cut = seasoned[max(0, len(seasoned) // 20 - 1)] if seasoned else float("inf")
    model = PlackettLuce()
    effs = sorted(r.mu - UNPROVEN_K * r.sigma for u, r in R.items() if events_of[u] >= 3) or [25.0]
    ref_mu = effs[int(REF_PCTL * (len(effs) - 1))]
    meta = {h: (t, u, d, reg, prize) for h, t, u, d, reg, prize in con.execute(
        "SELECT id, title, url, ends_on, registrations, prize_total_usd FROM hackathons")}

    eff = {u: r.mu - UNPROVEN_K * r.sigma for u, r in R.items()}
    fields = []
    for hid, teams, pre in snapshots:
        if len(teams) < MIN_TEAMS:
            continue
        strengths = [st.mean(eff[u] for u in us) for _, _, us in teams]
        firsts = [i for i, (_, r, _) in enumerate(teams) if r == 1]
        if len(firsts) == 1:
            fields.append((strengths, firsts[0]))
    if len(fields) > 400:                                         # plenty to fit one number; keeps runtime short
        fields = random.Random(0).sample(fields, 400)
    noise = calibrate_noise(fields) if fields else model.beta
    print(f"Calibrated per-event performance noise: {noise:.2f} skill points "
          f"(fit on {len(fields)} events with a single 1st place)")

    rows = []
    for hid, teams, pre in snapshots:
        if len(teams) < MIN_TEAMS:
            continue
        people = [u for _, _, us in teams for u in us]
        skills = sorted((final[u] for u in people), reverse=True)
        winners = [final[u] for _, r, us in teams if r <= 2 for u in us]
        title, url, ends_on, reg, prize = meta[hid]
        # point estimates only: an unknown hacker is "unproven", not "could be anyone".
        # team strength = average member skill; per-event noise is calibrated on real 1st places
        strengths = [st.mean(eff[u] for u in us) for _, _, us in teams]
        p_win = p_ref_wins(ref_mu, noise, strengths, [noise] * len(strengths))
        rows.append({
            "id": hid, "title": title, "url": url, "date": ends_on,
            "series": series_key(url, title), "teams": len(teams), "hackers": len(people),
            "registrations": reg, "prize_usd": prize,
            "win_odds": 1 / p_win,
            "top10": st.mean(skills[:10]), "field": st.mean(skills),
            "elite": sum(R[u].mu - 3 * R[u].sigma >= elite_cut and events_of[u] >= 3 for u in people),
            "winners": st.mean(winners) if winners else st.mean(skills),
            "judging": spearman([-p for p in pre], [r for _, r, _ in teams]),
        })
    if not rows:
        return [], []

    z = {k: zscores([math.log(r[k]) if k == "win_odds" else math.log1p(r[k]) for r in rows]) for k in WEIGHTS}
    for i, r in enumerate(rows):
        r["z"] = sum(WEIGHTS[k] * z[k][i] for k in WEIGHTS)
        r["rating"] = round(1000 + 100 * r["z"])
    rows.sort(key=lambda r: -r["rating"])

    by_series = defaultdict(list)
    for r in rows:
        by_series[r["series"]].append(r)
    series = []
    for key, eds in by_series.items():
        n = len(eds)
        shrunk = st.mean(e["z"] for e in eds) * n / (n + 1)      # one strong edition isn't a dynasty
        best = max(eds, key=lambda e: e["rating"])
        series.append({"series": key, "name": re.sub(r"\s*(19|20)\d{2}.*$", "", best["title"]),
                       "editions": n, "rating": round(1000 + 100 * shrunk),
                       "best_edition": best["title"], "best_rating": best["rating"],
                       "avg_teams": round(st.mean(e["teams"] for e in eds)),
                       "avg_elite": round(st.mean(e["elite"] for e in eds), 1)})
    series.sort(key=lambda s: -s["rating"])
    return rows, series


def write_csv(path, rows, cols):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--out", default=str(ROOT))
    args = ap.parse_args()
    con = sqlite3.connect(rate.DB)
    rows, series = analyze(con)
    if not rows:
        print("No events with enough teams yet. Run the scraper first.")
        return
    write_csv(Path(args.out) / "events_ranked.csv", rows,
              ["rating", "title", "date", "series", "win_odds", "teams", "hackers", "elite", "top10", "field",
               "winners", "judging", "registrations", "prize_usd", "url"])
    write_csv(Path(args.out) / "series_ranked.csv", series,
              ["rating", "name", "series", "editions", "avg_teams", "avg_elite", "best_edition", "best_rating"])

    print(f"=== Top {args.top} hackathon events (of {len(rows)}) ===")
    print(f"{'':>4} {'rating':>6}  {'event':<28} {'win odds':>9} {'teams':>5} {'elite':>5} {'judging':>7}")
    for i, r in enumerate(rows[:args.top], 1):
        j = f"{r['judging']:.2f}" if r["judging"] is not None else "-"
        print(f"{i:>3}. {r['rating']:>6}  {r['title'][:28]:<28} {'1 in ' + str(round(r['win_odds'])):>9} {r['teams']:>5} {r['elite']:>5} {j:>7}")
    print(f"\n=== Top {args.top} hackathon series (2+ editions) ===")
    multi = [s for s in series if s["editions"] >= 2]
    for i, s in enumerate(multi[:args.top], 1):
        print(f"{i:>3}. {s['rating']:>6}  {s['name'][:24]:<24} {s['editions']} editions, "
              f"~{s['avg_teams']} teams, ~{s['avg_elite']} elite hackers/edition")
    print("\nWrote events_ranked.csv and series_ranked.csv")


if __name__ == "__main__":
    main()
