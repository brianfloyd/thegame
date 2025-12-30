/**
 * Development script that starts the game server and MCP test server
 * Only starts MCP server when running on port 3434 (not legacy port 3535)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isZorkEnabled } = require('../utils/zorkFlag');

const PORT = process.env.PORT || 3434;
const isPort3434 = PORT === 3434 || PORT === '3434';

console.log(`Starting dev server on port ${PORT}...`);
if (isPort3434) {
  console.log('Port 3434 detected - will also start MCP test server');
} else {
  console.log('Legacy port detected - MCP server will not start');
}

// Start the game server with nodemon
// Use 'pipe' instead of 'inherit' so we can monitor output for restart messages
const gameServer = spawn('npx', [
  'nodemon',
  '--ext', 'js,json,css,html',
  'server.js'
], {
  stdio: ['inherit', 'pipe', 'pipe'], // stdin: inherit, stdout/stderr: pipe
  shell: true,
  env: { ...process.env, PORT }
});

// Monitor nodemon output for restart messages
let serverRestarting = false;
gameServer.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output); // Forward to console
  
  // Detect nodemon restart messages
  if (output.includes('[nodemon] restarting') || output.includes('restarting due to changes')) {
    serverRestarting = true;
    console.log('[dev-with-mcp] Detected nodemon restart - will restart ZORK after server is ready');
  }
  
  // Detect when server is ready (listening on port)
  if (output.includes('Server running on') || output.includes(`http://`) || output.includes(`:${PORT}`)) {
    if (serverRestarting) {
      serverRestarting = false;
      // Server is back up, restart ZORK after a delay (if enabled)
      setTimeout(() => {
        if (isPort3434) {
          // Only restart if ZORK is enabled
          if (isZorkEnabled()) {
            if (autoFollow) {
              console.log('[dev-with-mcp] Server restarted, restarting ZORK...');
              try {
                autoFollow.kill('SIGTERM');
              } catch (e) {
                // Ignore
              }
              autoFollow = null;
            }
            startZork();
          } else {
            // ZORK is disabled, kill any existing process
            if (autoFollow) {
              try {
                autoFollow.kill('SIGTERM');
              } catch (e) {
                // Ignore
              }
              autoFollow = null;
            }
          }
        }
      }, 3000); // Wait 3 seconds after server is ready
    }
  }
});

gameServer.stderr.on('data', (data) => {
  const output = data.toString();
  process.stderr.write(output); // Forward to console
});

gameServer.on('error', (error) => {
  console.error('Failed to start game server:', error);
  process.exit(1);
});

// Track processes
let mcpServer = null;
let autoFollow = null;

// Start MCP server if on port 3434
if (isPort3434) {
  const mcpPath = path.join(__dirname, '..', 'mcp-test-server');
  
  mcpServer = spawn('npx', [
    'nodemon',
    '--ext', 'js,json',
    'index.js'
  ], {
    cwd: mcpPath,
    stdio: 'inherit',
    shell: true
  });

  mcpServer.on('error', (error) => {
    console.error('Failed to start MCP server:', error);
    // Don't exit - game server can still run
  });

  mcpServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`MCP server exited with code ${code}`);
    }
  });

  // Start ZORK AI Agent after a delay (to let server stabilize)
  // Also restart ZORK when game server restarts (nodemon)
  let zorkStartTimeout = null;
  
  function startZork() {
    // Check if ZORK is enabled before starting
    if (!isZorkEnabled()) {
      console.log('[dev-with-mcp] ZORK is disabled. Not starting. Use /zork command in-game to enable.');
      return;
    }
    
    if (autoFollow) {
      // Kill existing ZORK process if it exists
      try {
        autoFollow.kill();
      } catch (e) {
        // Ignore errors
      }
      autoFollow = null;
    }
    
    if (zorkStartTimeout) {
      clearTimeout(zorkStartTimeout);
    }
    
    zorkStartTimeout = setTimeout(() => {
      console.log('Starting ZORK THE AI LORD...');
      const zorkAgentScript = path.join(__dirname, 'zork-ai-agent.cjs');
      autoFollow = spawn('node', [zorkAgentScript], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PORT },
        detached: false // Don't detach, so it can be killed with the parent
      });

      autoFollow.on('error', (error) => {
        console.error('Failed to start ZORK AI Agent:', error);
        // Don't exit - other services can still run
      });

      autoFollow.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`ZORK AI Agent exited with code ${code}`);
        }
        autoFollow = null; // Clear reference
      });
    }, 8000); // Wait 8 seconds before starting to let server fully stabilize
  }
  
  // Initial start
  startZork();
  
  // Watch for flag file changes to start/stop ZORK dynamically
  const flagFile = path.join(__dirname, '..', '.zork-enabled');
  let lastFlagState = isZorkEnabled();
  
  // Check flag file every 2 seconds
  setInterval(() => {
    const currentFlagState = isZorkEnabled();
    if (currentFlagState !== lastFlagState) {
      lastFlagState = currentFlagState;
      if (currentFlagState) {
        // Flag was enabled - start ZORK if not already running
        console.log('[dev-with-mcp] ZORK flag enabled - starting ZORK...');
        if (!autoFollow) {
          startZork();
        }
      } else {
        // Flag was disabled - stop ZORK if running
        console.log('[dev-with-mcp] ZORK flag disabled - stopping ZORK...');
        if (autoFollow) {
          try {
            autoFollow.kill('SIGTERM');
          } catch (e) {
            // Ignore errors
          }
          autoFollow = null;
        }
      }
    }
  }, 2000); // Check every 2 seconds
  
  // Note: Restart detection is now handled via stdout monitoring above
  // This is more reliable than SIGUSR2 which doesn't propagate to parent process
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down servers...');
  gameServer.kill();
  if (mcpServer) {
    mcpServer.kill();
  }
  if (autoFollow) {
    autoFollow.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  gameServer.kill();
  if (mcpServer) {
    mcpServer.kill();
  }
  if (autoFollow) {
    autoFollow.kill();
  }
  process.exit(0);
});

gameServer.on('exit', (code) => {
  if (mcpServer) {
    mcpServer.kill();
  }
  if (autoFollow) {
    autoFollow.kill();
  }
  process.exit(code || 0);
});



