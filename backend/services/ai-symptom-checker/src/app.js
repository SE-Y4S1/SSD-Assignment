require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const symptomRoutes = require('./routes/symptomRoutes');

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
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/symptom-checker', symptomRoutes);

app.get('/', (_req, res) => res.json({ service: 'AI Symptom Checker Service', status: 'running' }));
app.get('/health', (_req, res) => res.json({ ok: true, ai: !!process.env.GEMINI_API_KEY }));

app.use((err, _req, res, _next) => {
  console.error('[ai] unhandled:', err);
  res.status(err.statusCode || 500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
