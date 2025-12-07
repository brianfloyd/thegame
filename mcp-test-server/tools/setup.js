/**
 * Setup Tools - MCP tools for setting up test data (players, NPCs, rooms, items)
 */

import * as verifier from '../src/StateVerifier.js';

export const setupTools = [
  {
    name: 'test_setup_player',
    description: 'Create or update a test player with specific stats',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: {
          type: 'number',
          description: 'Existing player ID to update',
        },
        name: {
          type: 'string',
          description: 'Player name (for new player)',
        },
        stats: {
          type: 'object',
          description: 'Stats to set (e.g., { stat_resonance: 50, stat_fortitude: 30 })',
        },
      },
    },
  },
  {
    name: 'test_setup_npc',
    description: 'Create or update an NPC with specific configuration',
    inputSchema: {
      type: 'object',
      properties: {
        npcId: {
          type: 'number',
          description: 'Existing NPC ID to update',
        },
        name: {
          type: 'string',
          description: 'NPC name',
        },
        config: {
          type: 'object',
          description: 'NPC config (e.g., { pulse_echo_yield: 5, base_cycle_time: 3000 })',
        },
        roomId: {
          type: 'number',
          description: 'Room ID to place NPC in',
        },
      },
    },
  },
  {
    name: 'test_setup_item',
    description: 'Add item to player inventory or room',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: {
          type: 'string',
          description: 'Item name',
        },
        quantity: {
          type: 'number',
          description: 'Quantity to add (default: 1)',
        },
        playerId: {
          type: 'number',
          description: 'Player ID to add to inventory',
        },
        roomId: {
          type: 'number',
          description: 'Room ID to add to ground',
        },
      },
      required: ['itemName'],
    },
  },
  {
    name: 'test_cleanup',
    description: 'Clean up test data created during testing',
    inputSchema: {
      type: 'object',
      properties: {
        cleanupType: {
          type: 'string',
          description: 'What to clean: all, players, npcs, items',
        },
      },
    },
  },
];

export async function handleSetupTool(name, args) {
  try {
    switch (name) {
      case 'test_setup_player': {
        const { playerId, name: playerName, stats = {} } = args;

        if (playerId) {
          // Update existing player
          if (Object.keys(stats).length > 0) {
            const setClauses = Object.keys(stats)
              .map((k, i) => `${k} = $${i + 2}`)
              .join(', ');
            await verifier.query(
              `UPDATE players SET ${setClauses} WHERE id = $1`,
              [playerId, ...Object.values(stats)]
            );
          }
          const player = await verifier.queryOne('SELECT * FROM players WHERE id = $1', [playerId]);
          return {
            content: [{ type: 'text', text: 'Player updated:\n' + JSON.stringify(player, null, 2) }],
          };
        } else if (playerName) {
          // Check if exists
          let player = await verifier.queryOne('SELECT * FROM players WHERE name = $1', [playerName]);
          if (player) {
            return {
              content: [{ type: 'text', text: 'Player already exists:\n' + JSON.stringify(player, null, 2) }],
            };
          }
          // Create new player with defaults
          const result = await verifier.query(
            'INSERT INTO players (name, current_room_id) VALUES ($1, 1) RETURNING *',
            [playerName]
          );
          player = result[0];

          if (Object.keys(stats).length > 0) {
            const setClauses = Object.keys(stats)
              .map((k, i) => `${k} = $${i + 2}`)
              .join(', ');
            await verifier.query(`UPDATE players SET ${setClauses} WHERE id = $1`, [
              player.id,
              ...Object.values(stats),
            ]);
            player = await verifier.queryOne('SELECT * FROM players WHERE id = $1', [player.id]);
          }
          return {
            content: [{ type: 'text', text: 'Player created:\n' + JSON.stringify(player, null, 2) }],
          };
        }
        return {
          content: [{ type: 'text', text: 'Provide playerId or name' }],
          isError: true,
        };
      }

      case 'test_setup_npc': {
        const { npcId, name: npcName, config = {}, roomId } = args;

        if (npcId) {
          if (Object.keys(config).length > 0) {
            const setClauses = Object.keys(config)
              .map((k, i) => `${k} = $${i + 2}`)
              .join(', ');
            await verifier.query(`UPDATE scriptable_npcs SET ${setClauses} WHERE id = $1`, [
              npcId,
              ...Object.values(config),
            ]);
          }
          const npc = await verifier.queryOne('SELECT * FROM scriptable_npcs WHERE id = $1', [npcId]);

          if (roomId) {
            await verifier.query(
              'INSERT INTO room_npcs (room_id, npc_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [roomId, npcId]
            );
          }
          return {
            content: [{ type: 'text', text: 'NPC updated:\n' + JSON.stringify(npc, null, 2) }],
          };
        }
        return {
          content: [{ type: 'text', text: 'Provide npcId to update' }],
          isError: true,
        };
      }

      case 'test_setup_item': {
        const { itemName, quantity = 1, playerId, roomId } = args;

        if (playerId) {
          await verifier.query(
            `INSERT INTO player_items (player_id, item_name, quantity) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (player_id, item_name) 
             DO UPDATE SET quantity = player_items.quantity + $3`,
            [playerId, itemName, quantity]
          );
          return {
            content: [{ type: 'text', text: `Added ${quantity}x ${itemName} to player ${playerId}` }],
          };
        } else if (roomId) {
          await verifier.query(
            `INSERT INTO room_items (room_id, item_name, quantity) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (room_id, item_name) 
             DO UPDATE SET quantity = room_items.quantity + $3`,
            [roomId, itemName, quantity]
          );
          return {
            content: [{ type: 'text', text: `Added ${quantity}x ${itemName} to room ${roomId}` }],
          };
        }
        return {
          content: [{ type: 'text', text: 'Provide playerId or roomId' }],
          isError: true,
        };
      }

      case 'test_cleanup': {
        const { cleanupType = 'all' } = args;

        // For safety, only clean up items with 'test' prefix
        if (cleanupType === 'all' || cleanupType === 'items') {
          await verifier.query("DELETE FROM player_items WHERE item_name LIKE 'test_%'");
          await verifier.query("DELETE FROM room_items WHERE item_name LIKE 'test_%'");
        }
        return {
          content: [{ type: 'text', text: 'Cleanup completed for: ' + cleanupType }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: 'Unknown setup tool: ' + name }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: 'Setup error: ' + error.message }],
      isError: true,
    };
  }
}




