const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

app.get('/', (_req, res) => res.json({ service: 'Auth Service', status: 'running' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
