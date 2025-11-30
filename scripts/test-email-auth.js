/**
 * Test Email Authentication
 * 
 * Tests different authentication methods to find what works
 * Usage: node scripts/test-email-auth.js
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('\n=== Testing Email Authentication Methods ===\n');

const smtpHost = process.env.SMTP_HOST || 'smtpout.secureserver.net';
const smtpPort = parseInt(process.env.SMTP_PORT || '465');
const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465';
const smtpUser = process.env.SMTP_USER; // brian@brianfloyd.me
const smtpPassword = process.env.SMTP_PASSWORD;
const smtpUsername = process.env.SMTP_USERNAME; // Optional: just "brian"

console.log('Current Configuration:');
console.log(`  SMTP_HOST: ${smtpHost}`);
console.log(`  SMTP_PORT: ${smtpPort}`);
console.log(`  SMTP_SECURE: ${smtpSecure}`);
console.log(`  SMTP_USER: ${smtpUser}`);
console.log(`  SMTP_USERNAME: ${smtpUsername || '(not set)'}`);
console.log(`  SMTP_PASSWORD: ${smtpPassword ? '***' : '(not set)'}`);
console.log('');

// Test configurations to try
const testConfigs = [
  {
    name: 'Full email as username',
    auth: {
      user: smtpUser,
      pass: smtpPassword
    }
  },
  {
    name: 'Just username (before @)',
    auth: {
      user: smtpUser ? smtpUser.split('@')[0] : null,
      pass: smtpPassword
    }
  },
  {
    name: 'SMTP_USERNAME env var (if set)',
    auth: {
      user: smtpUsername || smtpUser,
      pass: smtpPassword
    }
  }
];

async function testAuth(config) {
  return new Promise((resolve) => {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: config.auth,
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    transporter.verify((error, success) => {
      if (error) {
        resolve({ success: false, error: error.message, code: error.code });
      } else {
        resolve({ success: true });
      }
    });
  });
}

async function runTests() {
  for (const config of testConfigs) {
    if (!config.auth.user || !config.auth.pass) {
      console.log(`⏭️  Skipping "${config.name}" - missing credentials`);
      continue;
    }

    console.log(`Testing: ${config.name}`);
    console.log(`  Auth User: ${config.auth.user}`);
    
    const result = await testAuth(config);
    
    if (result.success) {
      console.log(`  ✅ SUCCESS! This configuration works.\n`);
      console.log(`\n📝 Add to your .env file:`);
      if (config.auth.user === smtpUser) {
        console.log(`   (Current config should work - may be rate limited)`);
      } else if (config.auth.user === smtpUser.split('@')[0]) {
        console.log(`   SMTP_USERNAME=${config.auth.user}`);
      } else {
        console.log(`   SMTP_USERNAME=${config.auth.user}`);
      }
      break;
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
      if (result.code) {
        console.log(`     Error code: ${result.code}`);
      }
      console.log('');
    }
  }
  
  console.log('\n💡 If all tests fail:');
  console.log('   1. Check if GoDaddy account is locked (too many attempts)');
  console.log('   2. Wait 15-30 minutes and try again');
  console.log('   3. Verify password is correct in .env file');
  console.log('   4. Check GoDaddy email account settings');
  console.log('   5. Contact GoDaddy support if issue persists');
}

runTests();

