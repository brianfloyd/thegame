const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const db = require('./database');
const npcLogic = require('./npcLogic');

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
  
  // Get NPCs in the room
  const npcsInRoom = db.getNPCsInRoom(room.id).map(npc => ({
    id: npc.id,
    name: npc.name,
    description: npc.description,
    state: npc.state,
    color: npc.display_color || npc.color || '#00ffff'
  }));
  
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
    npcs: npcsInRoom,
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

        // Send player stats (dynamically extracted using configuration)
        const playerStats = db.getPlayerStats(player);
        ws.send(JSON.stringify({
          type: 'playerStats',
          stats: playerStats || {}
        }));

        // Send map data (only rooms from current map - no preview of connected maps)
        const mapRooms = db.getRoomsByMap(room.map_id);
        const allRooms = mapRooms.map(r => ({
          id: r.id,
          name: r.name,
          x: r.x,
          y: r.y,
          mapId: r.map_id,
          connected_map_id: r.connected_map_id || null // Include connection info for white highlighting
        }));
        
        ws.send(JSON.stringify({
          type: 'mapData',
          rooms: allRooms,
          currentRoom: {
            x: room.x,
            y: room.y
          },
          mapId: room.map_id
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
        
        // Get NPCs in the new room
        const npcsInNewRoom = db.getNPCsInRoom(targetRoom.id).map(npc => ({
          id: npc.id,
          name: npc.name,
          description: npc.description,
          state: npc.state,
          color: npc.color
        }));

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
            npcs: npcsInNewRoom,
            exits: exits
          }));

          // If this was a map transition, send new map data
          if (isMapTransition) {
            // Send map data (only rooms from current map - no preview of connected maps)
            const newMapRooms = db.getRoomsByMap(targetRoom.map_id);
            const allRooms = newMapRooms.map(r => ({
              id: r.id,
              name: r.name,
              x: r.x,
              y: r.y,
              mapId: r.map_id,
              connected_map_id: r.connected_map_id || null // Include connection info for white highlighting
            }));
            
            playerData.ws.send(JSON.stringify({
              type: 'mapData',
              rooms: allRooms,
              currentRoom: {
                x: targetRoom.x,
                y: targetRoom.y
              },
              mapId: targetRoom.map_id
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

      // Map Editor Handlers
      else if (data.type === 'getMapEditorData') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const mapId = data.mapId;
        const map = db.getMapById(mapId);
        if (!map) {
          ws.send(JSON.stringify({ type: 'error', message: 'Map not found' }));
          return;
        }

        const rooms = db.getRoomsByMap(mapId);
        ws.send(JSON.stringify({
          type: 'mapEditorData',
          rooms: rooms.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            x: r.x,
            y: r.y,
            roomType: r.room_type || 'normal',
            mapId: r.map_id,
            connected_map_id: r.connected_map_id,
            connected_room_x: r.connected_room_x,
            connected_room_y: r.connected_room_y,
            connection_direction: r.connection_direction
          })),
          mapId: map.id,
          mapName: map.name
        }));
      }

      else if (data.type === 'createMap') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { name, width, height, description } = data;
        if (!name) {
          ws.send(JSON.stringify({ type: 'error', message: 'Map name required' }));
          return;
        }

        try {
          const mapId = db.createMap(name, width || 100, height || 100, description || '');
          ws.send(JSON.stringify({
            type: 'mapCreated',
            mapId: mapId,
            name: name
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to create map: ' + err.message }));
        }
      }

      else if (data.type === 'createRoom') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { mapId, name, description, x, y, roomType } = data;
        if (!name || mapId === undefined || x === undefined || y === undefined) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
          return;
        }

        // Check if room already exists at these coordinates
        const existing = db.getRoomByCoords(mapId, x, y);
        if (existing) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room already exists at these coordinates' }));
          return;
        }

        try {
          const roomId = db.createRoom(name, description || '', x, y, mapId, roomType || 'normal');
          const room = db.getRoomById(roomId);
          
          // Update map size based on new room
          db.updateMapSize(mapId);
          
          ws.send(JSON.stringify({
            type: 'roomCreated',
            room: {
              id: room.id,
              name: room.name,
              description: room.description,
              x: room.x,
              y: room.y,
              roomType: room.room_type || 'normal',
              mapId: room.map_id
            }
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to create room: ' + err.message }));
        }
      }

      else if (data.type === 'deleteRoom') {
        const { roomId } = data;
        
        if (!roomId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room ID is required' }));
          return;
        }
        
        // Get room to check if it's connected
        const room = db.getRoomById(roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        
        // Check if room is part of a map connection
        if (room.connected_map_id !== null && room.connected_map_id !== undefined) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `Cannot delete room "${room.name}" (${room.x},${room.y}) - it is part of a map connection. Please disconnect it first.` 
          }));
          return;
        }
        
        // Check if any other room connects to this room (incoming connection)
        const allRooms = db.getAllRooms();
        const connectingRoom = allRooms.find(r => 
          r.connected_map_id === room.map_id && 
          r.connected_room_x === room.x && 
          r.connected_room_y === room.y
        );
        
        if (connectingRoom) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `Cannot delete room "${room.name}" (${room.x},${room.y}) - another room connects to it. Please disconnect it first.` 
          }));
          return;
        }
        
        // Delete the room
        db.db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
        
        // Notify client
        ws.send(JSON.stringify({ type: 'roomDeleted', roomId: roomId }));
      }
      else if (data.type === 'updateRoom') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { roomId, name, description, roomType } = data;
        if (!roomId || !name) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
          return;
        }

        try {
          db.updateRoom(roomId, name, description || '', roomType || 'normal');
          const room = db.getRoomById(roomId);
          
          ws.send(JSON.stringify({
            type: 'roomUpdated',
            room: {
              id: room.id,
              name: room.name,
              description: room.description,
              x: room.x,
              y: room.y,
              roomType: room.room_type || 'normal',
              mapId: room.map_id
            }
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to update room: ' + err.message }));
        }
      }

      else if (data.type === 'getAllMaps') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const maps = db.getAllMaps();
        ws.send(JSON.stringify({
          type: 'allMaps',
          maps: maps.map(m => ({ id: m.id, name: m.name }))
        }));
      }

      else if (data.type === 'connectMaps') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { sourceRoomId, sourceDirection, targetMapId, targetX, targetY } = data;
        
        // Get source room
        const sourceRoom = db.getRoomById(sourceRoomId);
        if (!sourceRoom) {
          ws.send(JSON.stringify({ type: 'error', message: 'Source room not found' }));
          return;
        }

        // Validate source room has available exit in requested direction
        const exits = getExits(sourceRoom);
        const directionMap = {
          'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west',
          'NE': 'northeast', 'NW': 'northwest', 'SE': 'southeast', 'SW': 'southwest'
        };
        const exitKey = directionMap[sourceDirection];
        if (!exitKey || exits[exitKey]) {
          ws.send(JSON.stringify({ type: 'error', message: 'Source room already has exit in that direction' }));
          return;
        }

        // Check if target room exists
        const targetRoom = db.getRoomByCoords(targetMapId, targetX, targetY);
        if (!targetRoom) {
          ws.send(JSON.stringify({ type: 'error', message: 'Target room does not exist at those coordinates' }));
          return;
        }

        // Calculate opposite direction
        const oppositeDir = {
          'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
          'NE': 'SW', 'NW': 'SE', 'SE': 'NW', 'SW': 'NE'
        };
        const targetDirection = oppositeDir[sourceDirection];

        // Validate target room has available exit in opposite direction
        const targetExits = getExits(targetRoom);
        const targetExitKey = directionMap[targetDirection];
        if (!targetExitKey || targetExits[targetExitKey]) {
          ws.send(JSON.stringify({ type: 'error', message: 'Target room already has exit in opposite direction' }));
          return;
        }

        // Update source room with connection
        const updateSourceConnection = db.db.prepare(`
          UPDATE rooms 
          SET connected_map_id = ?, connected_room_x = ?, connected_room_y = ?, connection_direction = ?
          WHERE id = ?
        `);
        updateSourceConnection.run(targetMapId, targetX, targetY, sourceDirection, sourceRoomId);

        // Update target room with reverse connection
        const updateTargetConnection = db.db.prepare(`
          UPDATE rooms 
          SET connected_map_id = ?, connected_room_x = ?, connected_room_y = ?, connection_direction = ?
          WHERE id = ?
        `);
        updateTargetConnection.run(sourceRoom.map_id, sourceRoom.x, sourceRoom.y, targetDirection, targetRoom.id);

        // Get updated rooms
        const updatedSource = db.getRoomById(sourceRoomId);
        const updatedTarget = db.getRoomById(targetRoom.id);

        ws.send(JSON.stringify({
          type: 'mapConnected',
          sourceRoom: {
            id: updatedSource.id,
            name: updatedSource.name,
            x: updatedSource.x,
            y: updatedSource.y,
            mapId: updatedSource.map_id
          },
          targetRoom: {
            id: updatedTarget.id,
            name: updatedTarget.name,
            x: updatedTarget.x,
            y: updatedTarget.y,
            mapId: updatedTarget.map_id
          }
        }));
      }

      // NPC Editor Handlers (God Mode)
      else if (data.type === 'getAllNPCs') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const npcs = db.getAllScriptableNPCs();
        ws.send(JSON.stringify({
          type: 'npcList',
          npcs
        }));
      }

      else if (data.type === 'createNPC') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npc: rawNpc } = data;
        const npc = rawNpc || {};
        if (!npc || !npc.name || !npc.npc_type || !npc.base_cycle_time) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required NPC fields' }));
          return;
        }

        if (!npc.display_color) {
          npc.display_color = '#00ff00';
        }

        try {
          const id = db.createScriptableNPC(npc);
          const created = db.getScriptableNPCById(id);
          ws.send(JSON.stringify({
            type: 'npcCreated',
            npc: created
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to create NPC: ' + err.message }));
        }
      }

      else if (data.type === 'updateNPC') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npc: rawNpc } = data;
        const npc = rawNpc || {};
        if (!npc || !npc.id || !npc.name || !npc.npc_type || !npc.base_cycle_time) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing required NPC fields' }));
          return;
        }

        if (!npc.display_color) {
          npc.display_color = '#00ff00';
        }

        try {
          db.updateScriptableNPC(npc);
          const updated = db.getScriptableNPCById(npc.id);
          ws.send(JSON.stringify({
            type: 'npcUpdated',
            npc: updated
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to update NPC: ' + err.message }));
        }
      }

      else if (data.type === 'getNpcPlacements') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npcId } = data;
        if (!npcId) {
          ws.send(JSON.stringify({ type: 'error', message: 'NPC id required' }));
          return;
        }

        const placements = db.getNpcPlacements(npcId);
        ws.send(JSON.stringify({
          type: 'npcPlacements',
          npcId,
          placements
        }));
      }

      else if (data.type === 'getNpcPlacementRooms') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const moonless = db.getMapByName('Moonless Meadow');
        if (!moonless) {
          ws.send(JSON.stringify({ type: 'npcPlacementRooms', error: 'Moonless Meadow map not found' }));
          return;
        }

        const rooms = db.getRoomsForNpcPlacement(moonless.id);
        ws.send(JSON.stringify({
          type: 'npcPlacementRooms',
          map: { id: moonless.id, name: moonless.name },
          rooms
        }));
      }

      else if (data.type === 'addNpcToRoom') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { npcId, roomId, slot } = data;
        if (!npcId || !roomId) {
          ws.send(JSON.stringify({ type: 'error', message: 'NPC id and Room id are required' }));
          return;
        }

        try {
          // placeNPCInRoom enforces Moonless Meadow restriction
          const placementId = db.placeNPCInRoom(npcId, roomId, slot || 0, { cycles: 0 });
          const placements = db.getNpcPlacements(npcId);
          const placement = placements.find(p => p.id === placementId) || null;
          ws.send(JSON.stringify({
            type: 'npcPlacementAdded',
            placement
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to add NPC to room: ' + err.message }));
        }
      }

      else if (data.type === 'removeNpcFromRoom') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { placementId, npcId } = data;
        if (!placementId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Placement id required' }));
          return;
        }

        try {
          db.deleteNpcPlacement(placementId);
          const placements = npcId ? db.getNpcPlacements(npcId) : [];
          ws.send(JSON.stringify({
            type: 'npcPlacementRemoved',
            placementId,
            npcId,
            placements
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to remove NPC from room: ' + err.message }));
        }
      }

      else if (data.type === 'look') {
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
        
        const target = (data.target || '').trim();
        if (!target) {
          // No specific target: send full room update (same as entering room)
          sendRoomUpdate(currentPlayerName, currentRoom);
          return;
        }

        // LOOK at NPC in room by (partial) name match
        const npcsInRoom = db.getNPCsInRoom(currentRoom.id);
        const query = target.toLowerCase();
        const matches = npcsInRoom.filter(npc => 
          npc.name && npc.name.toLowerCase().includes(query)
        );

        if (matches.length === 0) {
          ws.send(JSON.stringify({
            type: 'message',
            message: `You don't see "${target}" here.`
          }));
          return;
        }

        // Build description output for all matching NPCs
        const lines = matches.map(npc => {
          const desc = npc.description || 'You see nothing special.';
          return `${npc.name}: ${desc}`;
        });

        ws.send(JSON.stringify({
          type: 'message',
          message: lines.join('\n')
        }));
      }

      else if (data.type === 'disconnectMap') {
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
        if (!player || player.god_mode !== 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'God mode required' }));
          return;
        }

        const { roomId } = data;
        if (!roomId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
          return;
        }

        try {
          const room = db.getRoomById(roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            return;
          }

          // Disconnect the room (handles both ends and orphaned connections)
          db.disconnectRoom(roomId);

          // Get updated room
          const updatedRoom = db.getRoomById(roomId);

          ws.send(JSON.stringify({
            type: 'mapDisconnected',
            room: {
              id: updatedRoom.id,
              name: updatedRoom.name,
              x: updatedRoom.x,
              y: updatedRoom.y,
              mapId: updatedRoom.map_id
            }
          }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to disconnect: ' + err.message }));
        }
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

// NPC Cycle Engine Configuration
const NPC_TICK_INTERVAL = 1000; // milliseconds (configurable)

// NPC Cycle Engine (Tick Loop)
// Runs independently of player actions, processes NPC cycles on timer
function startNPCCycleEngine() {
  setInterval(() => {
    try {
      const activeNPCs = db.getAllActiveNPCs();
      const now = Date.now();
      
      for (const roomNpc of activeNPCs) {
        const timeElapsed = now - roomNpc.lastCycleRun;
        
        // Check if enough time has passed for this NPC's cycle
        if (timeElapsed >= roomNpc.baseCycleTime) {
          try {
            // Structure data for npcLogic: npc data and roomNpc data
            const npcData = {
              npcType: roomNpc.npcType,
              baseCycleTime: roomNpc.baseCycleTime,
              requiredStats: roomNpc.requiredStats,
              requiredBuffs: roomNpc.requiredBuffs,
              inputItems: roomNpc.inputItems,
              outputItems: roomNpc.outputItems,
              failureStates: roomNpc.failureStates
            };
            
            // Run NPC cycle logic
            const newState = npcLogic.runNPCCycle(npcData, roomNpc);
            
            // Update NPC state in database
            db.updateNPCState(roomNpc.id, newState, now);
          } catch (err) {
            console.error(`Error processing NPC cycle for room_npc ${roomNpc.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error in NPC cycle engine:', err);
    }
  }, NPC_TICK_INTERVAL);
  
  console.log(`NPC Cycle Engine started (interval: ${NPC_TICK_INTERVAL}ms)`);
}

const PORT = 3434;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Start NPC cycle engine after server starts
  startNPCCycleEngine();
});

