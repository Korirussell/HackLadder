-- HackElo database schema (SQLite; ports to Postgres with minor type changes)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hackathons (
    id                  INTEGER PRIMARY KEY,      -- Devpost hackathon id
    title               TEXT NOT NULL,
    url                 TEXT NOT NULL UNIQUE,     -- e.g. https://treehacks-2024.devpost.com/
    organization        TEXT,
    location            TEXT,
    ends_on             TEXT,                     -- ISO date, used to replay events in order
    registrations       INTEGER,
    prize_total_usd     INTEGER,
    themes              TEXT,                     -- JSON array of theme names
    is_mlh              INTEGER DEFAULT 0,
    scraped_at          TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    slug                TEXT PRIMARY KEY,         -- devpost.com/software/<slug>
    hackathon_id        INTEGER NOT NULL REFERENCES hackathons(id),
    title               TEXT,
    tagline             TEXT,
    is_winner           INTEGER DEFAULT 0
);

-- One row per prize a project won at its hackathon
CREATE TABLE IF NOT EXISTS prizes_won (
    project_slug        TEXT NOT NULL REFERENCES projects(slug),
    prize_name          TEXT NOT NULL,
    tier                INTEGER NOT NULL,         -- 1 grand/1st, 2 runner-up, 3 track, 4 sponsor
    PRIMARY KEY (project_slug, prize_name)
);

-- Auto-created, barebones profiles built only from public Devpost data
CREATE TABLE IF NOT EXISTS hackers (
    username            TEXT PRIMARY KEY,         -- devpost.com/<username>
    display_name        TEXT,
    -- claim-your-profile fields (empty until the person claims)
    claimed             INTEGER DEFAULT 0,
    claimed_at          TEXT,
    claim_email         TEXT,
    linkedin_url        TEXT,                     -- only ever set by the owner
    github_url          TEXT,
    open_to_recruiters  INTEGER DEFAULT 0,
    hidden              INTEGER DEFAULT 0         -- "remove me": excluded from all public pages
);

CREATE TABLE IF NOT EXISTS project_members (
    project_slug        TEXT NOT NULL REFERENCES projects(slug),
    username            TEXT NOT NULL REFERENCES hackers(username),
    PRIMARY KEY (project_slug, username)
);

-- Owner-submitted fixes ("that wasn't me", "merge my two accounts", "I placed 2nd")
CREATE TABLE IF NOT EXISTS corrections (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    username            TEXT NOT NULL REFERENCES hackers(username),
    kind                TEXT NOT NULL,            -- remove_project | add_project | merge_account | fix_placement
    payload             TEXT NOT NULL,            -- JSON
    status              TEXT DEFAULT 'pending',   -- pending | approved | rejected
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Output of rate.py (rebuilt from scratch on every run)
CREATE TABLE IF NOT EXISTS ratings (
    username            TEXT PRIMARY KEY REFERENCES hackers(username),
    mu                  REAL,
    sigma               REAL,
    score               REAL,                     -- display rating, conservative (mu - 3*sigma) scaled
    events              INTEGER,
    wins                INTEGER,
    top_wins            INTEGER,                  -- tier 1 prizes
    last_event          TEXT
);

CREATE TABLE IF NOT EXISTS hackathon_strength (
    hackathon_id        INTEGER PRIMARY KEY REFERENCES hackathons(id),
    field_size          INTEGER,                  -- teams that submitted
    field_mean          REAL,                     -- avg pre-event mu of all entrants
    top_field           REAL,                     -- avg pre-event mu of the 10 strongest entrants
    difficulty          REAL                      -- display score combining both
);

CREATE TABLE IF NOT EXISTS pair_synergy (
    user_a              TEXT,
    user_b              TEXT,
    events_together     INTEGER,
    wins_together       INTEGER,
    overperformance     REAL,                     -- avg (actual - expected) finish percentile
    PRIMARY KEY (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_projects_hack ON projects(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(username);
