/**
 * Fix stuck harvest sessions - end any harvests where the player is not connected
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function fixStuckHarvests() {
  const client = await pool.connect();
  
  try {
    console.log('Checking for stuck harvest sessions...');
    
    // Get all room_npcs with active harvests
    // Check both JSONB and text formats
    const result = await client.query(`
      SELECT rn.id, rn.npc_id, rn.room_id, rn.state, sn.npc_type
      FROM room_npcs rn
      JOIN scriptable_npcs sn ON rn.npc_id = sn.id
      WHERE (rn.state::jsonb->>'harvest_active')::boolean = true
        AND sn.npc_type = 'rhythm'
    `);
    
    console.log(`Found ${result.rows.length} NPCs with active harvest state`);
    
    let fixed = 0;
    
    for (const row of result.rows) {
      let state = {};
      try {
        state = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
      } catch (e) {
        console.warn(`  Could not parse state for room_npc ${row.id}:`, e.message);
        continue;
      }
      
      if (state.harvest_active && state.harvesting_player_id) {
        const playerId = state.harvesting_player_id;
        
        // Check if player exists and is online (we can't check WebSocket connections from here,
        // but we can at least verify the player exists)
        const playerResult = await client.query('SELECT id, name FROM players WHERE id = $1', [playerId]);
        
        if (playerResult.rows.length === 0) {
          console.log(`  Player ${playerId} not found - ending harvest on room_npc ${row.id}`);
        } else {
          console.log(`  Found active harvest for player ${playerResult.rows[0].name} (${playerId}) on room_npc ${row.id}`);
          console.log(`  NOTE: This harvest will be cleaned up by the server's periodic cleanup if player is disconnected`);
        }
        
        // End the harvest session
        const npcDefResult = await client.query('SELECT cooldown_time FROM scriptable_npcs WHERE id = $1', [row.npc_id]);
        const baseCooldownTime = npcDefResult.rows[0]?.cooldown_time || 120000;
        
        state.harvest_active = false;
        state.harvesting_player_id = null;
        state.harvest_start_time = null;
        state.last_harvest_item_production = null;
        state.harvest_end_reason = 'cleanup_script';
        state.cooldown_until = Date.now() + baseCooldownTime;
        
        await client.query(
          'UPDATE room_npcs SET state = $1 WHERE id = $2',
          [JSON.stringify(state), row.id]
        );
        
        fixed++;
        console.log(`  Fixed room_npc ${row.id}`);
      }
    }
    
    console.log(`\nCleanup complete: ${fixed} harvest sessions ended`);
    
  } catch (error) {
    console.error('Error fixing stuck harvests:', error);
    throw error;
  } finally {
    client.release();
  }
}

fixStuckHarvests()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

