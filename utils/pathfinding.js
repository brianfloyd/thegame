/**
 * Pathfinding utility for Auto-Pathing feature
 * Uses Breadth-First Search (BFS) to find shortest path between rooms
 */

/**
 * Get all adjacent rooms for a given room
 * @param {object} room - Room object with x, y, map_id, connection_direction, connected_map_id
 * @param {object} db - Database module
 * @returns {Promise<Array>} Array of { room, direction } objects
 */
async function getAdjacentRooms(room, db) {
  const adjacent = [];
  
  // Check all 8 cardinal and diagonal directions
  const directions = [
    { dir: 'N', dx: 0, dy: 1 },
    { dir: 'S', dx: 0, dy: -1 },
    { dir: 'E', dx: 1, dy: 0 },
    { dir: 'W', dx: -1, dy: 0 },
    { dir: 'NE', dx: 1, dy: 1 },
    { dir: 'NW', dx: -1, dy: 1 },
    { dir: 'SE', dx: 1, dy: -1 },
    { dir: 'SW', dx: -1, dy: -1 }
  ];
  
  for (const { dir, dx, dy } of directions) {
    // Check if room has a map connection in this direction
    if (room.connection_direction === dir && room.connected_map_id) {
      // This is a map transition - get the connected room
      const connectedRoom = await db.getRoomByCoords(
        room.connected_map_id,
        room.connected_room_x,
        room.connected_room_y
      );
      if (connectedRoom) {
        adjacent.push({ room: connectedRoom, direction: dir });
      }
    } else {
      // Normal adjacent room in same map
      const targetX = room.x + dx;
      const targetY = room.y + dy;
      const adjacentRoom = await db.getRoomByCoords(room.map_id, targetX, targetY);
      if (adjacentRoom) {
        adjacent.push({ room: adjacentRoom, direction: dir });
      }
    }
  }
  
  return adjacent;
}

/**
 * Find shortest path from start room to target room using BFS
 * Works across multiple maps using connecting rooms
 * @param {number} startRoomId - Starting room ID
 * @param {number} targetRoomId - Target room ID
 * @param {object} db - Database module
 * @returns {Promise<Array|null>} Array of { roomId, direction, roomName, mapId, mapName } objects, or null if no path
 */
async function findPath(startRoomId, targetRoomId, db) {
  // Get start and target rooms
  const startRoom = await db.getRoomById(startRoomId);
  const targetRoom = await db.getRoomById(targetRoomId);
  
  if (!startRoom || !targetRoom) {
    return null;
  }
  
  // If already at target, return empty path
  if (startRoomId === targetRoomId) {
    return [];
  }
  
  // Get map names for path display
  const startMap = await db.getMapById(startRoom.map_id);
  const targetMap = await db.getMapById(targetRoom.map_id);
  const mapNameCache = new Map();
  if (startMap) mapNameCache.set(startRoom.map_id, startMap.name);
  if (targetMap) mapNameCache.set(targetRoom.map_id, targetMap.name);
  
  // BFS implementation - works across maps
  const queue = [{ room: startRoom, path: [] }];
  const visited = new Set([`${startRoom.map_id}:${startRoomId}`]); // Use map:roomId to track visited across maps
  
  while (queue.length > 0) {
    const { room, path } = queue.shift();
    
    // Get all adjacent rooms (including cross-map connections)
    const adjacent = await getAdjacentRooms(room, db);
    
    for (const { room: nextRoom, direction } of adjacent) {
      // Create unique key for visited check (map:roomId)
      const visitKey = `${nextRoom.map_id}:${nextRoom.id}`;
      
      // Check if we've reached the target (regardless of map)
      if (nextRoom.id === targetRoomId) {
        // Get map name if not cached
        let mapName = mapNameCache.get(nextRoom.map_id);
        if (!mapName) {
          const map = await db.getMapById(nextRoom.map_id);
          if (map) {
            mapName = map.name;
            mapNameCache.set(nextRoom.map_id, mapName);
          }
        }
        
        return [...path, { 
          roomId: nextRoom.id, 
          direction, 
          roomName: nextRoom.name,
          mapId: nextRoom.map_id,
          mapName: mapName || 'Unknown Map'
        }];
      }
      
      // If not visited, add to queue
      if (!visited.has(visitKey)) {
        visited.add(visitKey);
        
        // Get map name if not cached
        let mapName = mapNameCache.get(nextRoom.map_id);
        if (!mapName) {
          const map = await db.getMapById(nextRoom.map_id);
          if (map) {
            mapName = map.name;
            mapNameCache.set(nextRoom.map_id, mapName);
          }
        }
        
        queue.push({
          room: nextRoom,
          path: [...path, { 
            roomId: nextRoom.id, 
            direction, 
            roomName: nextRoom.name,
            mapId: nextRoom.map_id,
            mapName: mapName || 'Unknown Map'
          }]
        });
      }
    }
  }
  
  // No path found
  return null;
}

module.exports = {
  findPath,
  getAdjacentRooms
};

