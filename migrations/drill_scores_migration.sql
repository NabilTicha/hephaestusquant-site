-- Migration: add 80-in-8 drill scores table
-- Run this against your D1 database:
--   wrangler d1 execute <DB_NAME> --file=drill_scores_migration.sql

CREATE TABLE IF NOT EXISTS drill_scores (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  score       INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  wrong       INTEGER NOT NULL,
  skipped     INTEGER NOT NULL,
  duration_s  INTEGER NOT NULL,   -- seconds taken (max 480)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drill_scores_user   ON drill_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_drill_scores_score  ON drill_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_drill_scores_date   ON drill_scores(created_at);
