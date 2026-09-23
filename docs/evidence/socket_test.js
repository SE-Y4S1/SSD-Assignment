// V-D06: the signalling server must refuse anonymous sockets and refuse a room
// the caller is not a participant in.
const { io } = require('socket.io-client');
const URL = 'http://localhost:3004';
const token = process.argv[2];

const attempt = (label, opts, onConnect) => new Promise((resolve) => {
  const s = io(URL, { ...opts, reconnection: false, timeout: 6000 });
  const done = (outcome) => { s.close(); resolve({ label, outcome }); };
  s.on('connect', () => (onConnect ? onConnect(s, done) : done('connected')));
  s.on('connect_error', (e) => done('refused: ' + e.message));
  setTimeout(() => done('timeout'), 8000);
});

(async () => {
  const a = await attempt('anonymous socket, no token', {});
  console.log('T-D06a  no token ->', a.outcome);

  const b = await attempt('valid token, room the caller is not in', { auth: { token } }, (s, done) => {
    s.on('join_denied', (d) => done('join_denied for ' + d.roomId));
    s.on('user_joined', () => done('JOINED (unexpected)'));
    s.emit('join_room', 'medsync-' + 'f'.repeat(36));
    setTimeout(() => done('no join_denied and no join within 5s'), 5000);
  });
  console.log('T-D06b  valid token, foreign room ->', b.outcome);
})();
