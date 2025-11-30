/**
 * Test Email Script
 * 
 * Standalone script to test email sending without running the full server
 * Usage: node scripts/test-email.js <recipient-email>
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const recipientEmail = process.argv[2] || process.env.TEST_EMAIL || 'brian@brianfloyd.me';

console.log('\n=== Email Test Script ===\n');
console.log('Configuration:');
console.log(`  SMTP Host: ${process.env.SMTP_HOST || 'smtpout.secureserver.net'}`);
console.log(`  SMTP Port: ${process.env.SMTP_PORT || '587'}`);
console.log(`  SMTP User: ${process.env.SMTP_USER || 'brian@brianfloyd.me'}`);
console.log(`  SMTP Username (auth): ${process.env.SMTP_USERNAME || process.env.SMTP_USER || 'brian@brianfloyd.me'}`);
console.log(`  From: ${process.env.SMTP_USER}`);
console.log(`  To: ${recipientEmail}`);
console.log('');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USERNAME || process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3'
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

// Test connection first
console.log('Testing SMTP connection...');
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Connection Failed:', error.message);
    console.error('Error code:', error.code);
    process.exit(1);
  } else {
    console.log('✅ SMTP Connection Successful\n');
    
    // Send test email
    const mailOptions = {
      from: `"The Game Test" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      replyTo: process.env.SMTP_USER,
      subject: 'Test Email from The Game',
      headers: {
        'X-Mailer': 'The Game Test Script',
        'X-Priority': '1',
        'Importance': 'high'
      },
      text: `This is a test email sent from The Game server.
      
If you receive this, email sending is working correctly.

Sent at: ${new Date().toISOString()}
From: ${process.env.SMTP_USER}
To: ${recipientEmail}`,
      html: `
        <h1>Test Email from The Game</h1>
        <p>This is a test email sent from The Game server.</p>
        <p>If you receive this, email sending is working correctly.</p>
        <hr>
        <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
        <p><strong>From:</strong> ${process.env.SMTP_USER}</p>
        <p><strong>To:</strong> ${recipientEmail}</p>
      `
    };
    
    console.log('Sending test email...');
    console.log('\nEmail details:');
    console.log('  From:', mailOptions.from);
    console.log('  To:', mailOptions.to);
    console.log('  Subject:', mailOptions.subject);
    console.log('  Headers:', JSON.stringify(mailOptions.headers, null, 2));
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('\n❌ Failed to send email:', error.message);
        console.error('Error code:', error.code);
        console.error('Error response:', error.response);
        console.error('Full error:', error);
        process.exit(1);
      } else {
        console.log('\n✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        console.log('Response Code:', info.responseCode);
        console.log('Accepted:', info.accepted || []);
        console.log('Rejected:', info.rejected || []);
        console.log('Pending:', info.pending || []);
        console.log('\nFull info object:', JSON.stringify(info, null, 2));
        
        // Try to get more details
        console.log('\n=== Email Delivery Status ===');
        if (info.accepted && info.accepted.length > 0) {
          console.log('✅ Server accepted email for delivery to:', info.accepted.join(', '));
          console.log('⚠️  Note: "Accepted" means the server queued it, not that it was delivered.');
          console.log('   The email may still be in transit or filtered by the recipient server.');
        }
        
        console.log('\n📧 Check your inbox (and spam folder) at:', recipientEmail);
        console.log('\nTroubleshooting:');
        console.log('1. Check spam/junk folder');
        console.log('2. Wait 5-15 minutes (GoDaddy may queue emails)');
        console.log('3. Check GoDaddy email account settings and sent items');
        console.log('4. Verify the recipient email address is correct');
        console.log('5. Try sending to a different email provider (Outlook, Yahoo)');
        console.log('6. Check if GoDaddy has any delivery restrictions or rate limits');
        
        process.exit(0);
      }
    });
  }
});

