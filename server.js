const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Track connected players: playerName -> { ws, roomId }
const connectedPlayers = new Map();

// Helper function to get available exits for a room
function getExits(room) {
  const exits = {
    north: false,
    south: false,
    east: false,
    west: false,
    northeast: false,
    northwest: false,
    southeast: false,
    southwest: false,
    up: false, // Will be implemented when z coordinate is added
    down: false // Will be implemented when z coordinate is added
  };
  
  // Check for map connections first
  if (room.connection_direction === 'N' && room.connected_map_id) {
    exits.north = true;
  }
  if (room.connection_direction === 'S' && room.connected_map_id) {
    exits.south = true;
  }
  if (room.connection_direction === 'E' && room.connected_map_id) {
    exits.east = true;
  }
  if (room.connection_direction === 'W' && room.connected_map_id) {
    exits.west = true;
  }
  
  // Check for adjacent rooms in same map (only if no map connection in that direction)
  if (!exits.north) {
    exits.north = db.getRoomByCoords(room.map_id, room.x, room.y + 1) !== undefined;
  }
  if (!exits.south) {
    exits.south = db.getRoomByCoords(room.map_id, room.x, room.y - 1) !== undefined;
  }
  if (!exits.east) {
    exits.east = db.getRoomByCoords(room.map_id, room.x + 1, room.y) !== undefined;
  }
  if (!exits.west) {
    exits.west = db.getRoomByCoords(room.map_id, room.x - 1, room.y) !== undefined;
  }
  
  // Diagonal directions (no map connections for these yet)
  exits.northeast = db.getRoomByCoords(room.map_id, room.x + 1, room.y + 1) !== undefined;
  exits.northwest = db.getRoomByCoords(room.map_id, room.x - 1, room.y + 1) !== undefined;
  exits.southeast = db.getRoomByCoords(room.map_id, room.x + 1, room.y - 1) !== undefined;
  exits.southwest = db.getRoomByCoords(room.map_id, room.x - 1, room.y - 1) !== undefined;
  
  return exits;
}

// Helper function to get connected players in a room
function getConnectedPlayersInRoom(roomId) {
  const players = [];
  connectedPlayers.forEach((playerData, playerName) => {
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      players.push(playerName);
    }
  });
  return players;
}

// Helper function to send room update to a player
function sendRoomUpdate(playerName, room) {
  const playerData = connectedPlayers.get(playerName);
  if (!playerData || !playerData.ws || playerData.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  // Only get connected players in the room, excluding the current player
  const playersInRoom = getConnectedPlayersInRoom(room.id).filter(p => p !== playerName);
  const exits = getExits(room);
  
  // Get map name
  const map = db.getMapById(room.map_id);
  const mapName = map ? map.name : '';

  playerData.ws.send(JSON.stringify({
    type: 'roomUpdate',
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      x: room.x,
      y: room.y,
      mapName: mapName
    },
    players: playersInRoom,
    exits: exits
  }));
}

// Helper function to broadcast to all players in a room
function broadcastToRoom(roomId, message, excludePlayer = null) {
  connectedPlayers.forEach((playerData, playerName) => {
    if (playerName === excludePlayer) return;
    if (playerData.roomId === roomId && playerData.ws.readyState === WebSocket.OPEN) {
      playerData.ws.send(JSON.stringify(message));
    }
  });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'selectPlayer') {
        const playerName = data.playerName;
        const player = db.getPlayerByName(playerName);

        if (!player) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
          return;
        }

        // Check if player is already connected
        if (connectedPlayers.has(playerName)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player already connected' }));
          return;
        }

        // Store connection
        const room = db.getRoomById(player.current_room_id);
        connectedPlayers.set(playerName, { ws, roomId: room.id });

        // Send initial room update
        sendRoomUpdate(playerName, room);

        // Send player stats
        ws.send(JSON.stringify({
          type: 'playerStats',
          stats: {
            bruteStrength: player.brute_strength,
            lifeForce: player.life_force,
            cunning: player.cunning,
            intelligence: player.intelligence,
            wisdom: player.wisdom,
            crafting: player.crafting,
            lockpicking: player.lockpicking,
            stealth: player.stealth,
            dodge: player.dodge,
            criticalHit: player.critical_hit,
            hitPoints: player.hit_points,
            maxHitPoints: player.max_hit_points,
            mana: player.mana,
            maxMana: player.max_mana
          }
        }));

        // Send map data (rooms from current map + preview of connected maps)
        const mapRooms = db.getRoomsByMap(room.map_id);
        const allRooms = mapRooms.map(r => ({
          id: r.id,
          name: r.name,
          x: r.x,
          y: r.y,
          mapId: r.map_id
        }));
        
        // Connection info for coordinate transformation
        let connectionInfo = null;
        
        // If this room has a map connection, include preview rooms from connected map
        if (room.connected_map_id) {
          connectionInfo = {
            direction: room.connection_direction,
            currentMapX: room.x,
            currentMapY: room.y,
            connectedMapX: room.connected_room_x,
            connectedMapY: room.connected_room_y
          };
          
          const connectedMapRooms = db.getRoomsByMap(room.connected_map_id);
          // Get rooms near the connection point (within 5 units)
          // Always include the connection room itself
          const connectionX = room.connected_room_x;
          const connectionY = room.connected_room_y;
          const previewRooms = connectedMapRooms
            .filter(r => {
              // Always include the exact connection room
              if (r.x === connectionX && r.y === connectionY) return true;
              // Include rooms within 5 units of connection
              const dx = Math.abs(r.x - connectionX);
              const dy = Math.abs(r.y - connectionY);
              return dx <= 5 && dy <= 5;
            })
            .map(r => ({
              id: r.id,
              name: r.name,
              x: r.x,
              y: r.y,
              mapId: r.map_id,
              isPreview: true, // Mark as preview room
              originalX: r.x,
              originalY: r.y
            }));
          allRooms.push(...previewRooms);
        }
        
        ws.send(JSON.stringify({
          type: 'mapData',
          rooms: allRooms,
          currentRoom: {
            x: room.x,
            y: room.y
          },
          mapId: room.map_id,
          connectionInfo: connectionInfo
        }));

        // Notify others in the room
        broadcastToRoom(room.id, {
          type: 'playerJoined',
          playerName: playerName
        }, playerName);

        console.log(`Player ${playerName} connected in room ${room.name}`);
      }

      else if (data.type === 'move') {
        // Find player by WebSocket connection
        let currentPlayerName = null;
        connectedPlayers.forEach((playerData, name) => {
          if (playerData.ws === ws) {
            currentPlayerName = name;
          }
        });

        if (!currentPlayerName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not selected' }));
          return;
        }

        const player = db.getPlayerByName(currentPlayerName);
        if (!player) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
          return;
        }

        const currentRoom = db.getRoomById(player.current_room_id);
        if (!currentRoom) {
          ws.send(JSON.stringify({ type: 'error', message: 'Current room not found' }));
          return;
        }

        const direction = data.direction.toUpperCase();
        
        // Check if current room has a map connection in this direction
        let targetRoom = null;
        let isMapTransition = false;
        
        if (currentRoom.connection_direction === direction && currentRoom.connected_map_id) {
          // This is a map transition
          isMapTransition = true;
          targetRoom = db.getRoomByCoords(
            currentRoom.connected_map_id,
            currentRoom.connected_room_x,
            currentRoom.connected_room_y
          );
        } else {
          // Normal movement within same map
          let targetX = currentRoom.x;
          let targetY = currentRoom.y;

          // Handle all direction variations
          if (direction === 'N') {
            targetY += 1;
          } else if (direction === 'S') {
            targetY -= 1;
          } else if (direction === 'E') {
            targetX += 1;
          } else if (direction === 'W') {
            targetX -= 1;
          } else if (direction === 'NE') {
            targetX += 1;
            targetY += 1;
          } else if (direction === 'NW') {
            targetX -= 1;
            targetY += 1;
          } else if (direction === 'SE') {
            targetX += 1;
            targetY -= 1;
          } else if (direction === 'SW') {
            targetX -= 1;
            targetY -= 1;
          } else if (direction === 'U' || direction === 'UP') {
            // Up/Down not yet implemented (requires z coordinate)
            ws.send(JSON.stringify({ type: 'error', message: 'Up/Down movement not yet implemented' }));
            return;
          } else if (direction === 'D' || direction === 'DOWN') {
            // Up/Down not yet implemented (requires z coordinate)
            ws.send(JSON.stringify({ type: 'error', message: 'Up/Down movement not yet implemented' }));
            return;
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid direction' }));
            return;
          }

          // Check if target room exists in same map
          targetRoom = db.getRoomByCoords(currentRoom.map_id, targetX, targetY);
        }
        
        if (!targetRoom) {
          // Convert direction code to readable name
          const directionNames = {
            'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west',
            'NE': 'northeast', 'NW': 'northwest', 'SE': 'southeast', 'SW': 'southwest',
            'U': 'up', 'UP': 'up', 'D': 'down', 'DOWN': 'down'
          };
          const directionName = directionNames[direction] || direction.toLowerCase();
          ws.send(JSON.stringify({ type: 'error', message: `Ouch! You walked into the wall to the ${directionName}.` }));
          return;
        }

        // Update player's room
        db.updatePlayerRoom(targetRoom.id, currentPlayerName);
        const playerData = connectedPlayers.get(currentPlayerName);
        const oldRoomId = playerData.roomId;
        playerData.roomId = targetRoom.id;

        // Notify players in old room
        broadcastToRoom(oldRoomId, {
          type: 'playerLeft',
          playerName: currentPlayerName
        }, currentPlayerName);

        // Send moved message to moving player
        // Only get connected players in the new room, excluding the current player
        const playersInNewRoom = getConnectedPlayersInRoom(targetRoom.id).filter(p => p !== currentPlayerName);
        const exits = getExits(targetRoom);
        
        // Get map name
        const map = db.getMapById(targetRoom.map_id);
        const mapName = map ? map.name : '';
        
        if (playerData.ws.readyState === WebSocket.OPEN) {
          playerData.ws.send(JSON.stringify({
            type: 'moved',
            room: {
              id: targetRoom.id,
              name: targetRoom.name,
              description: targetRoom.description,
              x: targetRoom.x,
              y: targetRoom.y,
              mapName: mapName
            },
            players: playersInNewRoom,
            exits: exits
          }));

          // If this was a map transition, send new map data
          if (isMapTransition) {
            const newMapRooms = db.getRoomsByMap(targetRoom.map_id);
            const allRooms = newMapRooms.map(r => ({
              id: r.id,
              name: r.name,
              x: r.x,
              y: r.y,
              mapId: r.map_id
            }));
            
            // Include connection info if this room has a connection back
            let connectionInfo = null;
            if (targetRoom.connected_map_id) {
              connectionInfo = {
                direction: targetRoom.connection_direction,
                currentMapX: targetRoom.x,
                currentMapY: targetRoom.y,
                connectedMapX: targetRoom.connected_room_x,
                connectedMapY: targetRoom.connected_room_y
              };
              
              // Include preview rooms from connected map
              const connectedMapRooms = db.getRoomsByMap(targetRoom.connected_map_id);
              const connectionX = targetRoom.connected_room_x;
              const connectionY = targetRoom.connected_room_y;
              const previewRooms = connectedMapRooms
                .filter(r => {
                  if (r.x === connectionX && r.y === connectionY) return true;
                  const dx = Math.abs(r.x - connectionX);
                  const dy = Math.abs(r.y - connectionY);
                  return dx <= 5 && dy <= 5;
                })
                .map(r => ({
                  id: r.id,
                  name: r.name,
                  x: r.x,
                  y: r.y,
                  mapId: r.map_id,
                  isPreview: true,
                  originalX: r.x,
                  originalY: r.y
                }));
              allRooms.push(...previewRooms);
            }
            
            playerData.ws.send(JSON.stringify({
              type: 'mapData',
              rooms: allRooms,
              currentRoom: {
                x: targetRoom.x,
                y: targetRoom.y
              },
              mapId: targetRoom.map_id,
              connectionInfo: connectionInfo
            }));
          } else {
            // Just update map position
            playerData.ws.send(JSON.stringify({
              type: 'mapUpdate',
              currentRoom: {
                x: targetRoom.x,
                y: targetRoom.y
              },
              mapId: targetRoom.map_id
            }));
          }
        }

        // Notify players in new room
        broadcastToRoom(targetRoom.id, {
          type: 'playerJoined',
          playerName: currentPlayerName
        }, currentPlayerName);

        console.log(`Player ${currentPlayerName} moved from room ${oldRoomId} to room ${targetRoom.id}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    }
  });

  ws.on('close', () => {
    // Find and remove disconnected player
    let disconnectedPlayer = null;
    connectedPlayers.forEach((playerData, playerName) => {
      if (playerData.ws === ws) {
        disconnectedPlayer = playerName;
      }
    });

    if (disconnectedPlayer) {
      const playerData = connectedPlayers.get(disconnectedPlayer);
      const roomId = playerData.roomId;
      connectedPlayers.delete(disconnectedPlayer);

      // Notify others in the room
      broadcastToRoom(roomId, {
        type: 'playerLeft',
        playerName: disconnectedPlayer
      });

      console.log(`Player ${disconnectedPlayer} disconnected`);
    }
  });
});

const PORT = 3434;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

