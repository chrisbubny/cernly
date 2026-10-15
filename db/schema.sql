-- Cernly database schema

CREATE TABLE IF NOT EXISTS reports (
  id           SERIAL PRIMARY KEY,
  url          TEXT NOT NULL,
  scores       JSONB,
  issues       JSONB,
  ai_summary   TEXT,
  lh_data      JSONB,
  seo_data     JSONB,
  ssl_data     JSONB,
  a11y_data    JSONB,
  paid         BOOLEAN NOT NULL DEFAULT false,
  user_id      TEXT,              -- Clerk user ID (null for anonymous)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ         -- NULL = never expires for paid, 7 days for free
);

CREATE INDEX idx_reports_user    ON reports(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_reports_created ON reports(created_at);

-- Clean up old unpaid anonymous reports after 7 days
-- Run: DELETE FROM reports WHERE paid = false AND user_id IS NULL AND created_at < NOW() - INTERVAL '7 days';

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   SERIAL PRIMARY KEY,
  user_id              TEXT NOT NULL,
  stripe_customer_id   TEXT,
  stripe_sub_id        TEXT UNIQUE,
  status               TEXT NOT NULL DEFAULT 'active', -- active | cancelled | past_due
  plan                 TEXT NOT NULL DEFAULT 'pro',
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subs_user   ON subscriptions(user_id);
CREATE INDEX idx_subs_stripe ON subscriptions(stripe_sub_id) WHERE stripe_sub_id IS NOT NULL;
