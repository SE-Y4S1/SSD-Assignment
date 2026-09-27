const express = require('express');
const cors = require('cors');
// Failures are logged in full and answered generically (V-A14).
const { respondWithError } = require('./utils/clientError');
const helmet = require('helmet');
const morgan = require('morgan');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
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
app.use(morgan('dev'));

// CRITICAL: Stripe webhook needs the raw request body for signature verification.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// All other routes use parsed JSON (exclude webhook)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/payments', paymentRoutes);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ service: 'Payment Service', status: 'running', timestamp: new Date() })
);

// ── Centralized Error Handler ─────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  respondWithError(res, err, 'payment.unhandled', { status: err.statusCode || 500 });
});

// TODO: Add your routes here
// app.use('/api/payments', paymentRoutes);

module.exports = app;
