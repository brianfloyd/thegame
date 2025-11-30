/**
 * Wrapper script for stable server that restarts on exit
 * This ensures the server on port 3535 restarts automatically when process.exit(0) is called
 */

const { spawn } = require('child_process');
const path = require('path');

let serverProcess = null;

function startServer() {
  console.log('Starting stable server on port 3535...');
  
  serverProcess = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '3535' },
    stdio: 'inherit',
    shell: true
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`Server exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);
    
    // If it was a clean exit (code 0), restart immediately
    if (code === 0) {
      console.log('Restarting server...');
      setTimeout(() => {
        startServer();
      }, 500);
    } else {
      // Non-zero exit code, don't restart (error or manual stop)
      console.log('Server stopped (not restarting due to non-zero exit code)');
      process.exit(code || 1);
    }
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
});

// Start the server
startServer();



