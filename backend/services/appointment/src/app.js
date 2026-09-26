const express = require('express');
const cors = require('cors');
// Failures are logged in full and answered generically (V-A14).
const { respondWithError } = require('./utils/clientError');
const helmet = require('helmet');
const appointmentRoutes = require('./routes/appointmentRoutes');

const app = express();

// Security headers on every response. These services are API only, so the
// content policy can be strict and cross-origin embedding is refused (V-A13).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/appointments', appointmentRoutes);

app.get('/', (_req, res) => res.json({ service: 'Appointment Service', status: 'running' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  respondWithError(res, err, 'appointment.unhandled');
});

module.exports = app;
