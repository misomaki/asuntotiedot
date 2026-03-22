-- ============================================================
-- Migration 020: Comprehensive area-level data
--
-- Adds socioeconomic, housing composition, and employment
-- sector data from Tilastokeskus Paavo WFS.
-- Also adds amenity distance columns to buildings table.
--
-- After deploying:
--   npx tsx scripts/data-import/01-import-paavo-areas.ts
--   npx tsx scripts/data-import/11-import-amenity-distances.ts
-- ============================================================

-- Socioeconomic data per postal code area (income + education + employment)
CREATE TABLE IF NOT EXISTS area_socioeconomics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  year INT NOT NULL,
  -- Income distribution (household income units)
  income_units_total INT,
  income_high INT,
  income_medium INT,
  income_low INT,
  -- Education (18+ population)
  education_pop_18plus INT,
  education_basic INT,
  education_secondary INT,
  education_vocational INT,
  education_lower_tertiary INT,
  education_upper_tertiary INT,
  education_university INT,
  -- Employment status
  employed INT,
  unemployed INT,
  students INT,
  retirees INT,
  UNIQUE (area_id, year)
);

-- Housing composition per postal code area
CREATE TABLE IF NOT EXISTS area_housing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  year INT NOT NULL,
  -- Tenure
  dwellings_total INT,
  owner_occupied INT,
  rented INT,
  other_tenure INT,
  -- Family types
  families_with_children INT,
  young_households INT,
  pensioner_households INT,
  single_parent INT,
  single_person INT,
  -- Building stock
  avg_apartment_size_sqm NUMERIC,
  row_houses INT,
  apartment_buildings INT,
  total_dwellings INT,
  UNIQUE (area_id, year)
);

-- Employment by sector per postal code area (top sectors from NACE)
CREATE TABLE IF NOT EXISTS area_employment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  year INT NOT NULL,
  employed_total INT,
  sector_info_comm INT,          -- J: ICT / tech
  sector_manufacturing INT,      -- C: Manufacturing
  sector_construction INT,       -- F: Construction
  sector_health_social INT,      -- Q: Health & social
  sector_education INT,          -- P: Education
  sector_wholesale_retail INT,   -- G: Wholesale & retail
  sector_public_admin INT,       -- O: Public administration
  sector_finance INT,            -- K: Finance & insurance
  sector_professional INT,       -- M: Professional services
  sector_transport INT,          -- H: Transportation
  sector_accommodation INT,      -- I: Accommodation & food
  UNIQUE (area_id, year)
);

-- Amenity distance columns on buildings table
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS min_distance_to_school_m NUMERIC;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS min_distance_to_kindergarten_m NUMERIC;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS min_distance_to_grocery_m NUMERIC;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS min_distance_to_transit_m NUMERIC;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS min_distance_to_park_m NUMERIC;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS min_distance_to_health_m NUMERIC;

-- Ryhti extended fields (for future enrichment)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS renovation_year INT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS construction_method TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS heating_method TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS total_area_sqm NUMERIC;
