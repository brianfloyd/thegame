/**
 * Connection Tools - MCP tools for connecting/disconnecting from the game
 */

import { TestSession, getActiveSession, setActiveSession, clearActiveSession } from '../src/TestSession.js';

export const connectionTools = [
  {
    name: 'test_connect',
    description: 'Connect to the game server as a test player. Creates account if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Test account email (default: test@test.com)',
        },
        password: {
          type: 'string',
          description: 'Test account password (default: testpass123)',
        },
        playerId: {
          type: 'number',
          description: 'Player ID to select (optional, will look up name)',
        },
        playerName: {
          type: 'string',
          description: 'Player name to select (optional, alternative to playerId)',
        },
        wsUrl: {
          type: 'string',
          description: 'WebSocket URL (default: ws://localhost:3000)',
        },
        httpUrl: {
          type: 'string',
          description: 'HTTP URL (default: http://localhost:3000)',
        },
      },
    },
  },
  {
    name: 'test_disconnect',
    description: 'Disconnect from the game server and clean up the test session.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'test_get_session_state',
    description: 'Get the current test session state including connection status, player info, and room.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleConnectionTool(name, args) {
  switch (name) {
    case 'test_connect': {
      if (getActiveSession()) {
        return {
          content: [{ type: 'text', text: 'Already connected. Disconnect first with test_disconnect.' }],
        };
      }

      const session = new TestSession({
        testEmail: args.email || 'test@test.com',
        testPassword: args.password || 'testpass123',
        testPlayerId: args.playerId || null,
        testPlayerName: args.playerName || null,
        wsUrl: args.wsUrl,
        httpUrl: args.httpUrl,
      });

      try {
        const state = await session.connect();
        setActiveSession(session);
        return {
          content: [
            {
              type: 'text',
              text: 'Connected successfully.\n' + JSON.stringify(state, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: 'Connection failed: ' + error.message }],
          isError: true,
        };
      }
    }

    case 'test_disconnect': {
      const session = getActiveSession();
      if (!session) {
        return {
          content: [{ type: 'text', text: 'No active session to disconnect.' }],
        };
      }
      clearActiveSession();
      return {
        content: [{ type: 'text', text: 'Disconnected successfully.' }],
      };
    }

    case 'test_get_session_state': {
      const session = getActiveSession();
      if (!session) {
        return {
          content: [{ type: 'text', text: 'No active session.' }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(session.getState(), null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: 'Unknown connection tool: ' + name }],
        isError: true,
      };
  }
}


