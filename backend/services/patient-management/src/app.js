const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();
const patientRoutes = require('./routes/patientRoutes');

// Middleware — allow-list frontend origin only (no wildcard CORS)
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

// Patient routes
app.use('/api/patients', patientRoutes);

app.get('/', (req, res) => {
  res.json({ service: 'Patient Management Service', status: 'running' });
});

// TODO: Add your routes here
// app.use('/api/patients', patientRoutes);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Patient Service] Unhandled error:', err);

  if (res.headersSent) {
    return next(err);
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid request parameter.'
    });
  }

  res.status(500).json({
    message: 'Internal server error.'
  });
});

module.exports = app;
