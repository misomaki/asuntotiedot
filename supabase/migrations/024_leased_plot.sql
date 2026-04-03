-- ============================================================
-- Migration 024: Tampere municipal leased plots (vuokratontti)
--
-- 1. _tampere_municipal_plots staging table (polygon geometries)
-- 2. is_leased_plot BOOLEAN column on buildings
-- 3. mark_leased_plots_batch() RPC: spatial join building centroid
--    within plot polygon, scoped to Tampere buildings only
-- 4. reset_tampere_leased_plots() RPC: reset for re-runs
--
-- After deploying:
--   npx tsx scripts/data-import/10-import-tampere-plots.ts
-- ============================================================

-- Staging table for Tampere municipality-owned plot polygons
CREATE TABLE IF NOT EXISTS _tampere_municipal_plots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id     TEXT,
  geometry    GEOMETRY(MultiPolygon, 4326) NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tampere_plots_geom
  ON _tampere_municipal_plots USING GIST(geometry);

-- Column on buildings
ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS is_leased_plot BOOLEAN;

-- ============================================================
-- mark_leased_plots_batch: spatial join building centroid
-- within municipal plot polygon. Call in loop until returns 0.
-- ============================================================
CREATE OR REPLACE FUNCTION mark_leased_plots_batch(p_limit INT DEFAULT 1000)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE buildings b
  SET is_leased_plot = EXISTS (
    SELECT 1
    FROM _tampere_municipal_plots p
    WHERE ST_Within(
      ST_Transform(b.centroid, 3067),
      ST_Transform(p.geometry, 3067)
    )
  )
  WHERE b.id IN (
    SELECT b2.id
    FROM buildings b2
    JOIN areas a ON a.id = b2.area_id
    WHERE a.municipality = 'Tampere'
      AND b2.centroid IS NOT NULL
      AND b2.is_leased_plot IS NULL
    LIMIT p_limit
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- reset_tampere_leased_plots: reset for idempotent re-runs
-- ============================================================
CREATE OR REPLACE FUNCTION reset_tampere_leased_plots()
RETURNS INT AS $$
DECLARE v_count INT;
BEGIN
  UPDATE buildings b
  SET is_leased_plot = NULL
  FROM areas a
  WHERE b.area_id = a.id AND a.municipality = 'Tampere';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
