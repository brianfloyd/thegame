#!/usr/bin/env node
/**
 * MCP Test Server for The Game
 * 
 * Provides tools for automated game testing through the Model Context Protocol.
 * Allows AI assistants to connect to the game, execute commands, verify state,
 * and run comprehensive test suites.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool modules
import { connectionTools, handleConnectionTool } from './tools/connection.js';
import { commandTools, handleCommandTool } from './tools/commands.js';
import { verificationTools, handleVerificationTool } from './tools/verification.js';
import { setupTools, handleSetupTool } from './tools/setup.js';
import { sqlTools, handleSqlTool } from './tools/sql.js';

// Create server instance
const server = new Server(
  {
    name: 'game-test-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Combine all tools
const allTools = [
  ...connectionTools,
  ...commandTools,
  ...verificationTools,
  ...setupTools,
  ...sqlTools,
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Route to appropriate handler based on tool name prefix
    if (name.startsWith('test_connect') || name.startsWith('test_disconnect') || name === 'test_get_session_state') {
      return await handleConnectionTool(name, args);
    }
    
    if (name.startsWith('test_send') || name.startsWith('test_wait') || name === 'test_get_message_history') {
      return await handleCommandTool(name, args);
    }
    
    if (name.startsWith('test_verify')) {
      return await handleVerificationTool(name, args);
    }
    
    if (name.startsWith('test_setup') || name === 'test_cleanup') {
      return await handleSetupTool(name, args);
    }
    
    if (name.startsWith('sql_')) {
      return await handleSqlTool(name, args);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Game Test MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});




