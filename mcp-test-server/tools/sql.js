/**
 * SQL Tools - MCP tools for direct database queries and modifications
 * 
 * Provides convenient access to:
 * - Raw SQL queries (SELECT only for safety)
 * - Raw SQL execution (INSERT, UPDATE, DELETE)
 * - Table schema inspection
 * - Player/NPC/Room/Item lookup shortcuts
 * - Formula configuration access
 */

import * as verifier from '../src/StateVerifier.js';

export const sqlTools = [
  {
    name: 'sql_query',
    description: 'Execute a SELECT query on the game database. Returns rows as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL SELECT query to execute',
        },
        params: {
          type: 'array',
          description: 'Query parameters for parameterized queries ($1, $2, etc.)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'sql_execute',
    description: 'Execute an INSERT, UPDATE, or DELETE query on the game database.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to execute (INSERT, UPDATE, DELETE)',
        },
        params: {
          type: 'array',
          description: 'Query parameters for parameterized queries ($1, $2, etc.)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'sql_get_tables',
    description: 'List all tables in the database with their column information.',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Specific table name to get columns for (optional)',
        },
      },
    },
  },
  {
    name: 'sql_get_player',
    description: 'Get a player by ID or name with all their stats, inventory, and bank.',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: {
          type: 'number',
          description: 'Player ID',
        },
        playerName: {
          type: 'string',
          description: 'Player name (case-insensitive)',
        },
      },
    },
  },
  {
    name: 'sql_get_npcs',
    description: 'Get NPCs, optionally filtered by room or name.',
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'number',
          description: 'Filter by room ID',
        },
        npcName: {
          type: 'string',
          description: 'Filter by NPC name (partial match)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 50)',
        },
      },
    },
  },
  {
    name: 'sql_get_rooms',
    description: 'Get rooms, optionally filtered by map or coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        mapId: {
          type: 'number',
          description: 'Filter by map ID',
        },
        x: {
          type: 'number',
          description: 'Filter by X coordinate',
        },
        y: {
          type: 'number',
          description: 'Filter by Y coordinate',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 50)',
        },
      },
    },
  },
  {
    name: 'sql_get_items',
    description: 'Get item definitions from the items table.',
    inputSchema: {
      type: 'object',
      properties: {
        itemName: {
          type: 'string',
          description: 'Filter by item name (partial match)',
        },
        itemType: {
          type: 'string',
          description: 'Filter by item type',
        },
      },
    },
  },
  {
    name: 'sql_update_player_stat',
    description: 'Update a specific stat for a player.',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: {
          type: 'number',
          description: 'Player ID to update',
        },
        statName: {
          type: 'string',
          description: 'Stat column name (e.g., stat_resonance, pulse_echoes, vitalis)',
        },
        value: {
          type: 'number',
          description: 'New value for the stat',
        },
      },
      required: ['playerId', 'statName', 'value'],
    },
  },
  {
    name: 'sql_get_formula_configs',
    description: 'Get harvest/attunement formula configurations.',
    inputSchema: {
      type: 'object',
      properties: {
        configKey: {
          type: 'string',
          description: 'Specific config key to get (optional)',
        },
      },
    },
  },
];

export async function handleSqlTool(name, args) {
  try {
    switch (name) {
      case 'sql_query': {
        const { query, params = [] } = args;
        if (!query.trim().toLowerCase().startsWith('select')) {
          return {
            content: [{ type: 'text', text: 'Only SELECT queries allowed. Use sql_execute for modifications.' }],
            isError: true,
          };
        }
        const rows = await verifier.query(query, params);
        return {
          content: [{ type: 'text', text: `Query returned ${rows.length} rows:\n${JSON.stringify(rows, null, 2)}` }],
        };
      }

      case 'sql_execute': {
        const { query, params = [] } = args;
        const lower = query.trim().toLowerCase();

        if (lower.startsWith('select')) {
          return {
            content: [{ type: 'text', text: 'Use sql_query for SELECT statements.' }],
            isError: true,
          };
        }

        if (lower.includes('drop ') || lower.includes('truncate ') || lower.includes('alter ')) {
          return {
            content: [{ type: 'text', text: 'DROP, TRUNCATE, and ALTER statements are not allowed.' }],
            isError: true,
          };
        }

        const pool = verifier.getPool();
        const client = await pool.connect();
        try {
          const result = await client.query(query, params);
          return {
            content: [{ type: 'text', text: `Query executed. Rows affected: ${result.rowCount}` }],
          };
        } finally {
          client.release();
        }
      }

      case 'sql_get_tables': {
        const { tableName } = args;

        if (tableName) {
          const columns = await verifier.query(
            `SELECT column_name, data_type, is_nullable, column_default 
             FROM information_schema.columns 
             WHERE table_name = $1 
             ORDER BY ordinal_position`,
            [tableName]
          );
          return {
            content: [{ type: 'text', text: `Columns for ${tableName}:\n${JSON.stringify(columns, null, 2)}` }],
          };
        }

        const tables = await verifier.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
        );
        return {
          content: [{ type: 'text', text: 'Tables:\n' + tables.map((t) => t.table_name).join('\n') }],
        };
      }

      case 'sql_get_player': {
        const { playerId, playerName } = args;
        let player;

        if (playerId) {
          player = await verifier.queryOne('SELECT * FROM players WHERE id = $1', [playerId]);
        } else if (playerName) {
          player = await verifier.queryOne('SELECT * FROM players WHERE LOWER(name) = LOWER($1)', [playerName]);
        } else {
          const players = await verifier.query('SELECT id, name, current_room_id FROM players ORDER BY id');
          return {
            content: [{ type: 'text', text: `All players:\n${JSON.stringify(players, null, 2)}` }],
          };
        }

        if (!player) {
          return { content: [{ type: 'text', text: 'Player not found.' }] };
        }

        const inventory = await verifier.getPlayerInventory(player.id);
        const bank = await verifier.getPlayerBank(player.id);

        return {
          content: [
            {
              type: 'text',
              text:
                `Player:\n${JSON.stringify(player, null, 2)}\n\n` +
                `Inventory:\n${JSON.stringify(inventory, null, 2)}\n\n` +
                `Bank:\n${JSON.stringify(bank, null, 2)}`,
            },
          ],
        };
      }

      case 'sql_get_npcs': {
        const { roomId, npcName, limit = 50 } = args;
        let query = `SELECT sn.*, rn.room_id, rn.slot 
                     FROM scriptable_npcs sn 
                     LEFT JOIN room_npcs rn ON sn.id = rn.npc_id 
                     WHERE 1=1`;
        const params = [];

        if (roomId) {
          params.push(roomId);
          query += ` AND rn.room_id = $${params.length}`;
        }
        if (npcName) {
          params.push(`%${npcName}%`);
          query += ` AND sn.name ILIKE $${params.length}`;
        }
        params.push(limit);
        query += ` LIMIT $${params.length}`;

        const npcs = await verifier.query(query, params);
        return {
          content: [{ type: 'text', text: `NPCs (${npcs.length}):\n${JSON.stringify(npcs, null, 2)}` }],
        };
      }

      case 'sql_get_rooms': {
        const { mapId, x, y, limit = 50 } = args;
        let query = 'SELECT * FROM rooms WHERE 1=1';
        const params = [];

        if (mapId) {
          params.push(mapId);
          query += ` AND map_id = $${params.length}`;
        }
        if (x !== undefined) {
          params.push(x);
          query += ` AND x = $${params.length}`;
        }
        if (y !== undefined) {
          params.push(y);
          query += ` AND y = $${params.length}`;
        }
        params.push(limit);
        query += ` LIMIT $${params.length}`;

        const rooms = await verifier.query(query, params);
        return {
          content: [{ type: 'text', text: `Rooms (${rooms.length}):\n${JSON.stringify(rooms, null, 2)}` }],
        };
      }

      case 'sql_get_items': {
        const { itemName, itemType } = args;
        let query = 'SELECT * FROM items WHERE 1=1';
        const params = [];

        if (itemName) {
          params.push(`%${itemName}%`);
          query += ` AND name ILIKE $${params.length}`;
        }
        if (itemType) {
          params.push(itemType);
          query += ` AND item_type = $${params.length}`;
        }
        query += ' ORDER BY name';

        const items = await verifier.query(query, params);
        return {
          content: [{ type: 'text', text: `Items (${items.length}):\n${JSON.stringify(items, null, 2)}` }],
        };
      }

      case 'sql_update_player_stat': {
        const { playerId, statName, value } = args;

        // Validate stat name to prevent SQL injection
        const validStats = await verifier.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'players'`
        );
        const validStatNames = validStats.map((r) => r.column_name);

        if (!validStatNames.includes(statName)) {
          return {
            content: [
              { type: 'text', text: `Invalid stat name: ${statName}. Valid: ${validStatNames.join(', ')}` },
            ],
            isError: true,
          };
        }

        await verifier.query(`UPDATE players SET ${statName} = $1 WHERE id = $2`, [value, playerId]);
        const player = await verifier.queryOne('SELECT * FROM players WHERE id = $1', [playerId]);

        return {
          content: [
            {
              type: 'text',
              text: `Updated ${statName} to ${value} for player ${playerId}\n${JSON.stringify(player, null, 2)}`,
            },
          ],
        };
      }

      case 'sql_get_formula_configs': {
        const { configKey } = args;
        let query = 'SELECT * FROM harvest_formula_config';
        const params = [];

        if (configKey) {
          params.push(configKey);
          query += ' WHERE config_key = $1';
        }
        query += ' ORDER BY config_key';

        const configs = await verifier.query(query, params);
        return {
          content: [{ type: 'text', text: `Formula configs:\n${JSON.stringify(configs, null, 2)}` }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: 'Unknown SQL tool: ' + name }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: 'Database error: ' + error.message }],
      isError: true,
    };
  }
}


