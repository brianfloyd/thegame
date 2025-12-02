// Fix Pulse Harvester NPC required_stats field
require('dotenv').config();
const { query } = require('../database.js');

async function fixPulseHarvester() {
  try {
    // First, find the NPC
    const findResult = await query(
      `SELECT id, name, required_stats FROM scriptable_npcs 
       WHERE name ILIKE '%pulse%harvester%' OR name ILIKE '%harvester%pulse%'`
    );
    
    if (findResult.rows.length === 0) {
      console.log('No Pulse Harvester NPC found. Searching for any NPC with "pulse" or "harvester"...');
      const allResult = await query(
        `SELECT id, name, required_stats FROM scriptable_npcs 
         WHERE name ILIKE '%pulse%' OR name ILIKE '%harvester%'`
      );
      console.log('Found NPCs:', allResult.rows.map(r => ({ id: r.id, name: r.name, required_stats: r.required_stats })));
      return;
    }
    
    const npc = findResult.rows[0];
    console.log(`Found NPC: ${npc.name} (ID: ${npc.id})`);
    console.log(`Current required_stats: ${npc.required_stats}`);
    
    // Reset required_stats to null (empty)
    await query(
      `UPDATE scriptable_npcs SET required_stats = NULL WHERE id = $1`,
      [npc.id]
    );
    
    console.log(`✅ Successfully reset required_stats for "${npc.name}" (ID: ${npc.id})`);
    
    // Verify the update
    const verifyResult = await query(
      `SELECT id, name, required_stats FROM scriptable_npcs WHERE id = $1`,
      [npc.id]
    );
    console.log(`Verified - required_stats is now: ${verifyResult.rows[0].required_stats}`);
    
  } catch (error) {
    console.error('Error fixing Pulse Harvester:', error);
  } finally {
    process.exit(0);
  }
}

fixPulseHarvester();

