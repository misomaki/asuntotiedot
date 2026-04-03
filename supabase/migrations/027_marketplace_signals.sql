-- 027: Marketplace signals — buyer interest & seller intent
-- Phase 1: Lightweight signals (no messaging, no contact exchange)

-- ============================================================
-- 1. User profiles (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  phone_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Building interest signals (buyer side)
-- ============================================================
CREATE TABLE IF NOT EXISTS building_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  max_price_per_sqm NUMERIC,          -- optional: buyer's max budget
  note TEXT,                           -- optional: short note (max 280 chars)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  UNIQUE(user_id, building_id)
);

CREATE INDEX idx_building_interests_building ON building_interests(building_id);
CREATE INDEX idx_building_interests_user ON building_interests(user_id);
CREATE INDEX idx_building_interests_expires ON building_interests(expires_at);

-- ============================================================
-- 3. Building sell intents (seller side)
-- ============================================================
CREATE TABLE IF NOT EXISTS building_sell_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  asking_price_per_sqm NUMERIC,       -- optional: seller's asking price
  property_type TEXT,                  -- 'kerrostalo' | 'rivitalo' | 'omakotitalo'
  note TEXT,                           -- optional: short description (max 500 chars)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '180 days'),
  UNIQUE(user_id, building_id)
);

CREATE INDEX idx_sell_intents_building ON building_sell_intents(building_id);
CREATE INDEX idx_sell_intents_user ON building_sell_intents(user_id);
CREATE INDEX idx_sell_intents_expires ON building_sell_intents(expires_at);

-- ============================================================
-- 4. Row-Level Security
-- ============================================================

-- User profiles: users can read all, update only own
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON user_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Building interests: anyone can see counts, only owner sees own details
ALTER TABLE building_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interest counts are viewable by everyone"
  ON building_interests FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own interests"
  ON building_interests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interests"
  ON building_interests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own interests"
  ON building_interests FOR DELETE
  USING (auth.uid() = user_id);

-- Sell intents: anyone can see counts, only owner sees own details
ALTER TABLE building_sell_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sell intents are viewable by everyone"
  ON building_sell_intents FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own sell intents"
  ON building_sell_intents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sell intents"
  ON building_sell_intents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sell intents"
  ON building_sell_intents FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. Aggregate signal counts RPC (public, no user details exposed)
-- ============================================================
CREATE OR REPLACE FUNCTION get_building_signals(p_building_id UUID)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'interest_count', (
      SELECT COUNT(*)
      FROM building_interests
      WHERE building_id = p_building_id
        AND expires_at > NOW()
    ),
    'sell_intent_count', (
      SELECT COUNT(*)
      FROM building_sell_intents
      WHERE building_id = p_building_id
        AND expires_at > NOW()
    ),
    'has_sell_intent', (
      SELECT EXISTS(
        SELECT 1
        FROM building_sell_intents
        WHERE building_id = p_building_id
          AND expires_at > NOW()
      )
    )
  );
$$;

-- Batch version for map layer (multiple buildings at once)
CREATE OR REPLACE FUNCTION get_buildings_signal_counts(p_building_ids UUID[])
RETURNS TABLE(building_id UUID, interest_count BIGINT, has_sell_intent BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    b.id AS building_id,
    COALESCE(bi.cnt, 0) AS interest_count,
    COALESCE(si.has_intent, FALSE) AS has_sell_intent
  FROM unnest(p_building_ids) AS b(id)
  LEFT JOIN (
    SELECT building_id, COUNT(*) AS cnt
    FROM building_interests
    WHERE expires_at > NOW()
    GROUP BY building_id
  ) bi ON bi.building_id = b.id
  LEFT JOIN (
    SELECT building_id, TRUE AS has_intent
    FROM building_sell_intents
    WHERE expires_at > NOW()
    GROUP BY building_id
  ) si ON si.building_id = b.id;
$$;

-- ============================================================
-- 6. Auto-create user profile on first auth
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
