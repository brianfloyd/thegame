# MCP Test Server for The Game

An MCP (Model Context Protocol) server that provides tools for automated game testing. This allows AI assistants to connect to the game, execute commands, observe responses, verify game state, and run comprehensive test suites.

## Installation

```bash
cd mcp-test-server
npm install
```

## Configuration

Add the following to your `~/.cursor/mcp.json` file:

```json
{
  "mcpServers": {
    "game-tests": {
      "command": "node",
      "args": ["c:\\thegame\\mcp-test-server\\index.js"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:password@localhost:5432/thegame",
        "GAME_WS_URL": "ws://localhost:3000",
        "GAME_HTTP_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Note:** Replace the `DATABASE_URL` with your actual PostgreSQL connection string.

## Available MCP Tools

### Connection Tools

| Tool | Description |
|------|-------------|
| `test_connect` | Connect to game as test player |
| `test_disconnect` | Disconnect from game |
| `test_get_session_state` | Get current session state |

### Command Tools

| Tool | Description |
|------|-------------|
| `test_send_command` | Send a game command (harvest, attune, move, look, etc.) |
| `test_wait_for_message` | Wait for specific message type |
| `test_get_message_history` | Get recent messages |

### Verification Tools

| Tool | Description |
|------|-------------|
| `test_verify_player_stats` | Verify player stats match expected |
| `test_verify_room_state` | Verify room contents |
| `test_verify_inventory` | Verify inventory items |
| `test_verify_message_received` | Check for specific message |

### Setup Tools

| Tool | Description |
|------|-------------|
| `test_setup_player` | Create/update test player |
| `test_setup_npc` | Configure NPC |
| `test_setup_item` | Add item to inventory/room |
| `test_cleanup` | Clean up test data |

### SQL Tools

| Tool | Description |
|------|-------------|
| `sql_query` | Execute SELECT query |
| `sql_execute` | Execute INSERT/UPDATE/DELETE |
| `sql_get_tables` | List tables and columns |
| `sql_get_player` | Get player with inventory/bank |
| `sql_get_npcs` | Get NPCs by room/name |
| `sql_get_rooms` | Get rooms by map/coords |
| `sql_get_items` | Get item definitions |
| `sql_update_player_stat` | Update player stat |
| `sql_get_formula_configs` | Get formula configurations |

## Example Usage

### Connect and Send Commands

```
1. Use test_connect to connect to the game
2. Use test_send_command with command="look" to see the room
3. Use test_send_command with command="harvest" target="Glowroot Pulsecap"
4. Use test_wait_for_message with messageType="message" to see responses
```

### Verify Game State

```
1. Use sql_get_player with playerName="Fliz" to see all stats
2. Use test_verify_player_stats with expectedStats={ pulse_echoes: 10 }
3. Use sql_get_formula_configs to see harvest formulas
```

### Database Queries

```
1. Use sql_get_tables to list all tables
2. Use sql_query with query="SELECT * FROM players WHERE name = $1" params=["Fliz"]
3. Use sql_update_player_stat to modify player stats for testing
```

## Running Test Suites

```bash
# Run all tests
npm test

# Run specific tests
node tests/run-tests.js pulse
node tests/run-tests.js attunement
```

## Project Structure

```
mcp-test-server/
├── package.json
├── index.js              # MCP server entry point
├── src/
│   ├── GameClient.js     # WebSocket client
│   ├── TestSession.js    # Test session manager
│   ├── MessageQueue.js   # Message handling
│   └── StateVerifier.js  # Database verification
├── tools/
│   ├── connection.js     # Connection MCP tools
│   ├── commands.js       # Command MCP tools
│   ├── verification.js   # Verification MCP tools
│   ├── setup.js          # Setup MCP tools
│   └── sql.js            # SQL MCP tools
└── tests/
    ├── framework.js      # Test framework
    ├── run-tests.js      # Test runner
    └── suites/
        ├── pulse-echoes.test.js
        └── attunement.test.js
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `GAME_WS_URL` | Game WebSocket URL | `ws://localhost:3000` |
| `GAME_HTTP_URL` | Game HTTP URL | `http://localhost:3000` |


