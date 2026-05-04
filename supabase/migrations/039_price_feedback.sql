-- Price feedback from BuildingPanel widget
-- Stored alongside PostHog events so we can query counts directly from Supabase

CREATE TABLE IF NOT EXISTS price_feedback (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id            UUID,
  address                TEXT,
  area_code              TEXT,
  estimated_price_per_sqm NUMERIC,
  rating                 TEXT NOT NULL CHECK (rating IN ('accurate', 'too_high', 'too_low')),
  comment                TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Index for counting by rating and by building
CREATE INDEX IF NOT EXISTS price_feedback_rating_idx   ON price_feedback (rating);
CREATE INDEX IF NOT EXISTS price_feedback_building_idx ON price_feedback (building_id);
CREATE INDEX IF NOT EXISTS price_feedback_created_idx  ON price_feedback (created_at DESC);

-- RLS: anyone can submit, only service role can read
ALTER TABLE price_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public INSERT price_feedback"
  ON price_feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
