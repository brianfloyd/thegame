/**
 * Work Tickets Tools - MCP tools for ZORK-Cursor ticket workflow
 * 
 * Enables Cursor to process tickets created by ZORK:
 * - List open tickets
 * - Display tickets to user
 * - Process tickets sequentially
 */

import * as verifier from '../src/StateVerifier.js';

export const workTicketTools = [
  {
    name: 'work_tickets_start',
    description: 'Start working on tickets. Lists all open tickets, displays them to user, then returns structured data for sequential processing. This is the main entry point when user says "work tickets" or "debug tickets".',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of tickets to process (default: 10)',
        },
        priority: {
          type: 'number',
          description: 'Filter by priority (1=low, 2=medium, 3=high, 4=critical). If not specified, returns all priorities ordered by priority.',
        },
        ticketType: {
          type: 'string',
          enum: ['debug', 'manual', 'user'],
          description: 'Filter by ticket type',
        },
      },
    },
  },
  {
    name: 'work_tickets_update',
    description: 'Update a ticket status and add resolution notes with Acceptance Criteria. Use this after implementing a fix to mark ticket as in_progress with AC for user testing.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Ticket ID to update',
        },
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'resolved'],
          description: 'New status (typically "in_progress" after implementation)',
        },
        resolutionNotes: {
          type: 'string',
          description: 'Resolution notes with Acceptance Criteria. Format: "IMPLEMENTATION COMPLETE - Ready for Testing\\n\\n[Description]\\n\\nACCEPTANCE CRITERIA:\\n- [ ] [Test step 1]\\n- [ ] [Test step 2]"',
        },
      },
      required: ['id'],
    },
  },
];

export async function handleWorkTicketTool(name, args) {
  try {
    switch (name) {
      case 'work_tickets_start': {
        const limit = args.limit || 10;
        const priority = args.priority !== undefined ? args.priority : null;
        const ticketType = args.ticketType || null;
        
        // Get tickets to work on:
        // 1. Open tickets (new tickets to start working on)
        // 2. In-progress tickets that don't have "IMPLEMENTATION COMPLETE" yet (still being worked on)
        let sql = `
          SELECT dt.*, ds.player_id, ds.bug_label, p.name as player_name
          FROM debug_todos dt
          LEFT JOIN debug_sessions ds ON dt.session_id = ds.id
          LEFT JOIN players p ON ds.player_id = p.id
          WHERE dt.status = 'open' 
             OR (dt.status = 'in_progress' AND (dt.resolution_notes IS NULL OR dt.resolution_notes NOT LIKE '%IMPLEMENTATION COMPLETE%'))
        `;
        const params = [];
        let paramIndex = 1;
        
        if (priority !== null) {
          sql += ` AND dt.priority = $${paramIndex++}`;
          params.push(priority);
        }
        
        if (ticketType) {
          sql += ` AND dt.ticket_type = $${paramIndex++}`;
          params.push(ticketType);
        }
        
        sql += ' ORDER BY dt.priority DESC, dt.created_at ASC';
        sql += ` LIMIT $${paramIndex++}`;
        params.push(limit);
        
        const tickets = await verifier.query(sql, params);
        
        if (tickets.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No tickets to work on. All tickets are either resolved, in backlog, or already have implementation complete and are waiting for testing.',
            }],
          };
        }
        
        // Format tickets for display
        const priorityLabels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
        const typeLabels = { debug: 'Debug', manual: 'Manual', user: 'User' };
        
        const ticketList = tickets.map((t, index) => {
          const priorityLabel = priorityLabels[t.priority] || 'Medium';
          const typeLabel = typeLabels[t.ticket_type] || 'Debug';
          const tags = Array.isArray(t.tags) ? t.tags.join(', ') : (t.tags || '');
          
          return `[${t.id}] ${priorityLabel} Priority - ${typeLabel} Ticket
    Title: ${t.title}
    Created: ${new Date(t.created_at).toISOString()}
    ${t.player_name ? `Player: ${t.player_name}` : ''}
    ${tags ? `Tags: ${tags}` : ''}
    ${t.estimated_effort ? `Effort: ${t.estimated_effort}` : ''}`;
        }).join('\n\n');
        
        const summary = `Found ${tickets.length} open ticket(s) to process:\n\n${ticketList}\n\nProcessing tickets sequentially, starting with highest priority...`;
        
        // Return structured data for Cursor to process
        return {
          content: [{
            type: 'text',
            text: summary,
          }],
          // Include structured data for programmatic processing
          metadata: {
            ticketCount: tickets.length,
            tickets: tickets.map(t => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              ticket_type: t.ticket_type,
              summary: t.description.substring(0, 200) + (t.description.length > 200 ? '...' : ''),
              created_at: t.created_at,
              player_name: t.player_name,
            })),
            workflow: 'sequential',
          },
        };
      }
      
      case 'work_tickets_update': {
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
            content: [{ type: 'text', text: 'No updates provided. Must specify status or resolutionNotes.' }],
            isError: true,
          };
        }
        
        updates.push('updated_at = NOW()');
        params.push(args.id);
        
        const sql = `UPDATE debug_todos SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await verifier.queryOne(sql, params);
        
        if (!result) {
          return {
            content: [{ type: 'text', text: `Ticket #${args.id} not found` }],
            isError: true,
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: `✅ Ticket #${result.id} updated!\nStatus: ${result.status}\nTitle: ${result.title}\nUpdated: ${new Date(result.updated_at).toISOString()}\n\nResolution notes have been added. Ticket is ready for user testing.`,
          }],
        };
      }
      
      default:
        return {
          content: [{ type: 'text', text: `Unknown work ticket tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    console.error(`Error in work ticket tool ${name}:`, error);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}

