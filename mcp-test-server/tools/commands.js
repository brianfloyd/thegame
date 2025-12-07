/**
 * Command Tools - MCP tools for sending game commands and waiting for messages
 */

import { getActiveSession } from '../src/TestSession.js';

export const commandTools = [
  {
    name: 'test_send_command',
    description: 'Send a game command (harvest, attune, move, look, inventory, take, drop, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command type (harvest, attune, move, look, inventory, take, drop, talk, etc.)',
        },
        target: {
          type: 'string',
          description: 'Target for the command (NPC name, item name, direction, etc.)',
        },
        data: {
          type: 'object',
          description: 'Additional command data as JSON object',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'test_wait_for_message',
    description: 'Wait for a specific message type from the server',
    inputSchema: {
      type: 'object',
      properties: {
        messageType: {
          type: 'string',
          description: 'Message type to wait for (roomUpdate, playerStats, message, error, harvestComplete, etc.)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 5000)',
        },
        containsText: {
          type: 'string',
          description: 'Optional text that must be in the message',
        },
      },
      required: ['messageType'],
    },
  },
  {
    name: 'test_get_message_history',
    description: 'Get recent messages received from the server',
    inputSchema: {
      type: 'object',
      properties: {
        messageType: {
          type: 'string',
          description: 'Filter by message type (optional)',
        },
        limit: {
          type: 'number',
          description: 'Max messages to return (default: 20)',
        },
      },
    },
  },
];

export async function handleCommandTool(name, args) {
  const session = getActiveSession();
  if (!session) {
    return {
      content: [{ type: 'text', text: 'No active session. Connect first with test_connect.' }],
      isError: true,
    };
  }

  switch (name) {
    case 'test_send_command': {
      const { command, target, data = {} } = args;
      const cmdData = { ...data };

      // Map target to appropriate field based on command
      if (target) {
        if (command === 'move') {
          cmdData.direction = target;
        } else if (command === 'telepath') {
          cmdData.targetPlayer = target;
        } else if (command === 'harvest' || command === 'look') {
          cmdData.target = target;
        } else {
          cmdData.target = target;
        }
      }

      try {
        session.client.send({ type: command, ...cmdData });

        // Wait briefly for any response
        await new Promise((r) => setTimeout(r, 100));

        const recent = session.getMessageHistory(null, 5);
        return {
          content: [
            {
              type: 'text',
              text: 'Command sent: ' + command + '\nRecent messages:\n' + JSON.stringify(recent, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: 'Command failed: ' + error.message }],
          isError: true,
        };
      }
    }

    case 'test_wait_for_message': {
      const { messageType, timeout = 5000, containsText } = args;

      try {
        const filter = (msg) => {
          if (msg.type !== messageType) return false;
          if (containsText && !JSON.stringify(msg).includes(containsText)) return false;
          return true;
        };

        const msg = await session.waitForMessage(filter, timeout);
        return {
          content: [
            {
              type: 'text',
              text: 'Received message:\n' + JSON.stringify(msg, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: 'Timeout waiting for message type: ' + messageType }],
          isError: true,
        };
      }
    }

    case 'test_get_message_history': {
      const { messageType, limit = 20 } = args;
      const filter = messageType ? (msg) => msg.type === messageType : null;
      const history = session.getMessageHistory(filter, limit);
      return {
        content: [
          {
            type: 'text',
            text: 'Message history (' + history.length + ' messages):\n' + JSON.stringify(history, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: 'Unknown command tool: ' + name }],
        isError: true,
      };
  }
}


