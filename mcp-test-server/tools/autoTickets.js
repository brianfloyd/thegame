/**
 * Auto Ticket Tools - MCP tools for automatic ticket processing
 * 
 * Enables Cursor to check for new tickets and automatically process them
 */

import * as verifier from '../src/StateVerifier.js';

export const autoTicketTools = [
  {
    name: 'auto_tickets_check',
    description: 'Check for new open tickets that need processing. Returns list of tickets that should be worked on. Use this to automatically detect and process new tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        sinceId: {
          type: 'number',
          description: 'Only return tickets with ID greater than this (for tracking last processed ticket)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tickets to return (default: 10)',
        },
      },
    },
  },
];

export async function handleAutoTicketTool(name, args) {
  try {
    switch (name) {
      case 'auto_tickets_check': {
        const sinceId = args.sinceId || 0;
        const limit = args.limit || 10;
        
        // Get open tickets created after the specified ID, ordered by priority
        const tickets = await verifier.query(
          `SELECT dt.*, ds.player_id, ds.bug_label, p.name as player_name
           FROM debug_todos dt
           LEFT JOIN debug_sessions ds ON dt.session_id = ds.id
           LEFT JOIN players p ON ds.player_id = p.id
           WHERE dt.status = 'open'
           AND dt.id > $1
           ORDER BY dt.priority DESC, dt.created_at ASC
           LIMIT $2`,
          [sinceId, limit]
        );
        
        if (tickets.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No new tickets found (checked tickets after ID ${sinceId})`,
            }],
            metadata: {
              ticketCount: 0,
              tickets: [],
              lastCheckedId: sinceId,
            },
          };
        }
        
        // Format tickets for display
        const priorityLabels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
        const typeLabels = { debug: 'Debug', manual: 'Manual', user: 'User' };
        
        const ticketList = tickets.map((t, index) => {
          const priorityLabel = priorityLabels[t.priority] || 'Medium';
          const typeLabel = typeLabels[t.ticket_type] || 'Debug';
          
          return `[${t.id}] ${priorityLabel} Priority - ${typeLabel} Ticket
    Title: ${t.title}
    Created: ${new Date(t.created_at).toISOString()}
    ${t.player_name ? `Player: ${t.player_name}` : ''}
    ${t.created_by ? `Created by: ${t.created_by}` : ''}`;
        }).join('\n\n');
        
        const summary = `Found ${tickets.length} new ticket(s) to process:\n\n${ticketList}`;
        
        // Return structured data
        return {
          content: [{
            type: 'text',
            text: summary,
          }],
          metadata: {
            ticketCount: tickets.length,
            tickets: tickets.map(t => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              ticket_type: t.ticket_type,
              summary: t.description ? (t.description.substring(0, 200) + (t.description.length > 200 ? '...' : '')) : '',
              created_at: t.created_at,
              created_by: t.created_by,
              player_name: t.player_name,
            })),
            lastCheckedId: Math.max(...tickets.map(t => t.id), sinceId),
            shouldProcess: tickets.length > 0,
          },
        };
      }
      
      default:
        return {
          content: [{ type: 'text', text: `Unknown auto ticket tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    console.error(`Error in auto ticket tool ${name}:`, error);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}

