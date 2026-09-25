const express = require('express');
const cors = require('cors');

const doctorRoutes = require('./routes/doctorRoutes');

const app = express();

// Middleware — allow-list frontend origin only (no wildcard CORS)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

// Routes
app.use('/api/doctors', doctorRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ service: 'Doctor Management Service', status: 'running' });
});

// TODO: Add your routes here
// app.use('/api/doctors', doctorRoutes);

module.exports = app;
