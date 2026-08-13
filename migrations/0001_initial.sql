PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  github_id TEXT PRIMARY KEY,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  avatar_url TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  contribution_years_json TEXT NOT NULL DEFAULT '[]',
  profile_fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profiles_login ON profiles(login COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS profile_years (
  github_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  days_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (github_id, year),
  FOREIGN KEY (github_id) REFERENCES profiles(github_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS races (
  slug TEXT PRIMARY KEY,
  handles_json TEXT NOT NULL,
  first_viewed_at TEXT NOT NULL,
  last_viewed_at TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_races_last_viewed ON races(last_viewed_at DESC);

CREATE TABLE IF NOT EXISTS invalid_profiles (
  login TEXT PRIMARY KEY COLLATE NOCASE,
  reason TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invalid_profiles_expiry ON invalid_profiles(expires_at);

CREATE TABLE IF NOT EXISTS refresh_locks (
  cache_key TEXT PRIMARY KEY,
  lock_until TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (key_hash, bucket)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits(expires_at);
