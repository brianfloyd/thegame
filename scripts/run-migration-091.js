/**
 * Run migration 091: Fix harvest message templates
 * Removes angle brackets from NPC name placeholders
 */

const db = require('../database');

async function runMigration() {
  try {
    console.log('[Migration 091] Starting...');
    
    // Update harvest_begin
    await db.query(`
      UPDATE game_messages 
      SET message_template = 'You begin harvesting the {npcName}.',
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      WHERE message_key = 'harvest_begin' AND message_template LIKE '%<{npcName}>%'
    `);
    console.log('[Migration 091] Updated harvest_begin');
    
    // Update harvest_miss
    await db.query(`
      UPDATE game_messages 
      SET message_template = 'Your harvest from {npcName} misses this cycle.',
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      WHERE message_key = 'harvest_miss' AND message_template LIKE '%<{npcName}>%'
    `);
    console.log('[Migration 091] Updated harvest_miss');
    
    // Update harvest_item_produced
    await db.query(`
      UPDATE game_messages 
      SET message_template = '{npcName} pulses {quantity} {itemName} for harvest.',
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      WHERE message_key = 'harvest_item_produced' AND message_template LIKE '%<{npcName}>%'
    `);
    console.log('[Migration 091] Updated harvest_item_produced');
    
    // Update harvest_cooldown
    await db.query(`
      UPDATE game_messages 
      SET message_template = '{npcName} has been harvested and must cooldown before continue harvest.',
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
      WHERE message_key = 'harvest_cooldown' AND message_template LIKE '%<{npcName}>%'
    `);
    console.log('[Migration 091] Updated harvest_cooldown');
    
    console.log('[Migration 091] Complete!');
    process.exit(0);
  } catch (error) {
    console.error('[Migration 091] Error:', error);
    process.exit(1);
  }
}

runMigration();




