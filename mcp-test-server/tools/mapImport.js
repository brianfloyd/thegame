/**
 * Map Import/Export Tools - MCP tools for map import/export operations
 * 
 * Provides:
 * - Export maps to canonical JSON format
 * - Import maps from canonical JSON format
 * - Validate import data
 * - List all maps
 */

import * as verifier from '../src/StateVerifier.js';

export const mapImportTools = [
  {
    name: 'map_export',
    description: 'Export a map to canonical JSON format. Returns map data including all rooms and connections.',
    inputSchema: {
      type: 'object',
      properties: {
        mapId: {
          type: 'number',
          description: 'Map ID to export',
        },
        mapName: {
          type: 'string',
          description: 'Map name to export (alternative to mapId)',
        },
      },
    },
  },
  {
    name: 'map_import',
    description: 'Import a map from canonical JSON format. Creates a new map with all rooms and connections.',
    inputSchema: {
      type: 'object',
      properties: {
        importData: {
          type: 'string',
          description: 'Map data in canonical JSON format (as JSON string)',
        },
        entranceRoom: {
          type: 'object',
          description: 'Entrance room coordinates {x, y} in the imported map (optional)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
        connectionRoomId: {
          type: 'number',
          description: 'Room ID in existing map to connect to (optional)',
        },
        connectionDirection: {
          type: 'string',
          description: 'Direction from connection room (N, S, E, W) (optional)',
          enum: ['N', 'S', 'E', 'W'],
        },
      },
      required: ['importData'],
    },
  },
  {
    name: 'map_validate',
    description: 'Validate map import data without importing. Returns validation errors and warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        importData: {
          type: 'string',
          description: 'Map data in canonical JSON format (as JSON string)',
        },
      },
      required: ['importData'],
    },
  },
  {
    name: 'map_list',
    description: 'List all maps with basic information including room counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Export a map to canonical JSON format
 */
async function exportMapData(mapId) {
  const map = await verifier.queryOne('SELECT * FROM maps WHERE id = $1', [mapId]);
  if (!map) {
    throw new Error('Map not found');
  }

  const rooms = await verifier.query('SELECT * FROM rooms WHERE map_id = $1', [mapId]);
  
  // Build rooms array in canonical format
  const roomsData = rooms.map(room => {
    const roomData = {
      x: room.x,
      y: room.y,
      name: room.name,
      description: room.description,
      room_type: room.room_type || 'normal'
    };
    
    // Add optional factory fields if present
    if (room.factory_tier !== null && room.factory_tier !== undefined) {
      roomData.factory_tier = room.factory_tier;
    }
    if (room.factory_quirks) {
      roomData.factory_quirks = typeof room.factory_quirks === 'string' 
        ? JSON.parse(room.factory_quirks) 
        : room.factory_quirks;
    }
    
    return roomData;
  });

  // Build map_connections array (only connections to OTHER maps)
  const mapConnections = [];
  for (const room of rooms) {
    if (room.connected_map_id && room.connected_map_id !== mapId) {
      const targetMap = await verifier.queryOne('SELECT * FROM maps WHERE id = $1', [room.connected_map_id]);
      if (targetMap) {
        mapConnections.push({
          source_room: { x: room.x, y: room.y },
          target_map_name: targetMap.name,
          target_room: { x: room.connected_room_x, y: room.connected_room_y },
          direction: room.connection_direction
        });
      }
    }
  }

  return {
    format_version: '1.0',
    map: {
      name: map.name,
      width: map.width,
      height: map.height,
      description: map.description || null
    },
    rooms: roomsData,
    map_connections: mapConnections
  };
}

/**
 * Validate map import data
 */
async function validateMapImportData(importData) {
  const errors = [];
  const warnings = [];

  // Check format version
  if (!importData.format_version) {
    errors.push('Missing format_version field');
  } else if (importData.format_version !== '1.0') {
    warnings.push(`Unknown format_version: ${importData.format_version}. Expected 1.0`);
  }

  // Check map data
  if (!importData.map) {
    errors.push('Missing map field');
  } else {
    if (!importData.map.name) {
      errors.push('Map name is required');
    }
    if (importData.map.width === undefined || importData.map.width === null) {
      errors.push('Map width is required');
    }
    if (importData.map.height === undefined || importData.map.height === null) {
      errors.push('Map height is required');
    }
  }

  // Check rooms array
  if (!Array.isArray(importData.rooms)) {
    errors.push('Rooms must be an array');
  } else {
    const coordSet = new Set();
    const validRoomTypes = await verifier.query('SELECT room_type FROM room_type_colors ORDER BY room_type');
    const validRoomTypeSet = new Set(validRoomTypes.map(rt => rt.room_type));

    for (let i = 0; i < importData.rooms.length; i++) {
      const room = importData.rooms[i];
      const prefix = `Room ${i + 1}`;

      // Check required fields
      if (room.x === undefined || room.x === null) {
        errors.push(`${prefix}: Missing x coordinate`);
      }
      if (room.y === undefined || room.y === null) {
        errors.push(`${prefix}: Missing y coordinate`);
      }
      if (!room.name) {
        errors.push(`${prefix}: Missing name`);
      }
      if (!room.description) {
        errors.push(`${prefix}: Missing description`);
      }
      if (!room.room_type) {
        errors.push(`${prefix}: Missing room_type`);
      }

      // Check for duplicate coordinates
      if (room.x !== undefined && room.y !== undefined) {
        const coordKey = `${room.x},${room.y}`;
        if (coordSet.has(coordKey)) {
          errors.push(`${prefix}: Duplicate coordinates (${room.x}, ${room.y})`);
        }
        coordSet.add(coordKey);
      }

      // Check room type validity
      if (room.room_type && !validRoomTypeSet.has(room.room_type)) {
        errors.push(`${prefix}: Invalid room_type "${room.room_type}". Valid types: ${Array.from(validRoomTypeSet).join(', ')}`);
      }

      // Check factory tier if present
      if (room.factory_tier !== undefined && room.factory_tier !== null) {
        if (typeof room.factory_tier !== 'number' || room.factory_tier < 1 || room.factory_tier > 5) {
          errors.push(`${prefix}: factory_tier must be between 1 and 5, got ${room.factory_tier}`);
        }
        if (room.room_type !== 'factory') {
          warnings.push(`${prefix}: factory_tier specified but room_type is not 'factory'`);
        }
      }

      // Check factory_quirks if present
      if (room.factory_quirks !== undefined && room.factory_quirks !== null) {
        if (typeof room.factory_quirks !== 'object' || Array.isArray(room.factory_quirks)) {
          errors.push(`${prefix}: factory_quirks must be an object`);
        }
        if (room.room_type !== 'factory') {
          warnings.push(`${prefix}: factory_quirks specified but room_type is not 'factory'`);
        }
      }
    }
  }

  // Check map_connections array
  if (importData.map_connections !== undefined && !Array.isArray(importData.map_connections)) {
    errors.push('map_connections must be an array');
  } else if (Array.isArray(importData.map_connections)) {
    for (let i = 0; i < importData.map_connections.length; i++) {
      const conn = importData.map_connections[i];
      const prefix = `Map connection ${i + 1}`;

      if (!conn.source_room || conn.source_room.x === undefined || conn.source_room.y === undefined) {
        errors.push(`${prefix}: Missing or invalid source_room`);
      }
      if (!conn.target_map_name) {
        errors.push(`${prefix}: Missing target_map_name`);
      }
      if (!conn.target_room || conn.target_room.x === undefined || conn.target_room.y === undefined) {
        errors.push(`${prefix}: Missing or invalid target_room`);
      }
      if (!conn.direction || !['N', 'S', 'E', 'W'].includes(conn.direction)) {
        errors.push(`${prefix}: Invalid direction. Must be N, S, E, or W`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Import a map from canonical JSON format
 */
async function importMapData(importData, entranceRoomCoords = null, connectionRoomId = null, connectionDirection = null) {
  // Validate first
  const validation = await validateMapImportData(importData);
  if (validation.errors.length > 0) {
    throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
  }

  // Check if map name already exists
  const existingMap = await verifier.queryOne('SELECT * FROM maps WHERE name = $1', [importData.map.name]);
  if (existingMap) {
    throw new Error(`Map with name "${importData.map.name}" already exists`);
  }

  // Validate entrance room if specified
  if (entranceRoomCoords) {
    const entranceExists = importData.rooms.some(
      r => r.x === entranceRoomCoords.x && r.y === entranceRoomCoords.y
    );
    if (!entranceExists) {
      throw new Error(`Entrance room at (${entranceRoomCoords.x}, ${entranceRoomCoords.y}) not found in import data`);
    }
  }

  // Validate connection if specified
  if (connectionRoomId || connectionDirection) {
    if (!connectionRoomId || !connectionDirection) {
      throw new Error('Both connectionRoomId and connectionDirection must be provided for connection');
    }
    if (!['N', 'S', 'E', 'W'].includes(connectionDirection)) {
      throw new Error('connectionDirection must be N, S, E, or W');
    }
    const connectionRoom = await verifier.queryOne('SELECT * FROM rooms WHERE id = $1', [connectionRoomId]);
    if (!connectionRoom) {
      throw new Error('Connection room not found');
    }
    if (connectionRoom.connected_map_id && connectionRoom.connection_direction === connectionDirection) {
      throw new Error(`Connection room already has a connection in direction ${connectionDirection}`);
    }
  }

  // Use transaction for atomic import
  const pool = verifier.getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create map
    const mapResult = await client.query(
      'INSERT INTO maps (name, width, height, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [importData.map.name, importData.map.width, importData.map.height, importData.map.description || null]
    );
    const newMapId = mapResult.rows[0].id;

    // Create all rooms
    let roomsCreated = 0;
    const roomCoordMap = new Map(); // Track created rooms by coordinates

    for (const roomData of importData.rooms) {
      const roomResult = await client.query(
        `INSERT INTO rooms (name, description, x, y, map_id, room_type, factory_tier, factory_quirks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          roomData.name,
          roomData.description,
          roomData.x,
          roomData.y,
          newMapId,
          roomData.room_type || 'normal',
          roomData.factory_tier || null,
          roomData.factory_quirks ? JSON.stringify(roomData.factory_quirks) : null
        ]
      );
      roomCoordMap.set(`${roomData.x},${roomData.y}`, roomResult.rows[0].id);
      roomsCreated++;
    }

    // Create map connections (to other existing maps)
    let connectionsCreated = 0;
    if (Array.isArray(importData.map_connections)) {
      for (const conn of importData.map_connections) {
        const targetMap = await verifier.queryOne('SELECT * FROM maps WHERE name = $1', [conn.target_map_name]);
        if (!targetMap) {
          validation.warnings.push(`Skipping connection: target map "${conn.target_map_name}" not found`);
          continue;
        }

        const targetRoom = await verifier.queryOne(
          'SELECT * FROM rooms WHERE map_id = $1 AND x = $2 AND y = $3',
          [targetMap.id, conn.target_room.x, conn.target_room.y]
        );
        if (!targetRoom) {
          validation.warnings.push(`Skipping connection: target room at (${conn.target_room.x}, ${conn.target_room.y}) not found in map "${conn.target_map_name}"`);
          continue;
        }

        // Get source room ID
        const sourceRoomId = roomCoordMap.get(`${conn.source_room.x},${conn.source_room.y}`);
        if (!sourceRoomId) {
          validation.warnings.push(`Skipping connection: source room at (${conn.source_room.x}, ${conn.source_room.y}) not found in import data`);
          continue;
        }

        // Calculate opposite direction
        const oppositeDir = {
          'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E'
        };
        const targetDirection = oppositeDir[conn.direction];

        // Update source room (new map) with connection
        await client.query(
          `UPDATE rooms SET connected_map_id = $1, connected_room_x = $2, connected_room_y = $3, connection_direction = $4 WHERE id = $5`,
          [targetMap.id, conn.target_room.x, conn.target_room.y, conn.direction, sourceRoomId]
        );

        // Update target room (existing map) with reverse connection
        await client.query(
          `UPDATE rooms SET connected_map_id = $1, connected_room_x = $2, connected_room_y = $3, connection_direction = $4 WHERE id = $5`,
          [newMapId, conn.source_room.x, conn.source_room.y, targetDirection, targetRoom.id]
        );

        connectionsCreated++;
      }
    }

    // Create connection to existing map if specified
    if (connectionRoomId && connectionDirection && entranceRoomCoords) {
      const entranceRoomId = roomCoordMap.get(`${entranceRoomCoords.x},${entranceRoomCoords.y}`);
      if (!entranceRoomId) {
        throw new Error(`Entrance room at (${entranceRoomCoords.x}, ${entranceRoomCoords.y}) not found in created rooms`);
      }

      const connectionRoom = await verifier.queryOne('SELECT * FROM rooms WHERE id = $1', [connectionRoomId]);
      const oppositeDir = {
        'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E'
      };
      const entranceDirection = oppositeDir[connectionDirection];

      // Update connection room (existing map) with connection to new map
      await client.query(
        `UPDATE rooms SET connected_map_id = $1, connected_room_x = $2, connected_room_y = $3, connection_direction = $4 WHERE id = $5`,
        [newMapId, entranceRoomCoords.x, entranceRoomCoords.y, connectionDirection, connectionRoomId]
      );

      // Update entrance room (new map) with reverse connection
      await client.query(
        `UPDATE rooms SET connected_map_id = $1, connected_room_x = $2, connected_room_y = $3, connection_direction = $4 WHERE id = $5`,
        [connectionRoom.map_id, connectionRoom.x, connectionRoom.y, entranceDirection, entranceRoomId]
      );

      connectionsCreated++;
    }

    await client.query('COMMIT');

    return {
      mapId: newMapId,
      roomsCreated,
      connectionsCreated,
      warnings: validation.warnings
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle map import tool calls
 */
export async function handleMapImportTool(name, args) {
  try {
    switch (name) {
      case 'map_export': {
        const { mapId, mapName } = args;
        
        let targetMapId = mapId;
        if (!targetMapId && mapName) {
          const map = await verifier.queryOne('SELECT * FROM maps WHERE name = $1', [mapName]);
          if (!map) {
            return {
              content: [{ type: 'text', text: `Map "${mapName}" not found.` }],
              isError: true,
            };
          }
          targetMapId = map.id;
        }
        
        if (!targetMapId) {
          return {
            content: [{ type: 'text', text: 'Either mapId or mapName must be provided.' }],
            isError: true,
          };
        }

        const exportData = await exportMapData(targetMapId);
        return {
          content: [
            {
              type: 'text',
              text: `Map exported successfully:\n${JSON.stringify(exportData, null, 2)}`,
            },
          ],
        };
      }

      case 'map_import': {
        const { importData, entranceRoom, connectionRoomId, connectionDirection } = args;
        
        if (!importData) {
          return {
            content: [{ type: 'text', text: 'importData is required.' }],
            isError: true,
          };
        }

        // Parse JSON if string
        let parsedImportData = importData;
        if (typeof importData === 'string') {
          try {
            parsedImportData = JSON.parse(importData);
          } catch (e) {
            return {
              content: [{ type: 'text', text: `Invalid JSON in importData: ${e.message}` }],
              isError: true,
            };
          }
        }

        const result = await importMapData(
          parsedImportData,
          entranceRoom || null,
          connectionRoomId || null,
          connectionDirection || null
        );

        let message = `Map imported successfully!\n`;
        message += `- Map ID: ${result.mapId}\n`;
        message += `- Rooms created: ${result.roomsCreated}\n`;
        message += `- Connections created: ${result.connectionsCreated}\n`;
        if (result.warnings.length > 0) {
          message += `\nWarnings:\n${result.warnings.map(w => `- ${w}`).join('\n')}`;
        }

        return {
          content: [{ type: 'text', text: message }],
        };
      }

      case 'map_validate': {
        const { importData } = args;
        
        if (!importData) {
          return {
            content: [{ type: 'text', text: 'importData is required.' }],
            isError: true,
          };
        }

        // Parse JSON if string
        let parsedImportData = importData;
        if (typeof importData === 'string') {
          try {
            parsedImportData = JSON.parse(importData);
          } catch (e) {
            return {
              content: [{ type: 'text', text: `Invalid JSON in importData: ${e.message}` }],
              isError: true,
            };
          }
        }

        const validation = await validateMapImportData(parsedImportData);

        let message = 'Validation Results:\n\n';
        if (validation.errors.length === 0) {
          message += '✓ No errors found.\n';
        } else {
          message += `✗ Found ${validation.errors.length} error(s):\n`;
          validation.errors.forEach(err => {
            message += `  - ${err}\n`;
          });
        }
        if (validation.warnings.length > 0) {
          message += `\n⚠ Found ${validation.warnings.length} warning(s):\n`;
          validation.warnings.forEach(warn => {
            message += `  - ${warn}\n`;
          });
        }

        return {
          content: [{ type: 'text', text: message }],
          isError: validation.errors.length > 0,
        };
      }

      case 'map_list': {
        const maps = await verifier.query('SELECT id, name, width, height, description FROM maps ORDER BY id');
        
        const mapsWithCounts = await Promise.all(
          maps.map(async (map) => {
            const roomCount = await verifier.queryOne(
              'SELECT COUNT(*) as count FROM rooms WHERE map_id = $1',
              [map.id]
            );
            return {
              id: map.id,
              name: map.name,
              width: map.width,
              height: map.height,
              description: map.description,
              roomCount: parseInt(roomCount.count, 10)
            };
          })
        );

        return {
          content: [
            {
              type: 'text',
              text: `Found ${mapsWithCounts.length} map(s):\n${JSON.stringify(mapsWithCounts, null, 2)}`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown map import tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error in map import tool ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
