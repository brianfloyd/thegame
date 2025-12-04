-- Fix Pulse Harvester NPC required_stats field
-- Reset to NULL to fix JSON parsing error
-- The user prematurely updated this to {ingenity:5} which is invalid JSON

UPDATE scriptable_npcs 
SET required_stats = NULL 
WHERE name ILIKE '%pulse%harvester%' 
   OR name ILIKE '%harvester%pulse%'
   OR (required_stats IS NOT NULL AND required_stats::text LIKE '%ingenity%');

-- If no exact match, try to find any NPC with malformed JSON in required_stats
-- This will reset any NPC that has invalid JSON in required_stats
-- (PostgreSQL will throw an error if we try to cast invalid JSON, so we use a function)

DO $$
DECLARE
    npc_record RECORD;
    invalid_json_count INTEGER := 0;
BEGIN
    -- Find and fix NPCs with invalid JSON in required_stats
    FOR npc_record IN 
        SELECT id, name, required_stats 
        FROM scriptable_npcs 
        WHERE required_stats IS NOT NULL
    LOOP
        BEGIN
            -- Try to parse as JSON - if it fails, we'll catch it
            PERFORM required_stats::json FROM scriptable_npcs WHERE id = npc_record.id;
        EXCEPTION WHEN OTHERS THEN
            -- Invalid JSON detected - reset it
            UPDATE scriptable_npcs SET required_stats = NULL WHERE id = npc_record.id;
            invalid_json_count := invalid_json_count + 1;
            RAISE NOTICE 'Fixed invalid JSON in required_stats for NPC: % (ID: %)', npc_record.name, npc_record.id;
        END;
    END LOOP;
    
    RAISE NOTICE 'Fixed % NPC(s) with invalid JSON in required_stats', invalid_json_count;
END $$;







