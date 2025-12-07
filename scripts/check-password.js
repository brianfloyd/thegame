/**
 * Check Password Parsing
 * 
 * Verifies how the password is being read from .env file
 * Helps diagnose issues with special characters or whitespace
 */

require('dotenv').config();

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Password Parsing Diagnostic');
console.log('═══════════════════════════════════════════════════════════\n');

const password = process.env.SMTP_PASSWORD;

if (!password) {
  console.log('❌ SMTP_PASSWORD is not set in .env file\n');
  process.exit(1);
}

console.log('📋 Password Analysis:');
console.log('─────────────────────────────────────────────────────────');
console.log(`  Length          : ${password.length} characters`);
console.log(`  First 3 chars   : ${password.substring(0, 3)}`);
console.log(`  Last 3 chars    : ${password.substring(password.length - 3)}`);
console.log(`  Has spaces      : ${password.includes(' ') ? 'YES ⚠️' : 'No'}`);
console.log(`  Has quotes      : ${password.includes('"') || password.includes("'") ? 'YES ⚠️' : 'No'}`);
console.log(`  Has newlines    : ${password.includes('\n') || password.includes('\r') ? 'YES ⚠️' : 'No'}`);
console.log(`  Has tabs        : ${password.includes('\t') ? 'YES ⚠️' : 'No'}`);

// Check for common special characters
const specialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
console.log(`  Has special chars: ${specialChars.test(password) ? 'YES' : 'No'}`);

// Show character codes for first and last few characters
console.log('\n🔍 Character Analysis:');
console.log('─────────────────────────────────────────────────────────');
console.log('  First 5 characters:');
for (let i = 0; i < Math.min(5, password.length); i++) {
  const char = password[i];
  const code = char.charCodeAt(0);
  console.log(`    [${i}] '${char}' (code: ${code})`);
}

console.log('\n  Last 5 characters:');
for (let i = Math.max(0, password.length - 5); i < password.length; i++) {
  const char = password[i];
  const code = char.charCodeAt(0);
  console.log(`    [${i}] '${char}' (code: ${code})`);
}

// Check for common issues
console.log('\n⚠️  Potential Issues:');
console.log('─────────────────────────────────────────────────────────');
let issues = [];

if (password.trim() !== password) {
  issues.push('❌ Password has leading/trailing whitespace');
  console.log('   Fix: Remove spaces before/after password in .env file');
}

if (password.startsWith('"') && password.endsWith('"')) {
  issues.push('⚠️  Password is wrapped in double quotes');
  console.log('   Note: This is OK if password contains spaces or special chars');
}

if (password.startsWith("'") && password.endsWith("'")) {
  issues.push('⚠️  Password is wrapped in single quotes');
  console.log('   Note: This is OK if password contains spaces or special chars');
}

if (password.includes('\n') || password.includes('\r')) {
  issues.push('❌ Password contains newline characters');
  console.log('   Fix: Password should be on a single line in .env file');
}

if (issues.length === 0) {
  console.log('  ✅ No obvious parsing issues detected');
}

console.log('\n💡 .env File Format:');
console.log('─────────────────────────────────────────────────────────');
console.log('  Correct formats:');
console.log('    SMTP_PASSWORD=yourpassword');
console.log('    SMTP_PASSWORD="password with spaces"');
console.log('    SMTP_PASSWORD="password!with@special#chars"');
console.log('\n  Incorrect formats:');
console.log('    SMTP_PASSWORD= yourpassword  (spaces around =)');
console.log('    SMTP_PASSWORD=yourpassword   (trailing space)');
console.log('    SMTP_PASSWORD =yourpassword  (space before =)');

console.log('\n');



























