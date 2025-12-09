# Automatic Ticket Processing System

## Overview

The automatic ticket processing system allows Cursor to automatically detect and work on new tickets as soon as they're created, without requiring manual intervention.

## Architecture

### Components

1. **Trigger File System** (`handlers/game.js`, `scripts/zork-ai-agent.cjs`)
   - When a ticket is created, a trigger file is written to `.tickets/ticket-{id}.trigger`
   - Contains ticket metadata (ID, title, priority, etc.)

2. **Auto-Ticket Processor** (`scripts/auto-ticket-processor.js`)
   - Background script that watches for trigger files
   - Polls database for new tickets
   - Creates `.processing` files for Cursor to detect
   - Can run continuously or be triggered manually

3. **MCP Tool** (`mcp_game-tests_auto_tickets_check`)
   - Allows Cursor to check for new tickets programmatically
   - Returns structured data about new tickets
   - Can be called periodically or on-demand

## Usage

### Option 1: Background Processor (Recommended)

Run the auto-ticket processor in the background:

```bash
node scripts/auto-ticket-processor.js
```

This will:
- Watch for trigger files in `.tickets/` directory
- Poll database for new tickets every 2 seconds
- Create `.processing` files that Cursor can detect
- Log all activity to console

### Option 2: MCP Tool Polling

Use the MCP tool to check for new tickets:

```
Use mcp_game-tests_auto_tickets_check with:
- sinceId: Last processed ticket ID (optional, default: 0)
- limit: Max tickets to return (optional, default: 10)
```

Cursor can call this periodically to detect new tickets.

### Option 3: File System Watching

Cursor can watch the `.tickets/` directory for new `.processing` files and automatically start working on tickets when they appear.

## Workflow

1. **Ticket Creation** (Client or ZORK)
   - User creates ticket via UI → `createZorkTicket` handler
   - ZORK creates ticket → `createTicket` action
   - Both create trigger file: `.tickets/ticket-{id}.trigger`

2. **Detection** (Auto-Processor or MCP)
   - Auto-processor detects trigger file or polls database
   - Creates processing file: `.tickets/ticket-{id}.processing`
   - Contains full ticket details in JSON format

3. **Processing** (Cursor)
   - Cursor detects `.processing` file
   - Reads ticket details
   - Starts working on ticket automatically
   - Follows standard ticket workflow (fix → AC → knowledge)

4. **Cleanup**
   - Trigger file deleted after processing
   - Processing file can be deleted after Cursor picks it up
   - Last processed ID tracked in `.tickets/.last-processed`

## File Structure

```
.tickets/
├── .last-processed          # Last processed ticket ID
├── ticket-123.trigger       # Trigger file (created on ticket creation)
└── ticket-123.processing    # Processing file (created by auto-processor)
```

## Configuration

### Polling Interval

Default: 2000ms (2 seconds)

To change, modify `POLL_INTERVAL` in `scripts/auto-ticket-processor.js`:

```javascript
const POLL_INTERVAL = 5000; // 5 seconds
```

### Ticket Priority

Tickets are processed in priority order:
1. Critical (4)
2. High (3)
3. Medium (2)
4. Low (1)

Within same priority, older tickets are processed first.

## Integration with Cursor

### Automatic Detection

Cursor can be configured to:
1. Watch `.tickets/` directory for new `.processing` files
2. Automatically call `work_tickets_start` when files appear
3. Process tickets sequentially

### Manual Trigger

You can still manually trigger ticket processing:
- Say "work tickets" to Cursor
- Use `work_tickets_start` MCP tool
- Check for new tickets with `auto_tickets_check`

## Troubleshooting

### Processor Not Running

- Check if script is running: `ps aux | grep auto-ticket-processor`
- Check logs for errors
- Verify `.tickets/` directory exists and is writable

### Tickets Not Being Processed

- Check trigger files exist: `ls .tickets/ticket-*.trigger`
- Check processing files: `ls .tickets/ticket-*.processing`
- Verify last processed ID: `cat .tickets/.last-processed`
- Check database for open tickets: `SELECT * FROM debug_todos WHERE status = 'open'`

### Duplicate Processing

- The system tracks last processed ID to avoid duplicates
- Only tickets with ID > last processed ID are considered
- Processing files are created once per ticket

## Future Enhancements

- WebSocket notifications for real-time ticket creation
- Priority-based queuing system
- Batch processing for multiple tickets
- Integration with Cursor's background task system
- Email/notification system for ticket status updates

