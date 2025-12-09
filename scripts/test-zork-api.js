/**
 * Test script to diagnose ZORK API issues
 * Run with: node scripts/test-zork-api.js
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

async function testAPI() {
  console.log('='.repeat(60));
  console.log('ZORK API Diagnostic Test');
  console.log('='.repeat(60));
  
  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: ANTHROPIC_API_KEY not set in .env file!');
    process.exit(1);
  }
  console.log(`✅ API Key: SET (${apiKey.substring(0, 10)}...)`);
  
  // Initialize Anthropic client
  let anthropic;
  try {
    anthropic = new Anthropic({
      apiKey: apiKey,
    });
    console.log('✅ Anthropic client initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Anthropic client:', error.message);
    process.exit(1);
  }
  
  // Test API call
  console.log('\n📡 Testing API call...');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Say "Hello, I am ZORK" if you can hear me.'
        }
      ],
    });
    
    const aiResponse = response.content[0].text;
    console.log('✅ API call successful!');
    console.log(`📝 Response: ${aiResponse}`);
    console.log('\n✅ ZORK API is working correctly!');
    
  } catch (error) {
    console.error('\n❌ API call failed!');
    console.error('Error message:', error.message);
    console.error('Error details:', {
      name: error.name,
      status: error.status,
      statusCode: error.status_code,
      type: error.type,
      code: error.code,
      error: error.error
    });
    
    if (error.status_code === 401 || error.status === 401) {
      console.error('\n🔑 Issue: Invalid or missing API key');
      console.error('   Solution: Check your ANTHROPIC_API_KEY in .env file');
    } else if (error.status_code === 429 || error.status === 429) {
      console.error('\n⏱️  Issue: Rate limit exceeded');
      console.error('   Solution: Wait a moment and try again');
    } else if (error.status_code === 402 || error.status === 402 || error.message?.includes('insufficient') || error.message?.includes('credit balance') || error.message?.includes('too low')) {
      console.error('\n💳 Issue: Payment required or insufficient credits');
      console.error('   Solution: Go to https://console.anthropic.com/settings/billing to add credits');
      console.error('   Error message:', error.error?.error?.message || error.message);
    } else if (error.message?.includes('ECONNREFUSED') || error.message?.includes('network')) {
      console.error('\n🌐 Issue: Network connectivity problem');
      console.error('   Solution: Check your internet connection');
    } else {
      console.error('\n❓ Unknown error - check error details above');
    }
    
    process.exit(1);
  }
}

testAPI().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

