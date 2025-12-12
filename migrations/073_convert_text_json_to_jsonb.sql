-- Convert all TEXT JSON columns to JSONB
-- This migration normalizes JSON storage to use PostgreSQL's native JSONB type
-- for better performance, type safety, and query capabilities

-- ============================================================
-- scriptable_npcs table
-- ============================================================

-- required_stats: object, default {}
-- Drop default if exists, then change type, then set new default
ALTER TABLE scriptable_npcs
  ALTER COLUMN required_stats DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN required_stats TYPE jsonb
  USING
    CASE
      WHEN required_stats IS NULL OR btrim(required_stats) = '' THEN '{}'::jsonb
      ELSE required_stats::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN required_stats SET DEFAULT '{}'::jsonb;

-- required_buffs: array, default []
ALTER TABLE scriptable_npcs
  ALTER COLUMN required_buffs DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN required_buffs TYPE jsonb
  USING
    CASE
      WHEN required_buffs IS NULL OR btrim(required_buffs) = '' THEN '[]'::jsonb
      ELSE required_buffs::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN required_buffs SET DEFAULT '[]'::jsonb;

-- input_items: object, default {}
ALTER TABLE scriptable_npcs
  ALTER COLUMN input_items DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN input_items TYPE jsonb
  USING
    CASE
      WHEN input_items IS NULL OR btrim(input_items) = '' THEN '{}'::jsonb
      ELSE input_items::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN input_items SET DEFAULT '{}'::jsonb;

-- output_items: object, default {}
ALTER TABLE scriptable_npcs
  ALTER COLUMN output_items DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN output_items TYPE jsonb
  USING
    CASE
      WHEN output_items IS NULL OR btrim(output_items) = '' THEN '{}'::jsonb
      ELSE output_items::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN output_items SET DEFAULT '{}'::jsonb;

-- failure_states: array, default []
ALTER TABLE scriptable_npcs
  ALTER COLUMN failure_states DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN failure_states TYPE jsonb
  USING
    CASE
      WHEN failure_states IS NULL OR btrim(failure_states) = '' THEN '[]'::jsonb
      ELSE failure_states::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN failure_states SET DEFAULT '[]'::jsonb;

-- puzzle_glow_clues: array, default []
ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_glow_clues DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_glow_clues TYPE jsonb
  USING
    CASE
      WHEN puzzle_glow_clues IS NULL OR btrim(puzzle_glow_clues) = '' THEN '[]'::jsonb
      ELSE puzzle_glow_clues::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_glow_clues SET DEFAULT '[]'::jsonb;

-- puzzle_extraction_pattern: array, default []
ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_extraction_pattern DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_extraction_pattern TYPE jsonb
  USING
    CASE
      WHEN puzzle_extraction_pattern IS NULL OR btrim(puzzle_extraction_pattern) = '' THEN '[]'::jsonb
      ELSE puzzle_extraction_pattern::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_extraction_pattern SET DEFAULT '[]'::jsonb;

-- puzzle_hint_responses: array, default []
ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_hint_responses DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_hint_responses TYPE jsonb
  USING
    CASE
      WHEN puzzle_hint_responses IS NULL OR btrim(puzzle_hint_responses) = '' THEN '[]'::jsonb
      ELSE puzzle_hint_responses::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_hint_responses SET DEFAULT '[]'::jsonb;

-- puzzle_followup_responses: array, default []
ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_followup_responses DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_followup_responses TYPE jsonb
  USING
    CASE
      WHEN puzzle_followup_responses IS NULL OR btrim(puzzle_followup_responses) = '' THEN '[]'::jsonb
      ELSE puzzle_followup_responses::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_followup_responses SET DEFAULT '[]'::jsonb;

-- puzzle_incorrect_attempt_responses: array, default []
ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_incorrect_attempt_responses DROP DEFAULT;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_incorrect_attempt_responses TYPE jsonb
  USING
    CASE
      WHEN puzzle_incorrect_attempt_responses IS NULL OR btrim(puzzle_incorrect_attempt_responses) = '' THEN '[]'::jsonb
      ELSE puzzle_incorrect_attempt_responses::jsonb
    END;

ALTER TABLE scriptable_npcs
  ALTER COLUMN puzzle_incorrect_attempt_responses SET DEFAULT '[]'::jsonb;

-- ============================================================
-- room_npcs table
-- ============================================================

-- state: object, NOT NULL, default {}
-- Must drop default first, then change type, then set new default
ALTER TABLE room_npcs
  ALTER COLUMN state DROP DEFAULT;

ALTER TABLE room_npcs
  ALTER COLUMN state TYPE jsonb
  USING
    CASE
      WHEN state IS NULL OR btrim(state) = '' THEN '{}'::jsonb
      ELSE state::jsonb
    END;

ALTER TABLE room_npcs
  ALTER COLUMN state SET NOT NULL;

ALTER TABLE room_npcs
  ALTER COLUMN state SET DEFAULT '{}'::jsonb;

-- ============================================================
-- merchant_items table
-- ============================================================

-- config_json: object, default {}
ALTER TABLE merchant_items
  ALTER COLUMN config_json DROP DEFAULT;

ALTER TABLE merchant_items
  ALTER COLUMN config_json TYPE jsonb
  USING
    CASE
      WHEN config_json IS NULL OR btrim(config_json) = '' THEN '{}'::jsonb
      ELSE config_json::jsonb
    END;

ALTER TABLE merchant_items
  ALTER COLUMN config_json SET DEFAULT '{}'::jsonb;

-- ============================================================
-- players table
-- ============================================================

-- widget_config: object, default {}
ALTER TABLE players
  ALTER COLUMN widget_config DROP DEFAULT;

ALTER TABLE players
  ALTER COLUMN widget_config TYPE jsonb
  USING
    CASE
      WHEN widget_config IS NULL OR btrim(widget_config) = '' THEN '{}'::jsonb
      ELSE widget_config::jsonb
    END;

ALTER TABLE players
  ALTER COLUMN widget_config SET DEFAULT '{}'::jsonb;

-- ============================================================
-- lore_keepers table
-- ============================================================

-- keywords_responses: object, default {}
ALTER TABLE lore_keepers
  ALTER COLUMN keywords_responses DROP DEFAULT;

ALTER TABLE lore_keepers
  ALTER COLUMN keywords_responses TYPE jsonb
  USING
    CASE
      WHEN keywords_responses IS NULL OR btrim(keywords_responses) = '' THEN '{}'::jsonb
      ELSE keywords_responses::jsonb
    END;

ALTER TABLE lore_keepers
  ALTER COLUMN keywords_responses SET DEFAULT '{}'::jsonb;

-- puzzle_clues: array, default []
ALTER TABLE lore_keepers
  ALTER COLUMN puzzle_clues DROP DEFAULT;

ALTER TABLE lore_keepers
  ALTER COLUMN puzzle_clues TYPE jsonb
  USING
    CASE
      WHEN puzzle_clues IS NULL OR btrim(puzzle_clues) = '' THEN '[]'::jsonb
      ELSE puzzle_clues::jsonb
    END;

ALTER TABLE lore_keepers
  ALTER COLUMN puzzle_clues SET DEFAULT '[]'::jsonb;

-- ============================================================
-- Comments for documentation
-- ============================================================

COMMENT ON COLUMN scriptable_npcs.required_stats IS 'JSONB object with stat requirements';
COMMENT ON COLUMN scriptable_npcs.required_buffs IS 'JSONB array of required buffs';
COMMENT ON COLUMN scriptable_npcs.input_items IS 'JSONB object with input item requirements';
COMMENT ON COLUMN scriptable_npcs.output_items IS 'JSONB object with output item definitions';
COMMENT ON COLUMN scriptable_npcs.failure_states IS 'JSONB array of failure state definitions';
COMMENT ON COLUMN scriptable_npcs.puzzle_glow_clues IS 'JSONB array of glow codex puzzle clues';
COMMENT ON COLUMN scriptable_npcs.puzzle_extraction_pattern IS 'JSONB array for puzzle extraction pattern';
COMMENT ON COLUMN scriptable_npcs.puzzle_hint_responses IS 'JSONB array of hint responses';
COMMENT ON COLUMN scriptable_npcs.puzzle_followup_responses IS 'JSONB array of followup responses';
COMMENT ON COLUMN scriptable_npcs.puzzle_incorrect_attempt_responses IS 'JSONB array of incorrect attempt responses';
COMMENT ON COLUMN room_npcs.state IS 'JSONB object storing NPC instance state';
COMMENT ON COLUMN merchant_items.config_json IS 'JSONB object with merchant item configuration';
COMMENT ON COLUMN players.widget_config IS 'JSONB object with player widget configuration';
COMMENT ON COLUMN lore_keepers.keywords_responses IS 'JSONB object mapping keywords to responses';
COMMENT ON COLUMN lore_keepers.puzzle_clues IS 'JSONB array of puzzle clues';

