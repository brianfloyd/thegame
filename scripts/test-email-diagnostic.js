/**
 * Comprehensive Email Diagnostic and Test Script
 * 
 * Tests GoDaddy SMTP connection with multiple configurations
 * Provides detailed diagnostics to identify connection issues
 * 
 * Usage: node scripts/test-email-diagnostic.js [recipient-email]
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const recipientEmail = process.argv[2] || process.env.TEST_EMAIL || 'brian@brianfloyd.me';

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  GoDaddy Email Diagnostic & Test Script');
console.log('═══════════════════════════════════════════════════════════\n');

// Display current configuration
console.log('📋 Current Configuration:');
console.log('─────────────────────────────────────────────────────────');
const config = {
  SMTP_HOST: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  SMTP_PORT: process.env.SMTP_PORT || '587',
  SMTP_SECURE: process.env.SMTP_SECURE || 'false',
  SMTP_USER: process.env.SMTP_USER || 'brian@brianfloyd.me',
  SMTP_USERNAME: process.env.SMTP_USERNAME || '(not set)',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD ? '***' + process.env.SMTP_PASSWORD.slice(-3) : '(not set)',
  BASE_URL: process.env.BASE_URL || 'http://localhost:3434'
};

Object.entries(config).forEach(([key, value]) => {
  console.log(`  ${key.padEnd(20)} : ${value}`);
});

console.log('\n⚠️  Configuration Issues Found:');
console.log('─────────────────────────────────────────────────────────');
let issues = [];

if (!process.env.SMTP_PASSWORD) {
  issues.push('❌ SMTP_PASSWORD is not set in .env file');
}

if (!process.env.SMTP_USER || !process.env.SMTP_USER.includes('@')) {
  issues.push('⚠️  SMTP_USER should be full email address (brian@brianfloyd.me)');
}

const port = parseInt(config.SMTP_PORT);
const secure = config.SMTP_SECURE === 'true' || config.SMTP_SECURE === '1';

if (port === 465 && !secure) {
  issues.push('⚠️  Port 465 requires SMTP_SECURE=true (SSL)');
}

if (port === 587 && secure) {
  issues.push('⚠️  Port 587 should use SMTP_SECURE=false (STARTTLS)');
}

if (!process.env.SMTP_USERNAME && process.env.SMTP_USER) {
  const username = process.env.SMTP_USER.split('@')[0];
  issues.push(`💡 Tip: Add SMTP_USERNAME=${username} for better GoDaddy compatibility`);
}

if (issues.length === 0) {
  console.log('  ✅ No obvious configuration issues detected');
} else {
  issues.forEach(issue => console.log(`  ${issue}`));
}

console.log('\n');

// Determine auth username
let authUser = process.env.SMTP_USERNAME;
if (!authUser && process.env.SMTP_USER) {
  authUser = process.env.SMTP_USER.includes('@') 
    ? process.env.SMTP_USER.split('@')[0] 
    : process.env.SMTP_USER;
}

console.log('🔐 Authentication Details:');
console.log('─────────────────────────────────────────────────────────');
console.log(`  Auth Username  : ${authUser || '(will use SMTP_USER)'}`);
console.log(`  Auth Password  : ${process.env.SMTP_PASSWORD ? 'Set ✓' : 'NOT SET ✗'}`);
console.log(`  From Address   : ${config.SMTP_USER}`);
console.log(`  To Address     : ${recipientEmail}`);
console.log('\n');

// Test configurations to try
const testConfigs = [
  {
    name: 'Primary Configuration (Current)',
    host: config.SMTP_HOST,
    port: parseInt(config.SMTP_PORT),
    secure: secure,
    authUser: authUser || config.SMTP_USER
  },
  {
    name: 'Port 587 with STARTTLS (Recommended)',
    host: 'smtpout.secureserver.net',
    port: 587,
    secure: false,
    authUser: authUser || config.SMTP_USER.split('@')[0] || 'brian'
  },
  {
    name: 'Port 465 with SSL',
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    authUser: authUser || config.SMTP_USER.split('@')[0] || 'brian'
  },
  {
    name: 'Alternative Server (smtp.secureserver.net)',
    host: 'smtp.secureserver.net',
    port: 587,
    secure: false,
    authUser: authUser || config.SMTP_USER.split('@')[0] || 'brian'
  }
];

async function testConnection(configObj, index) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Test ${index + 1}/${testConfigs.length}: ${configObj.name}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Host  : ${configObj.host}`);
    console.log(`  Port  : ${configObj.port}`);
    console.log(`  Secure: ${configObj.secure} (${configObj.secure ? 'SSL' : 'STARTTLS'})`);
    console.log(`  Auth  : ${configObj.authUser}`);
    console.log('');

    const transporter = nodemailer.createTransport({
      host: configObj.host,
      port: configObj.port,
      secure: configObj.secure,
      auth: {
        user: configObj.authUser,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
      debug: false,
      logger: false
    });

    console.log('🔍 Testing SMTP connection...');
    transporter.verify((error, success) => {
      if (error) {
        console.log(`❌ Connection Failed`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Code: ${error.code || 'N/A'}`);
        if (error.command) {
          console.log(`   Command: ${error.command}`);
        }
        if (error.response) {
          console.log(`   Response: ${error.response}`);
        }
        resolve({ success: false, config: configObj, error });
      } else {
        console.log(`✅ Connection Successful!`);
        console.log(`   Server is ready to accept emails`);
        resolve({ success: true, config: configObj, transporter });
      }
    });
  });
}

async function sendTestEmail(transporter, configObj) {
  return new Promise((resolve) => {
    console.log('\n📧 Sending test email...');
    
    const mailOptions = {
      from: `"The Game Test" <${config.SMTP_USER}>`,
      to: recipientEmail,
      replyTo: config.SMTP_USER,
      subject: `Test Email - ${configObj.name} - ${new Date().toLocaleTimeString()}`,
      text: `This is a test email from The Game diagnostic script.

Configuration used:
- Host: ${configObj.host}
- Port: ${configObj.port}
- Secure: ${configObj.secure}
- Auth User: ${configObj.authUser}

If you receive this, email sending is working correctly!

Sent at: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00ff00; background: #000; padding: 20px; text-align: center;">
            ✅ Test Email Successful
          </h2>
          <div style="padding: 20px; background: #f4f4f4;">
            <p>This is a test email from The Game diagnostic script.</p>
            <h3>Configuration Used:</h3>
            <ul>
              <li><strong>Host:</strong> ${configObj.host}</li>
              <li><strong>Port:</strong> ${configObj.port}</li>
              <li><strong>Secure:</strong> ${configObj.secure}</li>
              <li><strong>Auth User:</strong> ${configObj.authUser}</li>
            </ul>
            <p><strong>If you receive this, email sending is working correctly!</strong></p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              Sent at: ${new Date().toISOString()}
            </p>
          </div>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(`❌ Failed to send email`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Code: ${error.code || 'N/A'}`);
        if (error.response) {
          console.log(`   Response: ${error.response}`);
        }
        resolve({ success: false, error });
      } else {
        console.log(`✅ Email sent successfully!`);
        console.log(`   Message ID: ${info.messageId}`);
        console.log(`   Response: ${info.response}`);
        if (info.accepted && info.accepted.length > 0) {
          console.log(`   ✅ Accepted recipients: ${info.accepted.join(', ')}`);
        }
        if (info.rejected && info.rejected.length > 0) {
          console.log(`   ❌ Rejected recipients: ${info.rejected.join(', ')}`);
        }
        resolve({ success: true, info });
      }
    });
  });
}

async function runDiagnostics() {
  if (!process.env.SMTP_PASSWORD) {
    console.log('❌ FATAL: SMTP_PASSWORD is not set in .env file');
    console.log('\nPlease add SMTP_PASSWORD=your_password to your .env file\n');
    process.exit(1);
  }

  console.log('🧪 Running connection tests...\n');

  // Test all configurations
  const results = [];
  for (let i = 0; i < testConfigs.length; i++) {
    const result = await testConnection(testConfigs[i], i);
    results.push(result);
    
    // If connection successful, try sending email
    if (result.success && result.transporter) {
      const emailResult = await sendTestEmail(result.transporter, result.config);
      result.emailResult = emailResult;
      
      // If email sent successfully, stop testing (we found working config)
      if (emailResult.success) {
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('  ✅ SUCCESS! Found working configuration!');
        console.log('═══════════════════════════════════════════════════════════\n');
        
        console.log('📝 Recommended .env settings:');
        console.log('─────────────────────────────────────────────────────────');
        console.log(`SMTP_HOST=${result.config.host}`);
        console.log(`SMTP_PORT=${result.config.port}`);
        console.log(`SMTP_SECURE=${result.config.secure}`);
        console.log(`SMTP_USER=${config.SMTP_USER}`);
        if (result.config.authUser !== config.SMTP_USER) {
          console.log(`SMTP_USERNAME=${result.config.authUser}`);
        }
        console.log(`SMTP_PASSWORD=your_password`);
        console.log('\n');
        
        console.log('📧 Next Steps:');
        console.log('─────────────────────────────────────────────────────────');
        console.log(`1. Check your inbox at: ${recipientEmail}`);
        console.log('2. Check spam/junk folder');
        console.log('3. Update your .env file with the settings above');
        console.log('4. Restart your server');
        console.log('\n');
        
        process.exit(0);
      }
    }
    
    // Wait a bit between tests
    if (i < testConfigs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // If we get here, no configuration worked
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ❌ All connection tests failed');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('🔍 Troubleshooting Steps:');
  console.log('─────────────────────────────────────────────────────────');
  console.log('1. Verify your GoDaddy email password is correct');
  console.log('2. Log into GoDaddy webmail to confirm password works');
  console.log('3. Check GoDaddy Email & Office Dashboard:');
  console.log('   - Settings → Email Client Settings');
  console.log('   - Ensure SMTP is enabled');
  console.log('   - Note the SMTP settings shown there');
  console.log('4. Try using just username (before @) in SMTP_USERNAME');
  console.log('5. Contact GoDaddy support to verify SMTP access');
  console.log('6. Check if your network/firewall blocks SMTP ports');
  console.log('\n');
  
  console.log('📋 Error Summary:');
  console.log('─────────────────────────────────────────────────────────');
  results.forEach((result, i) => {
    if (!result.success) {
      console.log(`\nTest ${i + 1} (${result.config.name}):`);
      console.log(`  Error: ${result.error.message}`);
      console.log(`  Code: ${result.error.code || 'N/A'}`);
    }
  });
  console.log('\n');
}

// Run diagnostics
runDiagnostics().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});











