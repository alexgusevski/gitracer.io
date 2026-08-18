PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS race_view_buckets (
  slug TEXT NOT NULL,
  bucket_start TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (slug, bucket_start),
  FOREIGN KEY (slug) REFERENCES races(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_race_view_buckets_recent ON race_view_buckets(bucket_start DESC);
