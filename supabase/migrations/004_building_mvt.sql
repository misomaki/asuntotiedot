-- ============================================================
-- RPC: Generate Mapbox Vector Tiles (MVT) for buildings
-- ============================================================
-- Returns base64-encoded MVT binary for a given z/x/y tile.
-- Supabase PostgREST wraps RPC responses in JSON, so BYTEA
-- cannot be returned directly. We encode as base64 TEXT and
-- the API route decodes back to binary.
--
-- Usage: SELECT get_buildings_mvt(14, 9326, 4734);
-- ============================================================

CREATE OR REPLACE FUNCTION get_buildings_mvt(z INT, x INT, y INT)
RETURNS TEXT AS $$
DECLARE
  bbox GEOMETRY;
  mvt BYTEA;
BEGIN
  -- Convert tile coordinates to Web Mercator bounding box
  bbox := ST_TileEnvelope(z, x, y);

  -- Build MVT from buildings intersecting this tile.
  -- Non-residential types (office, hotel, civic) are included but flagged
  -- so the client can render them differently and show a distinct tooltip.
  SELECT INTO mvt ST_AsMVT(tile, 'buildings', 4096, 'geom')
  FROM (
    SELECT
      b.id::text AS id,
      b.building_type,
      b.construction_year,
      b.floor_count,
      b.address,
      b.estimated_price_per_sqm::float8 AS price,
      CASE WHEN b.building_type IN (
        'office', 'hotel', 'civic', 'commercial', 'retail',
        'industrial', 'warehouse', 'church', 'chapel',
        'hospital', 'school', 'university', 'kindergarten',
        'public', 'government', 'transportation', 'train_station'
      ) THEN false ELSE true END AS is_residential,
      ST_AsMVTGeom(
        ST_Transform(b.geometry, 3857),
        bbox,
        4096,   -- tile extent (resolution)
        256,    -- buffer pixels
        true    -- clip geometry to tile
      ) AS geom
    FROM buildings b
    WHERE b.geometry && ST_Transform(bbox, 4326)
  ) AS tile
  WHERE tile.geom IS NOT NULL;

  -- Return base64-encoded MVT (empty string if no buildings in tile)
  RETURN COALESCE(encode(mvt, 'base64'), '');
END;
$$ LANGUAGE plpgsql STABLE PARALLEL SAFE;
