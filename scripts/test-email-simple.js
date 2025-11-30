/**
 * Simple Email Test Script
 * 
 * Sends a very simple plain text email to test if the issue is with HTML formatting
 * Usage: node scripts/test-email-simple.js <recipient-email>
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const recipientEmail = process.argv[2] || 'behrtrainer@gmail.com';

console.log('\n=== Simple Email Test (Plain Text Only) ===\n');

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
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  debug: true, // Enable debug output
  logger: true // Enable logging
});

// Test connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Connection Failed:', error.message);
    process.exit(1);
  } else {
    console.log('✅ SMTP Connection Successful\n');
    
    // Send VERY simple email - plain text only, minimal headers
    const mailOptions = {
      from: process.env.SMTP_USER, // No display name, just email
      to: recipientEmail,
      subject: 'Simple Test Email',
      text: `This is a simple test email.

If you receive this, basic email sending is working.

Sent at: ${new Date().toISOString()}
From: ${process.env.SMTP_USER}
To: ${recipientEmail}`
      // NO HTML, NO extra headers, NO reply-to
    };
    
    console.log('Sending simple plain text email...');
    console.log('From:', mailOptions.from);
    console.log('To:', mailOptions.to);
    console.log('Subject:', mailOptions.subject);
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('\n❌ Failed to send email:', error.message);
        console.error('Full error:', error);
        process.exit(1);
      } else {
        console.log('\n✅ Email sent!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        console.log('Accepted:', info.accepted || []);
        console.log('\n📧 Check inbox at:', recipientEmail);
        console.log('\nIf this simple email arrives but HTML emails don\'t,');
        console.log('the issue is likely with HTML formatting or email content.');
        process.exit(0);
      }
    });
  }
});

