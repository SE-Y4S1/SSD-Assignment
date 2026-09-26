const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();
const notificationRoutes = require('./routes/notificationRoutes');

// Allow-list frontend origin only (no wildcard CORS)
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

app.use('/api/notify', notificationRoutes);

app.get('/', (req, res) => {
  res.send('Notification Service is running');
});

module.exports = app;