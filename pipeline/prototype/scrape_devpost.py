"""
Devpost scraper for HackElo.

Pulls ended hackathons that have announced winners, then every submitted
project in each gallery, then each project's team members and prizes won.
Everything is cached to ./cache so re-runs are cheap and resumable.

Usage:
    python scrape_devpost.py --check https://treehacks-2024.devpost.com/   # sanity-check parsing on one event
    python scrape_devpost.py --pages 20                                     # crawl 20 pages of the hackathon list (~180 events)
    python scrape_devpost.py --pages 20 --min-registrations 200            # skip tiny events

Be polite: default delay is 1.5s between uncached requests.
"""
import argparse, hashlib, json, os, re, sqlite3, sys, time
from datetime import date, datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
CACHE = ROOT / "cache"
DB = ROOT / "hackelo.db"
API = "https://devpost.com/api/hackathons"
UA = "HackEloBot/0.1 (hackathon rankings research; contact via site)"
DELAY = 1.5

session = requests.Session()
session.headers["User-Agent"] = UA
_last = 0.0


def fetch(url, as_json=False):
    """GET with on-disk cache and rate limit."""
    global _last
    CACHE.mkdir(exist_ok=True)
    key = CACHE / (hashlib.sha1(url.encode()).hexdigest() + (".json" if as_json else ".html"))
    if key.exists():
        txt = key.read_text(encoding="utf-8")
    else:
        wait = DELAY - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        for attempt in range(4):
            r = session.get(url, timeout=30)
            _last = time.time()
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(10 * (attempt + 1))
                continue
            break
        if r.status_code == 404:
            return None
        r.raise_for_status()
        txt = r.text
        key.write_text(txt, encoding="utf-8")
    return json.loads(txt) if as_json else txt


# ---------- parsing helpers ----------

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_end_date(s):
    """'Aug 21 - Oct 02, 2026' | 'Feb 16 - 18, 2024' | 'Dec 28, 2025 - Jan 02, 2026' -> 'YYYY-MM-DD'."""
    if not s:
        return None
    end = s.split("-")[-1].strip()                       # 'Oct 02, 2026' or '18, 2024'
    m = re.match(r"(?:([A-Za-z]{3})\w*\s+)?(\d{1,2}),\s*(\d{4})", end)
    if not m:
        return None
    mon = m.group(1)
    if not mon:                                          # same-month range: take month from start
        mon = re.match(r"([A-Za-z]{3})", s.strip()).group(1)
    try:
        return date(int(m.group(3)), MONTHS[mon.lower()[:3]], int(m.group(2))).isoformat()
    except (KeyError, ValueError):
        return None


def parse_money(html_str):
    digits = re.sub(r"[^\d]", "", BeautifulSoup(html_str or "", "html.parser").get_text())
    return int(digits) if digits else 0


TIER_RULES = [
    (1, r"\b(grand|overall|1st|first)\b|best overall|winner$|^winner"),
    (2, r"\b(2nd|3rd|second|third|runner[- ]?up|finalist)\b"),
    (4, r"\b(best use of|sponsor|powered by|mlh|api|built with|using)\b"),
]


def prize_tier(name):
    """1 grand/1st, 2 runner-up, 3 track prize (default), 4 sponsor/tech prize."""
    n = name.lower().strip()
    for tier, pat in TIER_RULES:
        if re.search(pat, n):
            return tier
    return 3


def parse_gallery(html):
    """Return [(slug, title, tagline, is_winner)], next_page_exists."""
    soup = BeautifulSoup(html, "html.parser")
    out = []
    items = soup.select("div.gallery-item") or soup.select("a.link-to-software")
    for it in items:
        a = it if it.name == "a" else it.select_one("a[href*='/software/']")
        if not a:
            continue
        slug = a["href"].rstrip("/").split("/software/")[-1]
        title_el = it.select_one("h5") or it.select_one(".software-entry-name")
        tag_el = it.select_one("p.tagline") or it.select_one(".tagline")
        winner = bool(it.select_one("img.winner, .winner, aside.entry-badge"))
        out.append((slug,
                    title_el.get_text(strip=True) if title_el else slug,
                    tag_el.get_text(strip=True) if tag_el else None,
                    winner))
    has_next = bool(soup.select_one("a[rel='next'], li.next:not(.disabled) a"))
    return out, has_next


RESERVED = {"software", "hackathons", "settings", "users", "about", "help", "portfolio"}


def parse_project(html, hackathon_url):
    """Return members [(username, name)] and prizes won at THIS hackathon [name]."""
    soup = BeautifulSoup(html, "html.parser")
    members = []
    for li in soup.select("#app-team li.software-team-member, li.software-team-member"):
        a = li.select_one("a.user-profile-link") or li.select_one("a[href*='devpost.com/']")
        if not a:
            continue
        m = re.match(r"https?://devpost\.com/([A-Za-z0-9_\-]+)/?$", a.get("href", ""))
        if not m or m.group(1) in RESERVED:
            continue
        name = (a.get("title") or a.get_text(" ", strip=True) or m.group(1)).strip()
        if (m.group(1), name) not in members:
            members.append((m.group(1), name))

    prizes = []
    host = re.sub(r"^https?://", "", hackathon_url).split("/")[0]
    for sub in soup.select("#submissions li, .software-list-with-thumbnail li"):
        link = sub.select_one(f"a[href*='{host}']")
        if not link:
            continue                                     # a different hackathon this project was also submitted to
        for w in sub.select("span.winner"):
            label = w.parent.get_text(" ", strip=True)
            label = re.sub(r"^\s*winner\s*", "", label, flags=re.I).strip()
            if label and label not in prizes:
                prizes.append(label)
    return members, prizes


# ---------- crawl ----------

def db():
    con = sqlite3.connect(DB)
    con.executescript((ROOT / "schema.sql").read_text())
    return con


def save_hackathon(con, h):
    con.execute("""INSERT OR REPLACE INTO hackathons
        (id,title,url,organization,location,ends_on,registrations,prize_total_usd,themes,scraped_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (h["id"], h["title"], h["url"], h.get("organization_name"),
         (h.get("displayed_location") or {}).get("location"),
         parse_end_date(h.get("submission_period_dates")),
         h.get("registrations_count"), parse_money(h.get("prize_amount")),
         json.dumps([t["name"] for t in h.get("themes", [])]),
         datetime.utcnow().isoformat(timespec="seconds")))


def crawl_hackathon(con, h, verbose=False):
    base = h["url"].rstrip("/") + "/"
    page, n_proj = 1, 0
    while True:
        html = fetch(f"{base}project-gallery?page={page}")
        if not html:
            break
        entries, has_next = parse_gallery(html)
        if not entries:
            break
        for slug, title, tagline, winner in entries:
            phtml = fetch(f"https://devpost.com/software/{slug}")
            if not phtml:
                continue
            members, prizes = parse_project(phtml, base)
            con.execute("INSERT OR REPLACE INTO projects VALUES (?,?,?,?,?)",
                        (slug, h["id"], title, tagline, int(winner or bool(prizes))))
            for p in prizes:
                con.execute("INSERT OR REPLACE INTO prizes_won VALUES (?,?,?)", (slug, p, prize_tier(p)))
            for user, name in members:
                con.execute("INSERT OR IGNORE INTO hackers (username, display_name) VALUES (?,?)", (user, name))
                con.execute("INSERT OR IGNORE INTO project_members VALUES (?,?)", (slug, user))
            n_proj += 1
            if verbose:
                tag = f"  WON {prizes}" if prizes else ("  (winner badge)" if winner else "")
                print(f"  {slug}: {[u for u, _ in members]}{tag}")
        con.commit()
        if not has_next:
            break
        page += 1
    return n_proj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=5, help="pages of the hackathon list to crawl (9 per page)")
    ap.add_argument("--start-page", type=int, default=1)
    ap.add_argument("--min-registrations", type=int, default=50)
    ap.add_argument("--check", help="crawl a single hackathon URL verbosely to verify parsing")
    args = ap.parse_args()
    con = db()

    if args.check:
        sub = re.sub(r"^https?://", "", args.check).split(".")[0]
        meta = fetch(f"{API}?search={sub}&status[]=ended", as_json=True)
        h = next((x for x in meta["hackathons"] if x["url"].rstrip("/") == args.check.rstrip("/")), None)
        if not h:
            sys.exit(f"Couldn't find {args.check} via the Devpost API search.")
        save_hackathon(con, h)
        n = crawl_hackathon(con, h, verbose=True)
        print(f"\n{h['title']}: {n} projects parsed.")
        return

    for page in range(args.start_page, args.start_page + args.pages):
        data = fetch(f"{API}?status[]=ended&order_by=recently-added&page={page}", as_json=True)
        if not data or not data.get("hackathons"):
            break
        for h in data["hackathons"]:
            if h.get("invite_only") or not h.get("winners_announced"):
                continue
            if (h.get("registrations_count") or 0) < args.min_registrations:
                continue
            done = con.execute("SELECT 1 FROM projects WHERE hackathon_id=? LIMIT 1", (h["id"],)).fetchone()
            save_hackathon(con, h)
            if done:
                continue
            n = crawl_hackathon(con, h)
            print(f"[p{page}] {h['title']}: {n} projects")
        con.commit()


if __name__ == "__main__":
    main()
