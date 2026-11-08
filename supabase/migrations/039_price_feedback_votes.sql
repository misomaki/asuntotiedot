-- ============================================================
-- Migration 039: Price feedback votes ingestion table
--
-- Captures user votes (accurate / too_low / too_high) on building price
-- estimates from the BuildingPanel feedback widget. Source data:
-- PostHog `price_feedback` events, exported as CSV and imported via
-- scripts/data-import/12-import-posthog-votes.ts.
--
-- Used as a recalibration signal for the S-curve correction in
-- compute_building_price() / computePriceRangeCorrection().
-- ============================================================

CREATE TABLE IF NOT EXISTS price_feedback_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- PostHog event UUID — used as idempotency key during CSV re-imports
  posthog_event_id TEXT UNIQUE NOT NULL,
  building_id UUID,
  area_code TEXT,
  address TEXT,
  estimated_price NUMERIC,
  rating TEXT NOT NULL CHECK (rating IN ('accurate', 'too_low', 'too_high')),
  comment TEXT,
  distinct_id TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_feedback_votes_building ON price_feedback_votes(building_id);
CREATE INDEX IF NOT EXISTS idx_price_feedback_votes_area ON price_feedback_votes(area_code);
CREATE INDEX IF NOT EXISTS idx_price_feedback_votes_rating ON price_feedback_votes(rating);
CREATE INDEX IF NOT EXISTS idx_price_feedback_votes_distinct ON price_feedback_votes(distinct_id);

-- Service-role only (no public RLS); table is internal calibration data
ALTER TABLE price_feedback_votes ENABLE ROW LEVEL SECURITY;
