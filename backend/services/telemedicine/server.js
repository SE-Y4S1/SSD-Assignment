const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const app = require('./src/app');
const Session = require('./src/models/Session');

const JWT_SECRET = process.env.JWT_SECRET;
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const port = process.env.PORT || 3004;

const server = http.createServer(app);

// Helper to get local IP address for cross-device testing
const getLocalIp = () => {
  const os = require('os');
  const networks = os.networkInterfaces();
  for (const name of Object.keys(networks)) {
    for (const net of networks[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
};

// Setup Socket.io Signaling
const io = new Server(server, {
  cors: {
    // Only the application's own origin may open a signalling socket.
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT']
  }
});

// Every socket must present a valid session token before it can relay
// anything. The signalling server used to accept anonymous connections from
// any origin (V-D06).
io.use((socket, next) => {
  const header = socket.handshake.headers?.authorization;
  const token =
    socket.handshake.auth?.token ||
    (typeof header === 'string' ? header.replace(/^Bearer /, '') : null);
  if (!token) return next(new Error('Authorization token required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.data.user = {
      id: decoded.userId || decoded.id || decoded.doctorId || decoded.patientId,
      role: decoded.role,
    };
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Telemedicine] Socket connected: ${socket.id}`);

  // Relays only reach rooms this socket actually joined.
  const inRoom = (roomId) => typeof roomId === 'string' && socket.rooms.has(roomId);

  socket.on('join_room', async (roomId) => {
    // Holding a token is not enough: the caller must be a participant in the
    // consultation that owns this room.
    try {
      const session = await Session.findOne({ roomName: roomId });
      const user = socket.data.user || {};
      const allowed =
        session &&
        (user.role === 'admin' || user.id === session.patientId || user.id === session.doctorId);
      if (!allowed) {
        console.warn(`[Telemedicine] ${socket.id} refused entry to ${roomId}`);
        socket.emit('join_denied', { roomId });
        return;
      }
    } catch (err) {
      console.error('[Telemedicine] room membership check failed:', err.message);
      socket.emit('join_denied', { roomId });
      return;
    }

    socket.join(roomId);
    
    const clients = io.sockets.adapter.rooms.get(roomId);
    const numClients = clients ? clients.size : 0;
    console.log(`[Telemedicine] ${socket.id} joined ${roomId}. Members: ${numClients}`);
    
    // Broadcast presence so others know to start the 'Pulse'
    socket.to(roomId).emit('user_joined', { socketId: socket.id });
  });

  // Aggressive Pulse Relay
  socket.on('peer_ready', (data) => {
    if (!inRoom(data?.roomId)) return;
    socket.to(data.roomId).emit('peer_ready', { socketId: socket.id });
  });

  socket.on('webrtc_offer', (data) => {
    console.log(`[Telemedicine] Relay Offer from ${socket.id} in ${data.roomId}`);
    if (!inRoom(data?.roomId)) return;
    socket.to(data.roomId).emit('webrtc_offer', { sdp: data.sdp, sender: socket.id });
  });

  socket.on('webrtc_answer', (data) => {
    console.log(`[Telemedicine] Relay Answer from ${socket.id} in ${data.roomId}`);
    if (!inRoom(data?.roomId)) return;
    socket.to(data.roomId).emit('webrtc_answer', { sdp: data.sdp, sender: socket.id });
  });

  socket.on('ice_candidate', (data) => {
    if (!inRoom(data?.roomId)) return;
    socket.to(data.roomId).emit('ice_candidate', { candidate: data.candidate, sender: socket.id });
  });

  // Generic Relay for Metadata (Transcripts, Risk Alerts, Multi-med sync)
  socket.on('relay_message', (data) => {
    if (!inRoom(data?.roomId)) return;
    socket.to(data.roomId).emit('relay_message', data);
  });

  socket.on('disconnect', () => {
    console.log(`[Telemedicine] Disconnect: ${socket.id}`);
  });
});

// Presence Watchdog: Log actual occupancy of active rooms to terminal
setInterval(() => {
  const rooms = io.sockets.adapter.rooms;
  rooms.forEach((participants, roomId) => {
    if (roomId.length > 20) { // Only log appointment rooms, not individual socket rooms
      console.log(`[Monitor] Room ${roomId}: ${participants.size} online participants.`);
    }
  });
}, 5000);

server.listen(port, () => {
  const networkIp = getLocalIp();
  const host = process.env.SIGNALING_HOST || networkIp;
  console.log(`\n🚀 Telemedicine Signaling Service Online`);
  console.log(`📍 Local:   http://localhost:${port}`);
  console.log(`📡 Network: http://${host}:${port}\n`);
  if (host.startsWith('172.')) {
     console.warn('⚠️ WARNING: Using Docker Internal IP. For cross-device testing, set the SIGNALING_HOST environment variable to your Host Machine IP.');
  }
});
