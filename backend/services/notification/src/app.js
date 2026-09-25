const express = require('express');
const cors = require('cors');
const app = express();
const notificationRoutes = require('./routes/notificationRoutes');

// Allow-list frontend origin only (no wildcard CORS)
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