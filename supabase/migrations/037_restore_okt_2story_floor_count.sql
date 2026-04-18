-- ============================================================
-- Migration 037: Restore floor_count=2 for 2-story OKTs
--
-- Migration 036 reverted floor_count from 2 → 1 for apt=1
-- buildings with total_area/footprint ratio in [1.3, 1.5),
-- assuming those were data-noise promotions from migration 035.
--
-- In practice many real 2-story Finnish OKTs have an attached
-- garage / sauna wing in the OSM footprint while total_area_sqm
-- (Ryhti kerrosala) covers only the main house's heated area.
-- That inflates the denominator and lands the ratio in 1.3-1.5
-- even though the house is genuinely 2 stories — e.g.
-- Lentokentänkatu 44 / 47 in Tampere.
--
-- Fix: put those buildings back to floor_count=2 and reset
-- estimation_year so size_factor recomputes (OKT v_total_area
-- ≈ footprint × floor_count, so doubling floors bumps the bucket
-- down one level, -3–4% €/m²).
-- ============================================================

UPDATE buildings
SET
  floor_count = 2,
  estimation_year = NULL,
  estimated_price_per_sqm = NULL
WHERE floor_count = 1
  AND apartment_count = 1
  AND is_residential = TRUE
  AND footprint_area_sqm IS NOT NULL
  AND total_area_sqm IS NOT NULL
  AND total_area_sqm > footprint_area_sqm * 1.3
  AND total_area_sqm < footprint_area_sqm * 1.5;
