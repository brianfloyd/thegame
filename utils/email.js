/**
 * Email Service
 * 
 * Handles sending emails for account verification, password resets, etc.
 * Configured for GoDaddy email hosting (brian@brianfloyd.me)
 */

const nodemailer = require('nodemailer');

// Create reusable transporter
let transporter = null;

function initializeEmailService() {
  // GoDaddy SMTP configuration from environment variables
  // GoDaddy uses smtpout.secureserver.net for outgoing mail
  
  const smtpHost = process.env.SMTP_HOST || 'smtpout.secureserver.net';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465';
  let smtpUser = process.env.SMTP_USER; // Should be brian@brianfloyd.me
  const smtpPassword = process.env.SMTP_PASSWORD;
  
  // If SMTP_USER doesn't contain @, it's likely just the username
  // For GoDaddy, we need the full email for "from" but username for auth
  if (smtpUser && !smtpUser.includes('@')) {
    // If SMTP_USER is just "brian", construct full email
    smtpUser = `${smtpUser}@brianfloyd.me`;
    console.log(`Email service: SMTP_USER was just username, using full email: ${smtpUser}`);
  }
  
  // For GoDaddy, authentication can use either:
  // 1. Just the username (before @) - most common
  // 2. Full email address - sometimes required
  // Use SMTP_USERNAME if provided, otherwise extract from SMTP_USER
  let authUser = process.env.SMTP_USERNAME;
  if (!authUser && smtpUser) {
    // Extract username from email (part before @)
    authUser = smtpUser.split('@')[0];
  }
  
  // Store full email for potential fallback
  const fullEmailForAuth = smtpUser;
  
  if (!smtpUser || !smtpPassword) {
    console.error('❌ Email service: SMTP_USER and SMTP_PASSWORD must be set in .env file');
    console.error('   Email service will NOT be available until these are configured.');
    transporter = null;
    return;
  }
  
  console.log(`Email service: Configuring SMTP for ${smtpUser} on ${smtpHost}:${smtpPort}`);
  console.log(`Email service: Using auth user: ${authUser}`);
  console.log(`Email service: Auth password: ${smtpPassword ? '***' + smtpPassword.slice(-3) : 'NOT SET'}`);
  console.log(`Email service: Secure mode: ${smtpSecure} (${smtpSecure ? 'SSL' : 'STARTTLS'})`);
  
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure, // true for 465 (SSL), false for 587 (TLS/STARTTLS)
    auth: {
      user: authUser, // Try username only if SMTP_USERNAME is set
      pass: smtpPassword
    },
    // GoDaddy sometimes requires these additional options
    tls: {
      rejectUnauthorized: false, // GoDaddy certificates may need this
      ciphers: 'SSLv3' // Some GoDaddy servers require this
    },
    // Connection timeout
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });

  // Verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email service configuration error:', error.message);
      console.error('Error code:', error.code);
      
      // If authentication failed, suggest trying full email
      if (error.code === 'EAUTH' && authUser !== fullEmailForAuth) {
        console.error('\n⚠️  Authentication failed with username. This might mean:');
        console.error('   1. Password is incorrect');
        console.error('   2. GoDaddy requires full email address for authentication');
        console.error(`   Try setting SMTP_USERNAME=${fullEmailForAuth} in your .env file`);
      }
      
      console.error('\nTroubleshooting tips:');
      console.error('1. Verify your GoDaddy email password is correct');
      console.error('2. Try using just the username (before @) in SMTP_USERNAME env var');
      console.error(`3. If that fails, try using full email: SMTP_USERNAME=${fullEmailForAuth}`);
      console.error('4. Try port 587 with SMTP_SECURE=false instead of 465');
      console.error('5. Check if SMTP is enabled in your GoDaddy email account settings');
      console.error('6. Some GoDaddy accounts require enabling "Less Secure Apps" or using app passwords');
      console.error('7. Verify your GoDaddy email account is active and not locked');
      console.error('\nCurrent settings:');
      console.error(`  Host: ${smtpHost}`);
      console.error(`  Port: ${smtpPort}`);
      console.error(`  Secure: ${smtpSecure}`);
      console.error(`  Auth User: ${authUser}`);
      console.error(`  Full Email: ${fullEmailForAuth}`);
      console.error(`  Password: ${smtpPassword ? 'Set (' + smtpPassword.length + ' chars)' : 'NOT SET'}`);
    } else {
      console.log('✅ Email service ready to send messages');
    }
  });
}

/**
 * Send account verification email
 */
async function sendVerificationEmail(email, verificationToken) {
  if (!transporter) {
    console.error('❌ Email service not initialized - cannot send verification email');
    console.error('   Check that SMTP_USER and SMTP_PASSWORD are set in environment variables');
    console.error('   Also verify SMTP authentication succeeded during server startup');
    return { success: false, error: 'Email service not initialized. Please check server configuration and SMTP credentials.' };
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3434';
  const verificationUrl = `${baseUrl}/api/verify-email?token=${verificationToken}`;
  
  const mailOptions = {
    from: `"The Game" <${process.env.SMTP_USER}>`,
    to: email,
    replyTo: process.env.SMTP_USER, // Add reply-to header
    subject: 'Verify Your Account - The Game',
    // Add headers to help with delivery
    headers: {
      'X-Mailer': 'The Game Server',
      'X-Priority': '1',
      'Importance': 'high'
    },
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #00ff00; color: #000; padding: 20px; text-align: center; }
          .content { background: #f4f4f4; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background: #00ff00; color: #000; text-decoration: none; border-radius: 4px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to The Game!</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Thank you for creating an account! Please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0066cc;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create this account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>The Game - Retro MUD Adventure</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Welcome to The Game!
      
      Thank you for creating an account! Please verify your email address by visiting:
      ${verificationUrl}
      
      This link will expire in 24 hours.
      
      If you didn't create this account, you can safely ignore this email.
    `
  };

  try {
    console.log(`\n=== Sending Verification Email ===`);
    console.log(`From: ${mailOptions.from}`);
    console.log(`To: ${mailOptions.to}`);
    console.log(`Subject: ${mailOptions.subject}`);
    console.log(`Verification URL: ${verificationUrl}`);
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`\n=== Email Send Result ===`);
    console.log(`Message ID: ${info.messageId}`);
    console.log(`Response: ${info.response}`);
    console.log(`Accepted recipients:`, info.accepted || []);
    console.log(`Rejected recipients:`, info.rejected || []);
    console.log(`Pending recipients:`, info.pending || []);
    
    // Check if email was actually accepted
    if (info.accepted && info.accepted.length > 0) {
      console.log(`✅ Email accepted by server for: ${info.accepted.join(', ')}`);
    } else {
      console.warn(`⚠️  Warning: No recipients in accepted array`);
    }
    
    if (info.rejected && info.rejected.length > 0) {
      console.error(`❌ Email rejected by server for: ${info.rejected.join(', ')}`);
      return { success: false, error: 'Email was rejected by server' };
    }
    
    // Log full info object for debugging
    console.log(`Full email info:`, JSON.stringify({
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      pending: info.pending,
      responseCode: info.responseCode
    }, null, 2));
    
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('\n❌ Error sending verification email:', error);
    console.error('Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
    
    // Provide specific guidance for authentication errors
    if (error.code === 'EAUTH') {
      console.error('\n⚠️  SMTP Authentication Failed!');
      console.error('   This usually means:');
      console.error('   1. Password is incorrect');
      console.error('   2. Username format is wrong (try full email or just username)');
      console.error('   3. GoDaddy account SMTP is disabled');
      console.error('   4. Account is locked or requires password reset');
      console.error('\n   Try:');
      console.error('   - Verify password in GoDaddy email settings');
      console.error('   - Try setting SMTP_USERNAME to full email address');
      console.error('   - Check GoDaddy email account status');
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, resetToken) {
  if (!transporter) {
    console.error('❌ Email service not initialized - cannot send password reset email');
    console.error('   Check that SMTP_USER and SMTP_PASSWORD are set in environment variables');
    return { success: false, error: 'Email service not initialized. Please check server configuration.' };
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3434';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: `"The Game" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Reset Your Password - The Game',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #00ff00; color: #000; padding: 20px; text-align: center; }
          .content { background: #f4f4f4; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background: #00ff00; color: #000; text-decoration: none; border-radius: 4px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>We received a request to reset your password for your account.</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0066cc;">${resetUrl}</p>
            <div class="warning">
              <strong>Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </div>
          </div>
          <div class="footer">
            <p>The Game - Retro MUD Adventure</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Password Reset Request
      
      We received a request to reset your password. Visit this link to reset it:
      ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request this, please ignore this email.
    `
  };

  try {
    console.log(`\n=== Sending Password Reset Email ===`);
    console.log(`From: ${mailOptions.from}`);
    console.log(`To: ${mailOptions.to}`);
    console.log(`Subject: ${mailOptions.subject}`);
    console.log(`Reset URL: ${resetUrl}`);
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`\n=== Email Send Result ===`);
    console.log(`Message ID: ${info.messageId}`);
    console.log(`Response: ${info.response}`);
    console.log(`Accepted recipients:`, info.accepted || []);
    console.log(`Rejected recipients:`, info.rejected || []);
    console.log(`Pending recipients:`, info.pending || []);
    
    // Check if email was actually accepted
    if (info.accepted && info.accepted.length > 0) {
      console.log(`✅ Email accepted by server for: ${info.accepted.join(', ')}`);
    } else {
      console.warn(`⚠️  Warning: No recipients in accepted array`);
    }
    
    if (info.rejected && info.rejected.length > 0) {
      console.error(`❌ Email rejected by server for: ${info.rejected.join(', ')}`);
      return { success: false, error: 'Email was rejected by server' };
    }
    
    return { success: true, messageId: info.messageId, response: info.response };
  } catch (error) {
    console.error('\n❌ Error sending password reset email:', error);
    console.error('Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
    
    // Provide specific guidance for authentication errors
    if (error.code === 'EAUTH') {
      console.error('\n⚠️  SMTP Authentication Failed!');
      console.error('   This usually means:');
      console.error('   1. Password is incorrect');
      console.error('   2. Username format is wrong (try full email or just username)');
      console.error('   3. GoDaddy account SMTP is disabled');
      console.error('   4. Account is locked or requires password reset');
      console.error('\n   Try:');
      console.error('   - Verify password in GoDaddy email settings');
      console.error('   - Try setting SMTP_USERNAME to full email address');
      console.error('   - Check GoDaddy email account status');
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Check if email service is initialized
 */
function isEmailServiceReady() {
  return transporter !== null;
}

module.exports = {
  initializeEmailService,
  sendVerificationEmail,
  sendPasswordResetEmail,
  isEmailServiceReady
};

