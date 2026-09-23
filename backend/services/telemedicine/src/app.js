const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Session = require('./models/Session');

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not set');
}
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const APPOINTMENT_SERVICE_URL = process.env.APPOINTMENT_SERVICE_URL || 'http://appointment:3003';
// The signalling endpoint is part of the deployment, not something a caller
// may choose. See V-D15.
const SIGNALING_URL = process.env.SIGNALING_URL || '';

const app = express();

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log('[telemedicine] MongoDB connected'))
    .catch((err) => console.error('[telemedicine] MongoDB connection failed:', err.message));
} else {
  console.warn('[telemedicine] MONGO_URI not set — sessions will not persist.');
}

app.use(cors());
app.use(express.json());

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token required' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId || decoded.id || decoded.doctorId || decoded.patientId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Loads the appointment as the calling user.
 *
 * The appointment service returns an appointment only to its own patient, its
 * doctor or an admin, so a successful response is itself the authorization
 * check, and the participant ids it returns are authoritative. Ids supplied in
 * the request body are never trusted (V-D07).
 */
const loadAppointmentAsCaller = async (appointmentId, authHeader) => {
  if (!OBJECT_ID.test(String(appointmentId))) return null;
  const response = await fetch(
    `${APPOINTMENT_SERVICE_URL}/api/appointments/${encodeURIComponent(appointmentId)}`,
    { headers: { Authorization: authHeader } }
  );
  if (!response.ok) return null;
  return response.json();
};

// Session routes — persisted in MongoDB so sessions survive restarts + multiple pods.
app.post('/api/sessions', auth, async (req, res) => {
  const { appointmentId } = req.body || {};
  if (!appointmentId) {
    return res.status(400).json({ message: 'appointmentId is required' });
  }

  let appointment;
  try {
    appointment = await loadAppointmentAsCaller(appointmentId, req.headers.authorization);
  } catch (err) {
    console.error('[telemedicine] appointment lookup failed:', err.message);
    return res.status(502).json({ message: 'Appointment service unavailable' });
  }
  if (!appointment) {
    return res.status(403).json({ message: 'Forbidden: You are not a participant in this appointment' });
  }

  try {
    let session = await Session.findOne({ appointmentId });
    if (session) {
      if (!session.roomName) {
        session.roomName = Session.generateRoomName();
        await session.save();
      }
      return res.status(200).json(session);
    }

    session = new Session({
      appointmentId,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      signalingUrl: SIGNALING_URL || undefined,
      roomName: Session.generateRoomName(),
      status: 'active',
    });
    await session.save();
    return res.status(201).json(session);
  } catch (err) {
    // Both participants can open the consultation at the same moment; the
    // unique index on appointmentId decides, and the loser reads the winner's.
    if (err && err.code === 11000) {
      const existing = await Session.findOne({ appointmentId });
      if (existing) return res.status(200).json(existing);
    }
    return res.status(500).json({ message: 'Database error' });
  }
});

app.get('/api/sessions/:appointmentId', auth, async (req, res) => {
  try {
    const session = await Session.findOne({ appointmentId: req.params.appointmentId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (req.user.role !== 'admin' && req.user.id !== session.patientId && req.user.id !== session.doctorId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Sessions created before room names were random have none; give them one
    // on first read so no consultation keeps a guessable name.
    if (!session.roomName) {
      session.roomName = Session.generateRoomName();
      await session.save();
    }
    return res.json(session);
  } catch {
    return res.status(500).json({ message: 'Database error' });
  }
});

app.put('/api/sessions/:appointmentId/end', auth, async (req, res) => {
  try {
    const session = await Session.findOne({ appointmentId: req.params.appointmentId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (req.user.role !== 'admin' && req.user.id !== session.doctorId) {
      return res.status(403).json({ message: 'Forbidden: Only the doctor can end a session' });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    await session.save();
    return res.json(session);
  } catch {
    return res.status(500).json({ message: 'Database error' });
  }
});

app.get('/', (_req, res) => res.json({ service: 'Telemedicine API', status: 'running' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

module.exports = app;
