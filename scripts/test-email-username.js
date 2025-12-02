/**
 * Test Email with Username-Only Authentication
 * 
 * Tests if GoDaddy SMTP works with just username (brian) instead of full email
 * Usage: node scripts/test-email-username.js
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const recipientEmail = process.argv[2] || process.env.TEST_EMAIL || 'brian@brianfloyd.me';

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Testing Username-Only Authentication');
console.log('═══════════════════════════════════════════════════════════\n');

// Extract username from email
const smtpUser = process.env.SMTP_USER || 'brian@brianfloyd.me';
const usernameOnly = smtpUser.includes('@') ? smtpUser.split('@')[0] : smtpUser;
const fullEmail = smtpUser.includes('@') ? smtpUser : `${smtpUser}@brianfloyd.me`;

console.log('📋 Configuration:');
console.log('─────────────────────────────────────────────────────────');
console.log(`  SMTP_HOST     : ${process.env.SMTP_HOST || 'smtpout.secureserver.net'}`);
console.log(`  SMTP_PORT     : ${process.env.SMTP_PORT || '587'}`);
console.log(`  SMTP_SECURE   : ${process.env.SMTP_SECURE || 'false'}`);
console.log(`  Full Email    : ${fullEmail}`);
console.log(`  Username Only : ${usernameOnly}`);
console.log(`  Password      : ${process.env.SMTP_PASSWORD ? 'Set (' + process.env.SMTP_PASSWORD.length + ' chars)' : 'NOT SET'}`);
console.log(`  Password ends : ${process.env.SMTP_PASSWORD ? '...' + process.env.SMTP_PASSWORD.slice(-3) : 'N/A'}`);
console.log('');

// Test configurations
const testConfigs = [
  {
    name: 'Username Only (brian) - Port 587',
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: 587,
    secure: false,
    authUser: usernameOnly
  },
  {
    name: 'Full Email (brian@brianfloyd.me) - Port 587',
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: 587,
    secure: false,
    authUser: fullEmail
  },
  {
    name: 'Username Only (brian) - Port 465',
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    authUser: usernameOnly
  },
  {
    name: 'Full Email (brian@brianfloyd.me) - Port 465',
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    authUser: fullEmail
  }
];

async function testConfig(config, index) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Test ${index + 1}/${testConfigs.length}: ${config.name}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Host      : ${config.host}`);
    console.log(`  Port      : ${config.port}`);
    console.log(`  Secure    : ${config.secure} (${config.secure ? 'SSL' : 'STARTTLS'})`);
    console.log(`  Auth User : ${config.authUser}`);
    console.log('');

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.authUser,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000
    });

    console.log('🔍 Testing connection...');
    transporter.verify((error, success) => {
      if (error) {
        console.log(`❌ Failed`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Code: ${error.code}`);
        if (error.response) {
          console.log(`   Response: ${error.response}`);
        }
        resolve({ success: false, config, error });
      } else {
        console.log(`✅ Connection Successful!`);
        console.log(`\n📧 Attempting to send test email...`);
        
        const mailOptions = {
          from: `"The Game Test" <${fullEmail}>`,
          to: recipientEmail,
          subject: `Test Email - ${config.name} - ${new Date().toLocaleTimeString()}`,
          text: `This is a test email using ${config.name}.\n\nIf you receive this, authentication is working!\n\nSent at: ${new Date().toISOString()}`,
          html: `<h2>Test Email - ${config.name}</h2><p>If you receive this, authentication is working!</p><p>Sent at: ${new Date().toISOString()}</p>`
        };

        transporter.sendMail(mailOptions, (sendError, info) => {
          if (sendError) {
            console.log(`❌ Failed to send email`);
            console.log(`   Error: ${sendError.message}`);
            resolve({ success: false, config, error: sendError, verified: true });
          } else {
            console.log(`✅ Email sent successfully!`);
            console.log(`   Message ID: ${info.messageId}`);
            console.log(`   Response: ${info.response}`);
            if (info.accepted && info.accepted.length > 0) {
              console.log(`   ✅ Accepted: ${info.accepted.join(', ')}`);
            }
            resolve({ success: true, config, info });
          }
        });
      }
    });
  });
}

async function runTests() {
  if (!process.env.SMTP_PASSWORD) {
    console.log('❌ FATAL: SMTP_PASSWORD is not set in .env file\n');
    process.exit(1);
  }

  console.log('🧪 Testing different authentication methods...\n');

  for (let i = 0; i < testConfigs.length; i++) {
    const result = await testConfig(testConfigs[i], i);
    
    if (result.success) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`✅ SUCCESS! Working configuration found:`);
      console.log(`${'═'.repeat(60)}`);
      console.log(`  Name      : ${result.config.name}`);
      console.log(`  Host      : ${result.config.host}`);
      console.log(`  Port      : ${result.config.port}`);
      console.log(`  Secure    : ${result.config.secure}`);
      console.log(`  Auth User : ${result.config.authUser}`);
      console.log(`\n💡 Update your .env file:`);
      console.log(`   SMTP_PORT=${result.config.port}`);
      console.log(`   SMTP_SECURE=${result.config.secure}`);
      console.log(`   SMTP_USERNAME=${result.config.authUser}`);
      console.log(`\n📧 Check your inbox at: ${recipientEmail}\n`);
      process.exit(0);
    }
    
    // Wait a bit between tests to avoid rate limiting
    if (i < testConfigs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`❌ All tests failed`);
  console.log(`${'═'.repeat(60)}`);
  console.log('\n🔍 Troubleshooting:');
  console.log('─────────────────────────────────────────────────────────');
  console.log('1. Verify password is correct in GoDaddy webmail');
  console.log('2. Check if GoDaddy account is locked (too many failed attempts)');
  console.log('3. Wait 15-30 minutes if account was temporarily locked');
  console.log('4. Check GoDaddy Email & Office Dashboard → Email Client Settings');
  console.log('5. Verify SMTP is enabled for your account');
  console.log('6. Try resetting your GoDaddy email password');
  console.log('7. Check if password has special characters that need quoting in .env');
  console.log('   (e.g., SMTP_PASSWORD="password!with@special#chars")\n');
  process.exit(1);
}

runTests();





