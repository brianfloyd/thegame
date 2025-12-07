/**
 * Verification Tools - MCP tools for verifying game state and database values
 */

import { getActiveSession } from '../src/TestSession.js';
import * as verifier from '../src/StateVerifier.js';

export const verificationTools = [
  {
    name: 'test_verify_player_stats',
    description: 'Verify player stats match expected values in the database',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: {
          type: 'number',
          description: 'Player ID to verify (uses session player if not provided)',
        },
        expectedStats: {
          type: 'object',
          description: 'Expected stat values to verify (e.g., { pulse_echoes: 10, vitalis: 100 })',
        },
      },
      required: ['expectedStats'],
    },
  },
  {
    name: 'test_verify_room_state',
    description: 'Verify room contents including NPCs and items',
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'number',
          description: 'Room ID to verify (uses current room if not provided)',
        },
        expected: {
          type: 'object',
          description: 'Expected room state (e.g., { npcCount: 2, itemCount: 5 })',
        },
      },
    },
  },
  {
    name: 'test_verify_inventory',
    description: 'Verify player inventory contains expected items',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: {
          type: 'number',
          description: 'Player ID (uses session player if not provided)',
        },
        expectedItems: {
          type: 'array',
          description: 'Expected items [{ name: "Pulse Resin", quantity: 5 }]',
        },
      },
    },
  },
  {
    name: 'test_verify_message_received',
    description: 'Check if a specific message was received recently',
    inputSchema: {
      type: 'object',
      properties: {
        messageType: {
          type: 'string',
          description: 'Message type to look for',
        },
        containsText: {
          type: 'string',
          description: 'Text that should be in the message',
        },
        withinLast: {
          type: 'number',
          description: 'Check within last N messages (default: 50)',
        },
      },
      required: ['messageType'],
    },
  },
];

export async function handleVerificationTool(name, args) {
  const session = getActiveSession();

  switch (name) {
    case 'test_verify_player_stats': {
      let playerId = args.playerId;
      if (!playerId && session?.client?.currentPlayer?.playerId) {
        playerId = session.client.currentPlayer.playerId;
      }
      if (!playerId) {
        return {
          content: [{ type: 'text', text: 'No player ID provided and no active session.' }],
          isError: true,
        };
      }

      const result = await verifier.verifyPlayerStats(playerId, args.expectedStats);
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      return {
        content: [{ type: 'text', text: status + '\n' + JSON.stringify(result, null, 2) }],
      };
    }

    case 'test_verify_room_state': {
      let roomId = args.roomId;
      if (!roomId && session?.client?.currentRoom?.id) {
        roomId = session.client.currentRoom.id;
      }
      if (!roomId) {
        return {
          content: [{ type: 'text', text: 'No room ID provided and no current room.' }],
          isError: true,
        };
      }

      const result = await verifier.verifyRoomState(roomId, args.expected || {});
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      return {
        content: [{ type: 'text', text: status + '\n' + JSON.stringify(result, null, 2) }],
      };
    }

    case 'test_verify_inventory': {
      let playerId = args.playerId;
      if (!playerId && session?.client?.currentPlayer?.playerId) {
        playerId = session.client.currentPlayer.playerId;
      }
      if (!playerId) {
        return {
          content: [{ type: 'text', text: 'No player ID provided and no active session.' }],
          isError: true,
        };
      }

      const inventory = await verifier.getPlayerInventory(playerId);
      const expected = args.expectedItems || [];
      const mismatches = [];

      for (const exp of expected) {
        const found = inventory.find((i) => i.item_name === exp.name);
        if (!found) {
          mismatches.push({ item: exp.name, expected: exp.quantity, actual: 0 });
        } else if (exp.quantity && found.quantity !== exp.quantity) {
          mismatches.push({ item: exp.name, expected: exp.quantity, actual: found.quantity });
        }
      }

      const status = mismatches.length === 0 ? '✅ PASS' : '❌ FAIL';
      return {
        content: [
          {
            type: 'text',
            text:
              status +
              '\nInventory: ' +
              JSON.stringify(inventory, null, 2) +
              '\nMismatches: ' +
              JSON.stringify(mismatches),
          },
        ],
      };
    }

    case 'test_verify_message_received': {
      if (!session) {
        return {
          content: [{ type: 'text', text: 'No active session.' }],
          isError: true,
        };
      }

      const { messageType, containsText, withinLast = 50 } = args;
      const history = session.getMessageHistory(null, withinLast);

      const found = history.find((item) => {
        if (item.message.type !== messageType) return false;
        if (containsText && !JSON.stringify(item.message).includes(containsText)) return false;
        return true;
      });

      if (found) {
        return {
          content: [{ type: 'text', text: '✅ PASS - Message found:\n' + JSON.stringify(found, null, 2) }],
        };
      }

      return {
        content: [{ type: 'text', text: '❌ FAIL - Message not found. Checked ' + history.length + ' messages.' }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: 'Unknown verification tool: ' + name }],
        isError: true,
      };
  }
}




