/**
 * Fix room_items that have item IDs stored as item_name instead of actual item names
 * This happened when items were added to rooms before the item ID to name conversion was fixed
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function fixRoomItems() {
  const client = await pool.connect();
  
  try {
    console.log('Starting room_items cleanup...');
    
    // Get all room_items where item_name is numeric (likely an item ID)
    const result = await client.query(`
      SELECT id, room_id, item_name, quantity
      FROM room_items
      WHERE item_name ~ '^[0-9]+$'
      ORDER BY id
    `);
    
    console.log(`Found ${result.rows.length} room_items with numeric item_name (likely item IDs)`);
    
    let fixed = 0;
    let errors = 0;
    
    for (const row of result.rows) {
      const itemId = parseInt(row.item_name);
      
      // Look up the item by ID
      const itemResult = await client.query('SELECT id, name FROM items WHERE id = $1', [itemId]);
      
      if (itemResult.rows.length === 0) {
        console.warn(`  Item ID ${itemId} not found in items table (room_item id: ${row.id})`);
        errors++;
        continue;
      }
      
      const itemName = itemResult.rows[0].name;
      
      // Check if there's already a room_item with the correct name
      const existingResult = await client.query(
        `SELECT id, quantity FROM room_items 
         WHERE room_id = $1 AND item_name = $2 AND id != $3`,
        [row.room_id, itemName, row.id]
      );
      
      if (existingResult.rows.length > 0) {
        // Merge quantities
        const existing = existingResult.rows[0];
        await client.query(
          'UPDATE room_items SET quantity = quantity + $1 WHERE id = $2',
          [row.quantity, existing.id]
        );
        // Delete the duplicate
        await client.query('DELETE FROM room_items WHERE id = $1', [row.id]);
        console.log(`  Merged ${row.quantity}x ${itemName} (ID ${itemId}) into existing entry in room ${row.room_id}`);
      } else {
        // Update the item_name to the correct name
        await client.query(
          'UPDATE room_items SET item_name = $1 WHERE id = $2',
          [itemName, row.id]
        );
        console.log(`  Fixed room_item ${row.id}: "${row.item_name}" -> "${itemName}" (quantity: ${row.quantity})`);
      }
      
      fixed++;
    }
    
    console.log(`\nCleanup complete: ${fixed} fixed, ${errors} errors`);
    
  } catch (error) {
    console.error('Error fixing room_items:', error);
    throw error;
  } finally {
    client.release();
  }
}

fixRoomItems()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });



