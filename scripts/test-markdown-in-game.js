/**
 * Test markdown parsing in-game using ZORK
 * This script connects as a test player and asks ZORK to send a formatted message
 */

const WebSocket = require('ws');
require('dotenv').config();

const WS_URL = process.env.GAME_WS_URL || 'ws://localhost:3434';
const TEST_PLAYER = 'test_markdown_user';
const TEST_PASSWORD = 'testpass123';

async function testMarkdownInGame() {
  console.log('='.repeat(60));
  console.log('Testing Markdown Parsing In-Game');
  console.log('='.repeat(60));
  
  let ws = null;
  let authenticated = false;
  
  try {
    // Connect to server
    console.log('\n1. Connecting to game server...');
    ws = new WebSocket(WS_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('✓ Connected');
        resolve();
      });
      
      ws.on('error', (error) => {
        console.error('✗ Connection error:', error.message);
        reject(error);
      });
    });
    
    // Authenticate
    console.log('\n2. Authenticating...');
    ws.send(JSON.stringify({
      type: 'authenticateSession',
      email: `${TEST_PLAYER}@test.com`,
      password: TEST_PASSWORD
    }));
    
    // Wait for authentication
    await new Promise((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'authenticated') {
          console.log('✓ Authenticated');
          authenticated = true;
          resolve();
        } else if (message.type === 'error' && message.message?.includes('not found')) {
          // Need to create account first
          console.log('Account not found, creating...');
          ws.send(JSON.stringify({
            type: 'register',
            email: `${TEST_PLAYER}@test.com`,
            password: TEST_PASSWORD,
            playerName: TEST_PLAYER
          }));
        } else if (message.type === 'registered') {
          console.log('✓ Account created, authenticating...');
          ws.send(JSON.stringify({
            type: 'authenticateSession',
            email: `${TEST_PLAYER}@test.com`,
            password: TEST_PASSWORD
          }));
        }
      });
      
      setTimeout(() => {
        if (!authenticated) {
          console.log('⚠️  Authentication timeout');
          resolve();
        }
      }, 5000);
    });
    
    if (!authenticated) {
      throw new Error('Failed to authenticate');
    }
    
    // Send test message to ZORK
    console.log('\n3. Sending test message to ZORK...');
    const testMessage = 'zork please send me a test message with markdown formatting: a bulleted list with bold items, line breaks, and proper formatting';
    
    ws.send(JSON.stringify({
      type: 'talk',
      message: testMessage
    }));
    
    console.log(`Sent: "${testMessage}"`);
    console.log('\n4. Waiting for ZORK response...');
    console.log('='.repeat(60));
    
    // Listen for responses
    let responseReceived = false;
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        console.log('\n⚠️  Timeout waiting for response');
        ws.close();
        process.exit(0);
      }
    }, 30000);
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'talked' && message.playerName?.includes('ZORK')) {
          responseReceived = true;
          clearTimeout(timeout);
          
          console.log('\n📨 ZORK Response Received:');
          console.log('-'.repeat(60));
          console.log('Raw message:');
          console.log(message.message);
          console.log('\n' + '='.repeat(60));
          console.log('\n✅ Test complete! Check the game UI to see if formatting is correct.');
          console.log('Look for:');
          console.log('  - Proper line breaks');
          console.log('  - Bulleted lists (not literal "brbr" or "lilistrong")');
          console.log('  - Bold text (not literal "/strong")');
          console.log('  - Proper HTML rendering');
          console.log('\n' + '='.repeat(60));
          
          setTimeout(() => {
            ws.close();
            process.exit(0);
          }, 2000);
        } else if (message.type === 'roomUpdate') {
          console.log('Room update received');
        } else if (message.type === 'error') {
          console.error('Error:', message.message);
        }
      } catch (error) {
        // Ignore parse errors
      }
    });
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (ws) ws.close();
    process.exit(1);
  }
}

// Run test
testMarkdownInGame().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


