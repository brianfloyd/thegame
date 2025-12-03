/**
 * Remove Account by Email
 * 
 * Removes an account and all associated data from the database.
 * This is a testing-only script - no constraints, will be reworked for production.
 * 
 * Usage:
 *   node scripts/remove-account.js <email>
 * 
 * What gets deleted:
 *   - Account record
 *   - All characters/players associated with the account
 *   - Player inventory (player_items)
 *   - Player bank storage (player_bank)
 *   - Warehouse items and warehouse ownership (warehouse_items, player_warehouses)
 *   - Terminal history (player's own history only)
 *   - Lore keeper data (greetings, item awards)
 *   - User character links (user_characters)
 *   - Email verification tokens
 *   - Password reset tokens
 * 
 * What is NOT deleted (as requested):
 *   - Player names appearing in another player's backscroll (terminal_history from other players)
 *   - Broadcasting system conversations (terminal_history from other players)
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

async function removeAccountByEmail(email) {
  console.log('='.repeat(60));
  console.log('Remove Account by Email');
  console.log('='.repeat(60));
  console.log('');
  
  if (!email) {
    console.error('❌ Error: Email address is required');
    console.error('');
    console.error('Usage: node scripts/remove-account.js <email>');
    process.exit(1);
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Step 1: Find account by email
    console.log(`Looking up account for email: ${email}`);
    const accountResult = await client.query(
      'SELECT id, email FROM accounts WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (accountResult.rows.length === 0) {
      console.log(`❌ No account found with email: ${email}`);
      await client.query('ROLLBACK');
      process.exit(1);
    }
    
    const account = accountResult.rows[0];
    console.log(`✅ Found account: ${account.email} (ID: ${account.id})`);
    console.log('');
    
    // Step 2: Get all player IDs associated with this account
    console.log('Finding characters associated with this account...');
    const charactersResult = await client.query(
      'SELECT player_id FROM user_characters WHERE account_id = $1',
      [account.id]
    );
    
    const playerIds = charactersResult.rows.map(row => row.player_id);
    
    if (playerIds.length === 0) {
      console.log('⚠️  No characters found for this account');
    } else {
      console.log(`✅ Found ${playerIds.length} character(s):`);
      
      // Get player names for display
      if (playerIds.length > 0) {
        const playerNamesResult = await client.query(
          `SELECT id, name FROM players WHERE id = ANY($1)`,
          [playerIds]
        );
        playerNamesResult.rows.forEach(player => {
          console.log(`   - ${player.name} (ID: ${player.id})`);
        });
      }
      console.log('');
      
      // Step 3: Delete warehouse_items for these players
      console.log('Deleting warehouse items...');
      const warehouseItemsResult = await client.query(
        'DELETE FROM warehouse_items WHERE player_id = ANY($1)',
        [playerIds]
      );
      console.log(`   Deleted ${warehouseItemsResult.rowCount} warehouse item record(s)`);
      
      // Step 4: Delete player_warehouses for these players
      console.log('Deleting warehouse ownership records...');
      const warehouseOwnershipResult = await client.query(
        'DELETE FROM player_warehouses WHERE player_id = ANY($1)',
        [playerIds]
      );
      console.log(`   Deleted ${warehouseOwnershipResult.rowCount} warehouse ownership record(s)`);
      
      // Step 5: Delete player_items for these players
      console.log('Deleting player inventory...');
      const playerItemsResult = await client.query(
        'DELETE FROM player_items WHERE player_id = ANY($1)',
        [playerIds]
      );
      console.log(`   Deleted ${playerItemsResult.rowCount} inventory item record(s)`);
      
      // Step 6: Delete players (this will cascade to: player_bank, terminal_history, lore_keeper_greetings, lore_keeper_item_awards)
      console.log('Deleting player characters...');
      const playersResult = await client.query(
        'DELETE FROM players WHERE id = ANY($1)',
        [playerIds]
      );
      console.log(`   Deleted ${playersResult.rowCount} player character(s)`);
      console.log('');
    }
    
    // Step 7: Delete account (this will cascade to: user_characters, email_verification_tokens, password_reset_tokens)
    console.log('Deleting account...');
    const accountDeleteResult = await client.query(
      'DELETE FROM accounts WHERE id = $1',
      [account.id]
    );
    console.log(`   Deleted account: ${account.email}`);
    console.log('');
    
    await client.query('COMMIT');
    
    console.log('✅ Account removal completed successfully!');
    console.log('');
    console.log('Note: This script does NOT delete:');
    console.log('  - Player names appearing in other players\' backscroll (terminal_history)');
    console.log('  - Broadcasting system conversations (terminal_history from other players)');
    console.log('');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error removing account:', err.message);
    console.error('');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const email = process.argv[2];
  
  removeAccountByEmail(email)
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => {
      pool.end();
    });
}

module.exports = removeAccountByEmail;










