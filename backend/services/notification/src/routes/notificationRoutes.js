const express = require('express');
const router = express.Router();
const { sendEmail, sendSMS } = require('../controllers/notificationController');

// POST /api/notify/email
// Failures are logged in full and answered generically (V-A14).
const { respondWithError } = require('../utils/clientError');
router.post('/email', async (req, res) => {
  const { to, subject, text } = req.body;
  try {
    await sendEmail(to, subject, text);
    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    return respondWithError(res, error, 'notification.handler');
  }
});

// POST /api/notify/sms
router.post('/sms', async (req, res) => {
  const { to, message } = req.body;
  try {
    await sendSMS(to, message);
    res.json({ message: 'SMS sent successfully' });
  } catch (error) {
    return respondWithError(res, error, 'notification.handler');
  }
});

module.exports = router;
