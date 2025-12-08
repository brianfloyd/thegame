/**
 * Debug Todo Tools - MCP tools for bug observation and tracking
 * 
 * Enables the ZORK debug observer workflow:
 * - Start/end debug observation sessions
 * - Create rich bug reports from telemetry
 * - List and manage debug todos
 * - Cursor can pick up and resolve bugs
 */

import * as verifier from '../src/StateVerifier.js';

export const debugTools = [
  {
    name: 'debug_start_session',
    description: 'Start a debug observation session for a player. The client will begin streaming telemetry.',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: {
          type: 'number',
          description: 'Player ID to start debug session for',
        },
        playerName: {
          type: 'string',
          description: 'Player name (alternative to playerId)',
        },
        bugLabel: {
          type: 'string',
          description: 'Short description of the bug being observed (e.g., "map widget not rendering")',
        },
      },
      required: ['bugLabel'],
    },
  },
  {
    name: 'debug_end_session',
    description: 'End an active debug observation session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'number',
          description: 'Session ID to end',
        },
        playerId: {
          type: 'number',
          description: 'Player ID (will end their active session)',
        },
      },
    },
  },
  {
    name: 'debug_add_todo',
    description: 'Create a new debug todo with rich context. Called by ZORK after analyzing telemetry.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'number',
          description: 'Optional session ID this todo relates to',
        },
        title: {
          type: 'string',
          description: 'Concise bug summary (e.g., "MapWidget fails to render after factory entry")',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what appears broken',
        },
        reproSteps: {
          type: 'string',
          description: 'Numbered steps to reproduce the bug',
        },
        environment: {
          type: 'object',
          description: 'JSON with map, room, widgets, browser, playerName context',
        },
        logs: {
          type: 'object',
          description: 'JSON with consoleErrors, clientStates, wsMessages arrays',
        },
        createdBy: {
          type: 'string',
          description: 'Who created this todo (default: "zork")',
        },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'debug_list_todos',
    description: 'List debug todos, optionally filtered by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'resolved'],
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 50)',
        },
        includeSession: {
          type: 'boolean',
          description: 'Include session details (player name, bug label)',
        },
      },
    },
  },
  {
    name: 'debug_get_todo',
    description: 'Get a specific debug todo by ID with full details.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Todo ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'debug_update_todo',
    description: 'Update a debug todo status or add resolution notes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Todo ID to update',
        },
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'resolved'],
          description: 'New status',
        },
        resolutionNotes: {
          type: 'string',
          description: 'Notes about the fix (required when resolving)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'debug_get_session',
    description: 'Get details of a debug session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'number',
          description: 'Session ID',
        },
        playerId: {
          type: 'number',
          description: 'Get active session for this player',
        },
      },
    },
  },
];

export async function handleDebugTool(name, args) {
  try {
    switch (name) {
      case 'debug_start_session': {
        let playerId = args.playerId;
        
        // Look up player by name if needed
        if (!playerId && args.playerName) {
          const player = await verifier.queryOne(
            'SELECT id FROM players WHERE LOWER(name) = LOWER($1)',
            [args.playerName]
          );
          if (!player) {
            return {
              content: [{ type: 'text', text: `Error: Player "${args.playerName}" not found` }],
            };
          }
          playerId = player.id;
        }
        
        if (!playerId) {
          return {
            content: [{ type: 'text', text: 'Error: Either playerId or playerName is required' }],
          };
        }
        
        // End any active session first
        await verifier.execute(
          'UPDATE debug_sessions SET active = FALSE, ended_at = NOW() WHERE player_id = $1 AND active = TRUE',
          [playerId]
        );
        
        // Create new session
        const result = await verifier.queryOne(
          'INSERT INTO debug_sessions (player_id, bug_label) VALUES ($1, $2) RETURNING *',
          [playerId, args.bugLabel]
        );
        
        return {
          content: [{
            type: 'text',
            text: `Debug session started!\nSession ID: ${result.id}\nBug Label: ${args.bugLabel}\nPlayer ID: ${playerId}\n\nThe client will now stream telemetry to ZORK.`,
          }],
        };
      }
      
      case 'debug_end_session': {
        let sessionId = args.sessionId;
        
        // Find active session for player if needed
        if (!sessionId && args.playerId) {
          const session = await verifier.queryOne(
            'SELECT id FROM debug_sessions WHERE player_id = $1 AND active = TRUE ORDER BY started_at DESC LIMIT 1',
            [args.playerId]
          );
          if (session) {
            sessionId = session.id;
          }
        }
        
        if (!sessionId) {
          return {
            content: [{ type: 'text', text: 'No active session found to end' }],
          };
        }
        
        await verifier.execute(
          'UPDATE debug_sessions SET active = FALSE, ended_at = NOW() WHERE id = $1',
          [sessionId]
        );
        
        return {
          content: [{ type: 'text', text: `Debug session ${sessionId} ended` }],
        };
      }
      
      case 'debug_add_todo': {
        const result = await verifier.queryOne(
          `INSERT INTO debug_todos 
           (session_id, title, description, repro_steps, environment, logs, created_by) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING *`,
          [
            args.sessionId || null,
            args.title,
            args.description,
            args.reproSteps || null,
            JSON.stringify(args.environment || {}),
            JSON.stringify(args.logs || {}),
            args.createdBy || 'zork',
          ]
        );
        
        return {
          content: [{
            type: 'text',
            text: `Debug todo created!\nID: ${result.id}\nTitle: ${result.title}\nStatus: ${result.status}\nCreated by: ${result.created_by}`,
          }],
        };
      }
      
      case 'debug_list_todos': {
        let sql, params;
        
        if (args.includeSession) {
          sql = `
            SELECT dt.*, ds.player_id, ds.bug_label, ds.started_at as session_started, p.name as player_name
            FROM debug_todos dt
            LEFT JOIN debug_sessions ds ON dt.session_id = ds.id
            LEFT JOIN players p ON ds.player_id = p.id
          `;
        } else {
          sql = 'SELECT * FROM debug_todos';
        }
        
        params = [];
        if (args.status) {
          sql += ' WHERE dt.status = $1';
          params.push(args.status);
        }
        
        sql += ' ORDER BY dt.created_at DESC';
        
        const limit = args.limit || 50;
        sql += ` LIMIT $${params.length + 1}`;
        params.push(limit);
        
        const todos = await verifier.query(sql, params);
        
        if (todos.length === 0) {
          return {
            content: [{ type: 'text', text: `No debug todos found${args.status ? ` with status "${args.status}"` : ''}` }],
          };
        }
        
        const formatted = todos.map(t => {
          let entry = `[${t.id}] ${t.status.toUpperCase()} - ${t.title}`;
          if (args.includeSession && t.player_name) {
            entry += `\n    Player: ${t.player_name} | Bug: ${t.bug_label}`;
          }
          entry += `\n    Created: ${new Date(t.created_at).toISOString()}`;
          return entry;
        }).join('\n\n');
        
        return {
          content: [{
            type: 'text',
            text: `Debug Todos (${todos.length} results):\n\n${formatted}`,
          }],
        };
      }
      
      case 'debug_get_todo': {
        const todo = await verifier.queryOne(
          `SELECT dt.*, ds.player_id, ds.bug_label, p.name as player_name
           FROM debug_todos dt
           LEFT JOIN debug_sessions ds ON dt.session_id = ds.id
           LEFT JOIN players p ON ds.player_id = p.id
           WHERE dt.id = $1`,
          [args.id]
        );
        
        if (!todo) {
          return {
            content: [{ type: 'text', text: `Debug todo #${args.id} not found` }],
          };
        }
        
        const output = `Debug Todo #${todo.id}
========================
Title: ${todo.title}
Status: ${todo.status}
Created: ${new Date(todo.created_at).toISOString()}
Updated: ${new Date(todo.updated_at).toISOString()}
Created By: ${todo.created_by}
${todo.player_name ? `Player: ${todo.player_name}` : ''}
${todo.bug_label ? `Bug Label: ${todo.bug_label}` : ''}

DESCRIPTION:
${todo.description}

${todo.repro_steps ? `REPRO STEPS:\n${todo.repro_steps}` : ''}

${todo.environment ? `ENVIRONMENT:\n${JSON.stringify(todo.environment, null, 2)}` : ''}

${todo.logs ? `LOGS:\n${JSON.stringify(todo.logs, null, 2)}` : ''}

${todo.resolution_notes ? `RESOLUTION NOTES:\n${todo.resolution_notes}` : ''}`;
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }
      
      case 'debug_update_todo': {
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (args.status) {
          updates.push(`status = $${paramIndex++}`);
          params.push(args.status);
        }
        
        if (args.resolutionNotes !== undefined) {
          updates.push(`resolution_notes = $${paramIndex++}`);
          params.push(args.resolutionNotes);
        }
        
        if (updates.length === 0) {
          return {
            content: [{ type: 'text', text: 'No updates provided' }],
          };
        }
        
        updates.push('updated_at = NOW()');
        params.push(args.id);
        
        const sql = `UPDATE debug_todos SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await verifier.queryOne(sql, params);
        
        if (!result) {
          return {
            content: [{ type: 'text', text: `Debug todo #${args.id} not found` }],
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: `Debug todo #${result.id} updated!\nStatus: ${result.status}\nUpdated: ${new Date(result.updated_at).toISOString()}`,
          }],
        };
      }
      
      case 'debug_get_session': {
        let session;
        
        if (args.sessionId) {
          session = await verifier.queryOne(
            `SELECT ds.*, p.name as player_name
             FROM debug_sessions ds
             LEFT JOIN players p ON ds.player_id = p.id
             WHERE ds.id = $1`,
            [args.sessionId]
          );
        } else if (args.playerId) {
          session = await verifier.queryOne(
            `SELECT ds.*, p.name as player_name
             FROM debug_sessions ds
             LEFT JOIN players p ON ds.player_id = p.id
             WHERE ds.player_id = $1 AND ds.active = TRUE
             ORDER BY ds.started_at DESC LIMIT 1`,
            [args.playerId]
          );
        }
        
        if (!session) {
          return {
            content: [{ type: 'text', text: 'Debug session not found' }],
          };
        }
        
        // Get todos for this session
        const todos = await verifier.query(
          'SELECT id, title, status FROM debug_todos WHERE session_id = $1',
          [session.id]
        );
        
        const output = `Debug Session #${session.id}
========================
Bug Label: ${session.bug_label}
Player: ${session.player_name} (ID: ${session.player_id})
Active: ${session.active}
Started: ${new Date(session.started_at).toISOString()}
${session.ended_at ? `Ended: ${new Date(session.ended_at).toISOString()}` : ''}

Todos (${todos.length}):
${todos.map(t => `  [${t.id}] ${t.status} - ${t.title}`).join('\n') || '  None'}`;
        
        return {
          content: [{ type: 'text', text: output }],
        };
      }
      
      default:
        return {
          content: [{ type: 'text', text: `Unknown debug tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    console.error(`Error in debug tool ${name}:`, error);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}

