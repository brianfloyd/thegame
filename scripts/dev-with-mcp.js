/**
 * Development script that starts the game server and MCP test server
 * Only starts MCP server when running on port 3434 (not legacy port 3535)
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3434;
const isPort3434 = PORT === 3434 || PORT === '3434';

console.log(`Starting dev server on port ${PORT}...`);
if (isPort3434) {
  console.log('Port 3434 detected - will also start MCP test server');
} else {
  console.log('Legacy port detected - MCP server will not start');
}

// Start the game server with nodemon
const gameServer = spawn('npx', [
  'nodemon',
  '--ext', 'js,json,css,html',
  'server.js'
], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT }
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
  setTimeout(() => {
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
  }, 5000); // Wait 5 seconds before starting to let server stabilize
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


