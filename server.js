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
    north: db.getRoomByCoords(room.x, room.y + 1) !== undefined,
    south: db.getRoomByCoords(room.x, room.y - 1) !== undefined,
    east: db.getRoomByCoords(room.x + 1, room.y) !== undefined,
    west: db.getRoomByCoords(room.x - 1, room.y) !== undefined,
    northeast: db.getRoomByCoords(room.x + 1, room.y + 1) !== undefined,
    northwest: db.getRoomByCoords(room.x - 1, room.y + 1) !== undefined,
    southeast: db.getRoomByCoords(room.x + 1, room.y - 1) !== undefined,
    southwest: db.getRoomByCoords(room.x - 1, room.y - 1) !== undefined,
    up: false, // Will be implemented when z coordinate is added
    down: false // Will be implemented when z coordinate is added
  };
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

  playerData.ws.send(JSON.stringify({
    type: 'roomUpdate',
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      x: room.x,
      y: room.y
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

        // Send map data
        const allRooms = db.getAllRooms();
        ws.send(JSON.stringify({
          type: 'mapData',
          rooms: allRooms.map(r => ({
            id: r.id,
            name: r.name,
            x: r.x,
            y: r.y
          })),
          currentRoom: {
            x: room.x,
            y: room.y
          }
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

        // Calculate target coordinates
        let targetX = currentRoom.x;
        let targetY = currentRoom.y;
        const direction = data.direction.toUpperCase();

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

        // Check if target room exists
        const targetRoom = db.getRoomByCoords(targetX, targetY);
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
        if (playerData.ws.readyState === WebSocket.OPEN) {
          playerData.ws.send(JSON.stringify({
            type: 'moved',
            room: {
              id: targetRoom.id,
              name: targetRoom.name,
              description: targetRoom.description,
              x: targetRoom.x,
              y: targetRoom.y
            },
            players: playersInNewRoom,
            exits: exits
          }));

          // Update map with new current room
          playerData.ws.send(JSON.stringify({
            type: 'mapUpdate',
            currentRoom: {
              x: targetRoom.x,
              y: targetRoom.y
            }
          }));
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

