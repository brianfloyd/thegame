/**
 * Test Sync Safety Scenario
 * 
 * Demonstrates that the sync script:
 * 1. Syncs game content (items) from dev to prod
 * 2. Protects user data (accounts) - does NOT sync from dev to prod
 * 3. Preserves existing prod data (accounts remain in prod)
 * 
 * Test Scenario:
 * - Add a new item "Test Sync Item" to DEV database
 * - Add a new account "testuser@example.com" to PROD database
 * - Run sync (dev -> prod)
 * - Verify: Item appears in prod, account remains in prod, account NOT in dev
 * 
 * Usage:
 *   DEV_DATABASE_URL=... PROD_DATABASE_URL=... node scripts/test-sync-safety.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const devPool = new Pool({
  connectionString: process.env.DEV_DATABASE_URL || process.env.DATABASE_URL,
  ssl: false
});

const prodPool = new Pool({
  connectionString: process.env.PROD_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TEST_ITEM_NAME = 'Test Sync Item';
const TEST_ACCOUNT_EMAIL = 'testuser@example.com';

async function setupTestData() {
  console.log('='.repeat(60));
  console.log('🧪 Setting Up Test Data');
  console.log('='.repeat(60));
  
  const devClient = await devPool.connect();
  const prodClient = await prodPool.connect();
  
  try {
    // Step 1: Add test item to DEV
    console.log('\n📦 Step 1: Adding test item to DEV database...');
    const itemCheck = await devClient.query('SELECT * FROM items WHERE name = $1', [TEST_ITEM_NAME]);
    
    if (itemCheck.rows.length === 0) {
      await devClient.query(`
        INSERT INTO items (name, description, item_type, active, poofable, encumbrance, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        TEST_ITEM_NAME,
        'This is a test item created to verify sync safety. Safe to delete after testing.',
        'sundries',
        true,
        false,
        1,
        Date.now()
      ]);
      console.log('   ✅ Test item added to DEV');
    } else {
      console.log('   ℹ️  Test item already exists in DEV');
    }
    
    // Step 2: Add test account to PROD
    console.log('\n👤 Step 2: Adding test account to PROD database...');
    const accountCheck = await prodClient.query('SELECT * FROM accounts WHERE email = $1', [TEST_ACCOUNT_EMAIL]);
    
    if (accountCheck.rows.length === 0) {
      const passwordHash = await bcrypt.hash('testpassword123', 10);
      await prodClient.query(`
        INSERT INTO accounts (email, password_hash, email_verified, created_at, last_login_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        TEST_ACCOUNT_EMAIL,
        passwordHash,
        false,
        Date.now(),
        Date.now()
      ]);
      console.log('   ✅ Test account added to PROD');
    } else {
      console.log('   ℹ️  Test account already exists in PROD');
    }
    
    // Step 3: Verify initial state
    console.log('\n🔍 Step 3: Verifying initial state...');
    
    const devItem = await devClient.query('SELECT * FROM items WHERE name = $1', [TEST_ITEM_NAME]);
    const prodItem = await prodClient.query('SELECT * FROM items WHERE name = $1', [TEST_ITEM_NAME]);
    const devAccount = await devClient.query('SELECT * FROM accounts WHERE email = $1', [TEST_ACCOUNT_EMAIL]);
    const prodAccount = await prodClient.query('SELECT * FROM accounts WHERE email = $1', [TEST_ACCOUNT_EMAIL]);
    
    console.log(`   DEV - Item "${TEST_ITEM_NAME}": ${devItem.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   PROD - Item "${TEST_ITEM_NAME}": ${prodItem.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   DEV - Account "${TEST_ACCOUNT_EMAIL}": ${devAccount.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   PROD - Account "${TEST_ACCOUNT_EMAIL}": ${prodAccount.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
    
    console.log('\n📋 Expected Results After Sync:');
    console.log('   ✅ Item should appear in PROD (synced from DEV)');
    console.log('   ✅ Account should remain in PROD (protected, not synced)');
    console.log('   ❌ Account should NOT appear in DEV (protected tables never synced)');
    
  } catch (err) {
    console.error('❌ Error setting up test data:', err.message);
    throw err;
  } finally {
    devClient.release();
    prodClient.release();
  }
}

async function verifySyncResults() {
  console.log('\n' + '='.repeat(60));
  console.log('✅ Verifying Sync Results');
  console.log('='.repeat(60));
  
  const devClient = await devPool.connect();
  const prodClient = await prodPool.connect();
  
  try {
    const devItem = await devClient.query('SELECT * FROM items WHERE name = $1', [TEST_ITEM_NAME]);
    const prodItem = await prodClient.query('SELECT * FROM items WHERE name = $1', [TEST_ITEM_NAME]);
    const devAccount = await devClient.query('SELECT * FROM accounts WHERE email = $1', [TEST_ACCOUNT_EMAIL]);
    const prodAccount = await prodClient.query('SELECT * FROM accounts WHERE email = $1', [TEST_ACCOUNT_EMAIL]);
    
    console.log('\n📊 Results:');
    console.log('─'.repeat(60));
    
    // Test 1: Item synced from dev to prod
    const test1Pass = prodItem.rows.length > 0;
    console.log(`\nTest 1: Item synced from DEV to PROD`);
    console.log(`   DEV has item: ${devItem.rows.length > 0 ? '✅' : '❌'}`);
    console.log(`   PROD has item: ${prodItem.rows.length > 0 ? '✅' : '❌'}`);
    console.log(`   Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2: Account NOT synced from prod to dev (protected)
    const test2Pass = devAccount.rows.length === 0;
    console.log(`\nTest 2: Account NOT synced from PROD to DEV (protected)`);
    console.log(`   PROD has account: ${prodAccount.rows.length > 0 ? '✅' : '❌'}`);
    console.log(`   DEV has account: ${devAccount.rows.length > 0 ? '❌ (SHOULD NOT)' : '✅ (CORRECT)'}`);
    console.log(`   Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 3: Account preserved in prod
    const test3Pass = prodAccount.rows.length > 0;
    console.log(`\nTest 3: Account preserved in PROD`);
    console.log(`   PROD account still exists: ${prodAccount.rows.length > 0 ? '✅' : '❌'}`);
    console.log(`   Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
    
    console.log('\n' + '='.repeat(60));
    const allPass = test1Pass && test2Pass && test3Pass;
    if (allPass) {
      console.log('🎉 ALL TESTS PASSED - Sync safety verified!');
    } else {
      console.log('⚠️  SOME TESTS FAILED - Review results above');
    }
    console.log('='.repeat(60));
    
    return allPass;
    
  } catch (err) {
    console.error('❌ Error verifying results:', err.message);
    throw err;
  } finally {
    devClient.release();
    prodClient.release();
  }
}

async function cleanupTestData() {
  console.log('\n' + '='.repeat(60));
  console.log('🧹 Cleaning Up Test Data');
  console.log('='.repeat(60));
  
  const devClient = await devPool.connect();
  const prodClient = await prodPool.connect();
  
  try {
    // Remove test item from both databases
    console.log('\n🗑️  Removing test item...');
    await devClient.query('DELETE FROM items WHERE name = $1', [TEST_ITEM_NAME]);
    await prodClient.query('DELETE FROM items WHERE name = $1', [TEST_ITEM_NAME]);
    console.log('   ✅ Test item removed');
    
    // Remove test account from prod (it shouldn't be in dev)
    console.log('\n🗑️  Removing test account...');
    await prodClient.query('DELETE FROM accounts WHERE email = $1', [TEST_ACCOUNT_EMAIL]);
    console.log('   ✅ Test account removed');
    
    console.log('\n✅ Cleanup complete');
    
  } catch (err) {
    console.error('❌ Error cleaning up:', err.message);
    throw err;
  } finally {
    devClient.release();
    prodClient.release();
    await devPool.end();
    await prodPool.end();
  }
}

async function runTest() {
  try {
    // Setup
    await setupTestData();
    
    console.log('\n' + '='.repeat(60));
    console.log('⏸️  PAUSE: Now run the sync script');
    console.log('='.repeat(60));
    console.log('\nRun this command:');
    console.log('   npm run sync-dev-to-prod');
    console.log('\nOr for dry-run:');
    console.log('   npm run sync-dev-to-prod:dry-run');
    console.log('\nPress Enter after sync completes to verify results...');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    await new Promise(resolve => {
      rl.question('\n> ', () => {
        rl.close();
        resolve();
      });
    });
    
    // Verify
    const allPass = await verifySyncResults();
    
    // Cleanup
    const cleanup = await new Promise(resolve => {
      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl2.question('\nClean up test data? (y/n): ', (answer) => {
        rl2.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
    
    if (cleanup) {
      await cleanupTestData();
    } else {
      console.log('\n⚠️  Test data left in databases. Clean up manually:');
      console.log(`   DELETE FROM items WHERE name = '${TEST_ITEM_NAME}';`);
      console.log(`   DELETE FROM accounts WHERE email = '${TEST_ACCOUNT_EMAIL}';`);
    }
    
    process.exit(allPass ? 0 : 1);
    
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  if (!process.env.PROD_DATABASE_URL) {
    console.error('❌ ERROR: PROD_DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  runTest();
}

module.exports = { setupTestData, verifySyncResults, cleanupTestData };

