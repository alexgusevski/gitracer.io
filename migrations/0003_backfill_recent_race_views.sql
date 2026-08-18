-- Transitional backfill: the original races table only retained cumulative views.
-- Treat totals for races seen in the last 24 hours as recent, minus views already
-- captured by the exact tracker. These rows expire from the rolling query naturally.
WITH tracked_views AS (
  SELECT slug, SUM(view_count) AS view_count
  FROM race_view_buckets
  GROUP BY slug
)
INSERT OR IGNORE INTO race_view_buckets (slug, bucket_start, view_count)
SELECT
  races.slug,
  strftime('%Y-%m-%dT%H:%M:%fZ', races.last_viewed_at, '+0.001 seconds'),
  races.view_count - COALESCE(tracked_views.view_count, 0)
FROM races
LEFT JOIN tracked_views ON tracked_views.slug = races.slug
WHERE races.last_viewed_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
  AND races.view_count > COALESCE(tracked_views.view_count, 0);
