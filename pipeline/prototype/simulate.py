"""
Synthetic test: invent hackers with a hidden true skill, run fake hackathons,
then check that rate.py recovers the true ordering. Also plants one "magic duo"
that performs better together than apart, to check the synergy board finds them.

    python simulate.py          # writes sim.db, rates it, prints accuracy
"""
import os, random, sqlite3, subprocess, sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent
SIM = ROOT / "sim.db"
random.seed(7)

N_HACKERS, N_EVENTS = 2500, 220
skill = {f"h{i}": random.gauss(0, 1) for i in range(N_HACKERS)}
activity = {u: random.random() ** 2 for u in skill}            # some people hack a lot, most rarely
DUO = ("h11", "h12")
skill[DUO[0]] = skill[DUO[1]] = 0.3                             # ordinary on paper...
SYNERGY = 1.2                                                   # ...strong together

if SIM.exists():
    SIM.unlink()
con = sqlite3.connect(SIM)
con.executescript((ROOT / "schema.sql").read_text())
con.executemany("INSERT INTO hackers (username, display_name) VALUES (?,?)",
                [(u, f"Hacker {u[1:]}") for u in skill])

# 45 recurring series (like TreeHacks, HackMIT) with a stable hidden prestige
SYL = ["tree", "byte", "cal", "pen", "hack", "mit", "quack", "storm", "bit", "uni", "nova", "red", "blue", "code"]
SERIES = []
while len(SERIES) < 45:
    n = random.choice(SYL) + random.choice(SYL) + random.choice(["hacks", "hacks", "athon", "_hack"])
    if n not in [x for x, _ in SERIES]:
        SERIES.append((n, random.random()))
TRUE_PRESTIGE = {}
TRUE_ODDS = {}
REF_SKILL = sorted(skill.values())[int(0.9 * N_HACKERS)]

d = date(2023, 1, 1)
for e in range(N_EVENTS):
    d += timedelta(days=random.randint(2, 6))
    series, base = random.choice(SERIES)
    prestige = min(1, max(0, base + random.gauss(0, 0.08)))     # big-name events attract stronger hackers
    TRUE_PRESTIGE[e] = prestige
    beginner = random.random() < 0.2                            # big online beginner-friendly events
    if beginner:
        series, prestige = "online_beginner_jam", 0.0
        size = random.randint(250, 450)
        pool = sorted(skill, key=lambda u: -(activity[u] * random.random()
                                             - 0.8 * (skill[u] > 0.5) * random.random()))[:size]
    else:
        size = int(40 + 400 * prestige * random.random())
        pool = sorted(skill, key=lambda u: -(activity[u] * random.random()
                                             + 0.6 * prestige * (skill[u] > 1) * random.random()))[:size]
    TRUE_PRESTIGE[e] = prestige
    random.shuffle(pool)
    if e % 3 == 0 and DUO[0] not in pool:
        pool[:2] = list(DUO)
    teams, i = [], 0
    while i < len(pool):
        k = random.choice([1, 2, 3, 3, 4, 4])
        t = pool[i:i + k]
        if DUO[0] in t and DUO[1] not in t:
            t = [u for u in t if u != DUO[0]]                   # keep duo intact
        if DUO[1] in t and DUO[0] not in t:
            t = [u for u in t if u != DUO[1]]
        i += k
        if t:
            teams.append(t)
    if DUO[0] in pool and not any(DUO[0] in t for t in teams):
        teams.append(list(DUO))

    def perf(t):
        p = sum(skill[u] for u in t) / len(t) + 0.15 * len(t) + random.gauss(0, 0.7)
        return p + (SYNERGY if DUO[0] in t and DUO[1] in t else 0)

    base_perf = [sum(skill[u] for u in t) / len(t) + 0.15 * len(t)
                 + (SYNERGY if DUO[0] in t and DUO[1] in t else 0) for t in teams]
    ref = REF_SKILL + 0.15 * 3
    wins = sum(ref + random.gauss(0, 0.7) > max(b + random.gauss(0, 0.7) for b in base_perf) for _ in range(400))
    TRUE_ODDS[e] = 400 / max(wins, 0.5)
    teams.sort(key=perf, reverse=True)
    con.execute("INSERT INTO hackathons (id,title,url,ends_on,registrations,themes) VALUES (?,?,?,?,?,?)",
                (e, f"{series.title()} {d.year}", f"https://{series.replace('_', '-')}-{d.year}-{e}.devpost.com/",
                 d.isoformat(), size, f'{{"sim_prestige": {prestige:.3f}, "true_odds": {TRUE_ODDS[e]:.1f}, "beginner": {int(beginner)}}}'))
    tiers = [1, 2, 2, 3, 3, 3, 3, 4, 4, 4]
    names = {1: "Grand Prize", 2: "2nd Place", 3: "Best Healthcare Hack", 4: "Best Use of SomeAPI"}
    for rank, t in enumerate(teams):
        slug = f"p{e}-{rank}"
        con.execute("INSERT INTO projects VALUES (?,?,?,?,?)", (slug, e, slug, None, int(rank < len(tiers))))
        if rank < len(tiers):
            con.execute("INSERT INTO prizes_won VALUES (?,?,?)", (slug, f"{names[tiers[rank]]} #{rank}", tiers[rank]))
        con.executemany("INSERT INTO project_members VALUES (?,?)", [(slug, u) for u in t])
con.commit()
con.close()

env = dict(os.environ, HACKELO_DB=str(SIM))
subprocess.run([sys.executable, str(ROOT / "rate.py"), "--top", "10"], env=env, check=True)

# ---- accuracy check ----
con = sqlite3.connect(SIM)
rows = con.execute("SELECT username, score, events FROM ratings WHERE events >= 3").fetchall()


def spearman(xs, ys):
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i]); r = [0] * len(v)
        for p, i in enumerate(o): r[i] = p
        return r
    a, b = rk(xs), rk(ys); n = len(a)
    return 1 - 6 * sum((x - y) ** 2 for x, y in zip(a, b)) / (n * (n * n - 1))


rho = spearman([skill[u] for u, _, _ in rows], [s for _, s, _ in rows])
top50 = [u for u, _, _ in sorted(rows, key=lambda r: -r[1])[:50]]
truly_top = {u for u, _, _ in sorted(rows, key=lambda r: -skill[r[0]])[:100]}
print(f"\nAccuracy on {len(rows)} hackers with 3+ events:")
print(f"  rank correlation with true skill: {rho:.2f}")
print(f"  of our top 50, {sum(u in truly_top for u in top50)} are in the true top 100")
duo = con.execute("SELECT * FROM pair_synergy WHERE user_a=? AND user_b=?", DUO).fetchone()
SCORE = "(wins_together + 1.0)/(events_together + 4) + 0.5*overperformance*events_together/(events_together + 3)"
rank = con.execute(f"""SELECT COUNT(*) FROM pair_synergy WHERE events_together >= 3 AND {SCORE} >
                      (SELECT {SCORE} FROM pair_synergy WHERE user_a=? AND user_b=?)""", DUO).fetchone()[0] + 1
print(f"  planted duo {DUO}: {duo[3]}/{duo[2]} placed, ranked #{rank} of "
      f"{con.execute('SELECT COUNT(*) FROM pair_synergy WHERE events_together >= 3').fetchone()[0]} duos")
wr = con.execute("SELECT username, wins*1.0/events FROM ratings WHERE events >= 3").fetchall()
print(f"  baseline (plain win rate) rank correlation: {spearman([skill[u] for u,_ in wr], [w for _,w in wr]):.2f}")

# ---- event ranking check ----
import json
os.environ["HACKELO_DB"] = str(SIM)
import importlib, rate, analyze_events
importlib.reload(rate); importlib.reload(analyze_events)
rows, series = analyze_events.analyze(sqlite3.connect(SIM))
truth = {h: json.loads(t)["sim_prestige"] for h, t in con.execute("SELECT id, themes FROM hackathons")}
tp = [truth[r["id"]] for r in rows]
tw = [TRUE_ODDS[r["id"]] for r in rows]
print(f"\nEvent ranking on {len(rows)} events, rank correlation with TRUE odds a strong team wins:")
print(f"  HackElo event rating:            {analyze_events.spearman(tw, [r['rating'] for r in rows]):.2f}")
ours = sorted(r["win_odds"] for r in rows); true_sorted = sorted(tw)
print(f"  median odds, ours vs true: 1 in {ours[len(ours)//2]:.0f} vs 1 in {true_sorted[len(tw)//2]:.0f};"
      f" hardest event: 1 in {ours[-1]:.0f} vs 1 in {true_sorted[-1]:.0f}")
print(f"  HackElo win odds alone:          {analyze_events.spearman(tw, [r['win_odds'] for r in rows]):.2f}")
print(f"  size (teams) only:               {analyze_events.spearman(tw, [r['teams'] for r in rows]):.2f}")
pre = dict(con.execute("SELECT hackathon_id, difficulty FROM hackathon_strength"))
print(f"  pre-event field strength only:   {analyze_events.spearman(tw, [pre[r['id']] for r in rows]):.2f}")
print(f"\nSame ranking vs hidden series prestige:")
print(f"  HackElo event rating:            {analyze_events.spearman(tp, [r['rating'] for r in rows]):.2f}")
print(f"  size (teams) only:               {analyze_events.spearman(tp, [r['teams'] for r in rows]):.2f}")
true_series = {}
for r in rows:
    true_series.setdefault(r["series"], []).append(truth[r["id"]])
multi = [s for s in series if s["editions"] >= 2]
print(f"  series rating vs true prestige ({len(multi)} series): "
      f"{analyze_events.spearman([sum(true_series[s['series']])/len(true_series[s['series']]) for s in multi], [s['rating'] for s in multi]):.2f}")
