#!/usr/bin/env node
/**
 * Auto Ticket Processor
 * 
 * Watches for new tickets and automatically processes them.
 * This script runs in the background and triggers Cursor to work on tickets.
 * 
 * Usage:
 *   node scripts/auto-ticket-processor.js
 * 
 * This script:
 * 1. Watches for trigger files in .tickets/ directory
 * 2. When a trigger file appears, processes the ticket
 * 3. Deletes the trigger file after processing
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../database.js');

const TICKETS_DIR = path.join(__dirname, '..', '.tickets');
const TRIGGER_FILE_PATTERN = /^ticket-(\d+)\.trigger$/;
const POLL_INTERVAL = 2000; // Check every 2 seconds
const PROCESSED_FILE = path.join(TICKETS_DIR, '.last-processed');

// Ensure tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
  console.log(`[Auto-Ticket] Created tickets directory: ${TICKETS_DIR}`);
}

// Track last processed ticket ID to avoid reprocessing
let lastProcessedId = 0;
if (fs.existsSync(PROCESSED_FILE)) {
  try {
    const content = fs.readFileSync(PROCESSED_FILE, 'utf8').trim();
    lastProcessedId = parseInt(content) || 0;
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Process a ticket by ID
 */
async function processTicket(ticketId) {
  try {
    console.log(`[Auto-Ticket] Processing ticket #${ticketId}...`);
    
    // Get ticket details
    const ticket = await db.getDebugTodo(ticketId);
    if (!ticket) {
      console.log(`[Auto-Ticket] Ticket #${ticketId} not found, skipping`);
      return false;
    }
    
        // Skip deleted tickets
        if (ticket.status === 'deleted') {
            console.log(`[Auto-Ticket] Ticket #${ticketId} is deleted, skipping`);
            return false;
        }
        
        // Skip backlog tickets (they're filed but not actively worked on)
        if (ticket.status === 'backlog') {
            console.log(`[Auto-Ticket] Ticket #${ticketId} is in backlog, skipping`);
            return false;
        }
        
        // Skip resolved tickets
        if (ticket.status === 'resolved') {
            console.log(`[Auto-Ticket] Ticket #${ticketId} is resolved, skipping`);
            return false;
        }
        
        // Skip in_progress tickets that already have "IMPLEMENTATION COMPLETE" (waiting for user testing)
        if (ticket.status === 'in_progress' && ticket.resolution_notes && ticket.resolution_notes.includes('IMPLEMENTATION COMPLETE')) {
            console.log(`[Auto-Ticket] Ticket #${ticketId} is in_progress with IMPLEMENTATION COMPLETE, waiting for user testing - skipping`);
            return false;
        }
        
        // Process open tickets OR in_progress tickets that don't have IMPLEMENTATION COMPLETE yet
        if (ticket.status !== 'open' && ticket.status !== 'in_progress') {
            console.log(`[Auto-Ticket] Ticket #${ticketId} is not open or in_progress (status: ${ticket.status}), skipping`);
            return false;
        }
    
    console.log(`[Auto-Ticket] Found ticket #${ticketId}: "${ticket.title}"`);
    console.log(`[Auto-Ticket] Priority: ${ticket.priority}, Type: ${ticket.ticket_type}`);
    console.log(`[Auto-Ticket] Created by: ${ticket.created_by}`);
    
    // Mark ticket as "in_progress" to indicate Cursor is working on it
    try {
      const updateResult = await db.query(
        'UPDATE debug_todos SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
        ['in_progress', ticketId]
      );
      if (updateResult.rows && updateResult.rows.length > 0) {
        console.log(`[Auto-Ticket] Marked ticket #${ticketId} as "in_progress" - Cursor is working on it`);
      }
    } catch (updateError) {
      console.error(`[Auto-Ticket] Error updating ticket status:`, updateError);
      // Continue anyway - processing file is more important
    }
    
    // Write a processing file that Cursor can detect
    const processingFile = path.join(TICKETS_DIR, `ticket-${ticketId}.processing`);
    fs.writeFileSync(processingFile, JSON.stringify({
      ticketId: ticket.id,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      ticket_type: ticket.ticket_type,
      created_at: ticket.created_at,
      created_by: ticket.created_by,
      timestamp: new Date().toISOString(),
      status: 'in_progress',
      cursorProcessing: true
    }, null, 2));
    
    console.log(`[Auto-Ticket] Created processing file for ticket #${ticketId}`);
    console.log(`[Auto-Ticket] Cursor will pick this up and start working on it`);
    
    // Update last processed ID
    lastProcessedId = Math.max(lastProcessedId, ticketId);
    fs.writeFileSync(PROCESSED_FILE, lastProcessedId.toString());
    
    return true;
  } catch (error) {
    console.error(`[Auto-Ticket] Error processing ticket #${ticketId}:`, error);
    return false;
  }
}

/**
 * Check for new tickets in database
 */
async function checkForNewTickets() {
  try {
    // First, check for critical tickets (priority = 4)
    // If any critical tickets exist, process ONLY those
    const criticalTickets = await db.query(
      `SELECT id, title, status, priority, ticket_type, created_at, created_by 
       FROM debug_todos 
       WHERE status = 'open' 
       AND status != 'deleted' 
       AND status != 'backlog'
       AND priority = 4
       AND id > $1 
       ORDER BY created_at ASC 
       LIMIT 1`,
      [lastProcessedId]
    );
    
    if (criticalTickets.rows && criticalTickets.rows.length > 0) {
      console.log(`[Auto-Ticket] Found ${criticalTickets.rows.length} CRITICAL ticket(s) - processing ONLY critical tickets`);
      for (const ticket of criticalTickets.rows) {
        await processTicket(ticket.id);
      }
      return; // Don't process other tickets if critical exists
    }
    
    // No critical tickets - get open tickets in priority order (skip backlog)
    const tickets = await db.query(
      `SELECT id, title, status, priority, ticket_type, created_at, created_by 
       FROM debug_todos 
       WHERE status = 'open' 
       AND status != 'deleted' 
       AND status != 'backlog'
       AND id > $1 
       ORDER BY priority DESC, created_at ASC 
       LIMIT 10`,
      [lastProcessedId]
    );
    
    if (tickets.rows.length > 0) {
      console.log(`[Auto-Ticket] Found ${tickets.rows.length} new ticket(s) (priority order)`);
      
      // Process tickets in priority order
      for (const ticket of tickets.rows) {
        await processTicket(ticket.id);
        // Small delay between tickets
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error('[Auto-Ticket] Error checking for new tickets:', error);
  }
}

/**
 * Check for trigger files
 */
function checkTriggerFiles() {
  try {
    const files = fs.readdirSync(TICKETS_DIR);
    
    for (const file of files) {
      const match = file.match(TRIGGER_FILE_PATTERN);
      if (match) {
        const ticketId = parseInt(match[1]);
        if (ticketId > lastProcessedId) {
          console.log(`[Auto-Ticket] Found trigger file: ${file}`);
          processTicket(ticketId).then(() => {
            // Delete trigger file after processing
            const triggerPath = path.join(TICKETS_DIR, file);
            try {
              fs.unlinkSync(triggerPath);
              console.log(`[Auto-Ticket] Deleted trigger file: ${file}`);
            } catch (e) {
              console.error(`[Auto-Ticket] Error deleting trigger file:`, e);
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('[Auto-Ticket] Error checking trigger files:', error);
  }
}

/**
 * Main loop
 */
async function main() {
  console.log('[Auto-Ticket] Starting auto-ticket processor...');
  console.log(`[Auto-Ticket] Watching directory: ${TICKETS_DIR}`);
  console.log(`[Auto-Ticket] Last processed ticket ID: ${lastProcessedId}`);
  console.log(`[Auto-Ticket] Polling interval: ${POLL_INTERVAL}ms`);
  console.log('[Auto-Ticket] Processor is running. Press Ctrl+C to stop.\n');
  
  // Initial check
  await checkForNewTickets();
  checkTriggerFiles();
  
  // Set up polling
  setInterval(async () => {
    await checkForNewTickets();
    checkTriggerFiles();
  }, POLL_INTERVAL);
  
  // Also watch for file system changes (more efficient)
  if (fs.watch) {
    fs.watch(TICKETS_DIR, (eventType, filename) => {
      if (filename && filename.match(TRIGGER_FILE_PATTERN)) {
        console.log(`[Auto-Ticket] File system event: ${eventType} on ${filename}`);
        checkTriggerFiles();
      }
    });
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Auto-Ticket] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Auto-Ticket] Shutting down...');
  process.exit(0);
});

// Start the processor
main().catch(error => {
  console.error('[Auto-Ticket] Fatal error:', error);
  process.exit(1);
});

