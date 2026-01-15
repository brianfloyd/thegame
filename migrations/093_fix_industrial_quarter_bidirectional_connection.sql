-- Fix bidirectional connection between Newhaven and Ironreach Industrial Quarter
-- This migration ensures that any one-way connection has its reverse connection created

-- Step 1: Find the Industrial Quarter map ID
DO $$
DECLARE
    industrial_map_id INTEGER;
    newhaven_map_id INTEGER;
    source_room RECORD;
    target_room RECORD;
    opposite_dir TEXT;
BEGIN
    -- Get map IDs
    SELECT id INTO industrial_map_id FROM maps WHERE name LIKE '%Industrial Quarter%' OR name LIKE '%Ironreach%' LIMIT 1;
    SELECT id INTO newhaven_map_id FROM maps WHERE name LIKE '%Newhaven%' OR name LIKE '%New Haven%' LIMIT 1;
    
    IF industrial_map_id IS NULL OR newhaven_map_id IS NULL THEN
        RAISE NOTICE 'Maps not found - Industrial: %, Newhaven: %', industrial_map_id, newhaven_map_id;
        RETURN;
    END IF;
    
    RAISE NOTICE 'Found maps - Industrial: %, Newhaven: %', industrial_map_id, newhaven_map_id;
    
    -- Find any room in Newhaven that connects to Industrial Quarter but doesn't have a reverse connection
    FOR source_room IN 
        SELECT r.* 
        FROM rooms r 
        WHERE r.map_id = newhaven_map_id 
        AND r.connected_map_id = industrial_map_id
        AND r.connected_room_x IS NOT NULL
        AND r.connected_room_y IS NOT NULL
    LOOP
        RAISE NOTICE 'Found connection from Newhaven room % (%, %) to Industrial Quarter (%, %)', 
            source_room.id, source_room.x, source_room.y, source_room.connected_room_x, source_room.connected_room_y;
        
        -- Find the target room in Industrial Quarter
        SELECT * INTO target_room 
        FROM rooms 
        WHERE map_id = industrial_map_id 
        AND x = source_room.connected_room_x 
        AND y = source_room.connected_room_y;
        
        IF target_room IS NULL THEN
            RAISE NOTICE 'Target room not found at (%, %)', source_room.connected_room_x, source_room.connected_room_y;
            CONTINUE;
        END IF;
        
        -- Check if target room already has a connection back
        IF target_room.connected_map_id IS NOT NULL THEN
            RAISE NOTICE 'Target room % already has a connection', target_room.id;
            CONTINUE;
        END IF;
        
        -- Calculate opposite direction
        opposite_dir := CASE source_room.connection_direction
            WHEN 'N' THEN 'S'
            WHEN 'S' THEN 'N'
            WHEN 'E' THEN 'W'
            WHEN 'W' THEN 'E'
            WHEN 'NE' THEN 'SW'
            WHEN 'NW' THEN 'SE'
            WHEN 'SE' THEN 'NW'
            WHEN 'SW' THEN 'NE'
            ELSE NULL
        END;
        
        IF opposite_dir IS NULL THEN
            RAISE NOTICE 'Could not determine opposite direction for %', source_room.connection_direction;
            CONTINUE;
        END IF;
        
        -- Create the reverse connection
        UPDATE rooms 
        SET connected_map_id = newhaven_map_id,
            connected_room_x = source_room.x,
            connected_room_y = source_room.y,
            connection_direction = opposite_dir
        WHERE id = target_room.id;
        
        RAISE NOTICE 'Created reverse connection on room % (%, %) direction % to Newhaven (%, %)', 
            target_room.id, target_room.x, target_room.y, opposite_dir, source_room.x, source_room.y;
    END LOOP;
    
    -- Also check the reverse - rooms in Industrial Quarter connecting to Newhaven
    FOR source_room IN 
        SELECT r.* 
        FROM rooms r 
        WHERE r.map_id = industrial_map_id 
        AND r.connected_map_id = newhaven_map_id
        AND r.connected_room_x IS NOT NULL
        AND r.connected_room_y IS NOT NULL
    LOOP
        RAISE NOTICE 'Found connection from Industrial Quarter room % (%, %) to Newhaven (%, %)', 
            source_room.id, source_room.x, source_room.y, source_room.connected_room_x, source_room.connected_room_y;
        
        -- Find the target room in Newhaven
        SELECT * INTO target_room 
        FROM rooms 
        WHERE map_id = newhaven_map_id 
        AND x = source_room.connected_room_x 
        AND y = source_room.connected_room_y;
        
        IF target_room IS NULL THEN
            RAISE NOTICE 'Target room not found at (%, %)', source_room.connected_room_x, source_room.connected_room_y;
            CONTINUE;
        END IF;
        
        -- Check if target room already has a connection back
        IF target_room.connected_map_id IS NOT NULL THEN
            RAISE NOTICE 'Target room % already has a connection', target_room.id;
            CONTINUE;
        END IF;
        
        -- Calculate opposite direction
        opposite_dir := CASE source_room.connection_direction
            WHEN 'N' THEN 'S'
            WHEN 'S' THEN 'N'
            WHEN 'E' THEN 'W'
            WHEN 'W' THEN 'E'
            WHEN 'NE' THEN 'SW'
            WHEN 'NW' THEN 'SE'
            WHEN 'SE' THEN 'NW'
            WHEN 'SW' THEN 'NE'
            ELSE NULL
        END;
        
        IF opposite_dir IS NULL THEN
            RAISE NOTICE 'Could not determine opposite direction for %', source_room.connection_direction;
            CONTINUE;
        END IF;
        
        -- Create the reverse connection
        UPDATE rooms 
        SET connected_map_id = industrial_map_id,
            connected_room_x = source_room.x,
            connected_room_y = source_room.y,
            connection_direction = opposite_dir
        WHERE id = target_room.id;
        
        RAISE NOTICE 'Created reverse connection on room % (%, %) direction % to Industrial Quarter (%, %)', 
            target_room.id, target_room.x, target_room.y, opposite_dir, source_room.x, source_room.y;
    END LOOP;
END $$;

-- General fix: Find ALL one-way connections and create their reverse
DO $$
DECLARE
    source_room RECORD;
    target_room RECORD;
    opposite_dir TEXT;
    fixed_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Checking all map connections for missing reverse connections...';
    
    FOR source_room IN 
        SELECT r.* 
        FROM rooms r 
        WHERE r.connected_map_id IS NOT NULL
        AND r.connected_room_x IS NOT NULL
        AND r.connected_room_y IS NOT NULL
        AND r.connection_direction IS NOT NULL
    LOOP
        -- Find the target room
        SELECT * INTO target_room 
        FROM rooms 
        WHERE map_id = source_room.connected_map_id 
        AND x = source_room.connected_room_x 
        AND y = source_room.connected_room_y;
        
        IF target_room IS NULL THEN
            RAISE NOTICE 'Warning: Room % connects to non-existent room at map % (%, %)', 
                source_room.id, source_room.connected_map_id, source_room.connected_room_x, source_room.connected_room_y;
            CONTINUE;
        END IF;
        
        -- Check if target room has a connection back to source
        IF target_room.connected_map_id = source_room.map_id 
           AND target_room.connected_room_x = source_room.x 
           AND target_room.connected_room_y = source_room.y THEN
            -- Already has correct reverse connection
            CONTINUE;
        END IF;
        
        -- Target room doesn't have a connection - create one
        IF target_room.connected_map_id IS NULL THEN
            -- Calculate opposite direction
            opposite_dir := CASE source_room.connection_direction
                WHEN 'N' THEN 'S'
                WHEN 'S' THEN 'N'
                WHEN 'E' THEN 'W'
                WHEN 'W' THEN 'E'
                WHEN 'NE' THEN 'SW'
                WHEN 'NW' THEN 'SE'
                WHEN 'SE' THEN 'NW'
                WHEN 'SW' THEN 'NE'
                ELSE NULL
            END;
            
            IF opposite_dir IS NOT NULL THEN
                UPDATE rooms 
                SET connected_map_id = source_room.map_id,
                    connected_room_x = source_room.x,
                    connected_room_y = source_room.y,
                    connection_direction = opposite_dir
                WHERE id = target_room.id;
                
                fixed_count := fixed_count + 1;
                RAISE NOTICE 'Fixed: Created reverse connection from room % to room %', target_room.id, source_room.id;
            END IF;
        ELSE
            RAISE NOTICE 'Warning: Room % has connection to room % but target has different connection (to map % at %, %)', 
                source_room.id, target_room.id, target_room.connected_map_id, target_room.connected_room_x, target_room.connected_room_y;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Fixed % missing reverse connections', fixed_count;
END $$;
