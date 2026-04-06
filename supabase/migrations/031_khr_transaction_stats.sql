-- Migration 031: KHR transaction statistics from MML Tilastopalvelu REST API
--
-- Stores aggregate real estate transaction statistics from kauppahintarekisteri.
-- This covers KIINTEISTÖKAUPPA (property/land sales) = omakotitalot on own land.
-- NOT asunto-osakekauppa (apartment shares) — those are in StatFin.
--
-- Data is free, open (CC BY 4.0), no auth required.
-- API: khr.maanmittauslaitos.fi/tilastopalvelu/rest/1.1

CREATE TABLE IF NOT EXISTS khr_transaction_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id),
  area_code TEXT NOT NULL,                    -- postal code (for areas not in our DB)
  area_name TEXT,                             -- region name from KHR
  year INT NOT NULL,
  location_type TEXT NOT NULL CHECK (         -- plan area vs rural
    location_type IN ('plan', 'rural')
  ),
  transaction_count INT,                      -- number of transactions
  median_price NUMERIC,                       -- median total price (€)
  mean_price NUMERIC,                         -- mean total price (€)
  std_dev_price NUMERIC,                      -- standard deviation (€)
  avg_plot_area_sqm NUMERIC,                  -- average plot area (m²)
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(area_code, year, location_type)
);

-- Index for lookups by area
CREATE INDEX IF NOT EXISTS idx_khr_stats_area_id ON khr_transaction_stats(area_id) WHERE area_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_khr_stats_area_code ON khr_transaction_stats(area_code);
CREATE INDEX IF NOT EXISTS idx_khr_stats_year ON khr_transaction_stats(year);

COMMENT ON TABLE khr_transaction_stats IS 'OKT transaction statistics from MML kauppahintarekisteri (tilastopalvelu REST API). Total prices, not per-sqm.';
