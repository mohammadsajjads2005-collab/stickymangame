const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const C = require('../shared/constants');
const { Room } = require('./Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// --------------------------------------------------
// STATIC FILES
// --------------------------------------------------

const clientPath = path.join(__dirname, '..', 'client');
const sharedPath = path.join(__dirname, '..', 'shared');

// Serve frontend files
app.use(express.static(clientPath));

// Serve shared game files
app.use('/shared', express.static(sharedPath));

// Explicitly serve the main game page
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Health check for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Stick Clash',
    timestamp: new Date().toISOString()
  });
});

// --------------------------------------------------
// ROOMS
// --------------------------------------------------

/** @type {Map<string, Room>} */
const rooms = new Map();

/** socketId -> roomId */
const socketRoom = new Map();

function broadcastLobby(room) {
  io.to(room.id).emit('lobby:update', room.snapshotLobby());
}

function findRoom(socketId) {
  const roomId = socketRoom.get(socketId);
  return roomId ? rooms.get(roomId) : null;
}

// --------------------------------------------------
// SOCKET.IO
// --------------------------------------------------

io.on('connection', (socket) => {

  socket.on('room:create', ({ name }, cb) => {
    const room = new Room(io, socket.id, sanitizeName(name));

    rooms.set(room.id, room);
    socketRoom.set(socket.id, room.id);
    socket.join(room.id);

    cb && cb({
      ok: true,
      roomId: room.id,
      lobby: room.snapshotLobby()
    });
  });

  socket.on('room:createBot', ({ name }, cb) => {
    const room = new Room(io, socket.id, sanitizeName(name));

    room.botMode = true;
    room.addBot('Shadow Bot');

    rooms.set(room.id, room);
    socketRoom.set(socket.id, room.id);
    socket.join(room.id);

    cb && cb({
      ok: true,
      roomId: room.id,
      lobby: room.snapshotLobby()
    });
  });

  socket.on('room:join', ({ roomId, name }, cb) => {
    const room = rooms.get((roomId || '').toUpperCase());

    if (!room) {
      return cb && cb({
        ok: false,
        error: 'Room not found'
      });
    }

    const result = room.addPlayer(
      socket.id,
      sanitizeName(name)
    );

    if (result.error) {
      return cb && cb({
        ok: false,
        error: result.error
      });
    }

    socketRoom.set(socket.id, room.id);
    socket.join(room.id);

    cb && cb({
      ok: true,
      roomId: room.id,
      lobby: room.snapshotLobby()
    });

    broadcastLobby(room);
  });

  socket.on('lobby:ready', ({ ready }) => {
    const room = findRoom(socket.id);

    if (!room) return;

    room.setReady(socket.id, ready);
    broadcastLobby(room);
  });

  socket.on('lobby:start', () => {
    const room = findRoom(socket.id);

    if (!room || room.hostId !== socket.id) return;
    if (room.players.size < 1) return;

    room.startCountdown();
    ensureLoop(room);
    broadcastLobby(room);
  });

  socket.on('match:input', (input) => {
    const room = findRoom(socket.id);

    if (!room) return;

    room.applyInput(socket.id, input);
  });

  socket.on('match:rematch', () => {
    const room = findRoom(socket.id);

    if (!room || room.hostId !== socket.id) return;

    room.returnToLobby();
    broadcastLobby(room);
  });

  socket.on('match:returnToLobby', () => {
    const room = findRoom(socket.id);

    if (!room) return;

    room.returnToLobby();
    broadcastLobby(room);
  });

  // Debug-mode RTT measurement
  socket.on('debug:ping', (clientTime) => {
    socket.emit('debug:pong', clientTime);
  });

  // ------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------

  socket.on('disconnect', () => {
    const room = findRoom(socket.id);

    socketRoom.delete(socket.id);

    if (!room) return;

    room.removePlayer(socket.id);

    io.to(room.id).emit('player:left', {
      id: socket.id
    });

    if (room.isEmpty) {
      stopLoop(room);
      rooms.delete(room.id);
    } else {
      broadcastLobby(room);
    }
  });
});

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function sanitizeName(name) {
  const n = (name || '')
    .toString()
    .trim()
    .slice(0, 16);

  return n.length
    ? n.replace(/[<>]/g, '')
    : 'Player';
}

// --------------------------------------------------
// GAME LOOP
// --------------------------------------------------

function ensureLoop(room) {
  if (room.loopHandle) return;

  let last = Date.now();

  room.loopHandle = setInterval(() => {
    const now = Date.now();

    const dt = Math.min(
      0.1,
      (now - last) / 1000
    );

    last = now;

    room.tick(dt);

    io.to(room.id).emit(
      'match:state',
      room.snapshotState()
    );

  }, C.TICK_MS);
}

function stopLoop(room) {
  if (room.loopHandle) {
    clearInterval(room.loopHandle);
    room.loopHandle = null;
  }
}

// --------------------------------------------------
// RENDER / PRODUCTION SERVER
// --------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Stick Clash server running on port ${PORT}`
  );
});