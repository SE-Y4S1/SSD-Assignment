const express = require('express');
const router = express.Router();
const { sendEmail, sendSMS } = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// POST /api/notify/email
router.post('/email', auth, async (req, res) => {
  const { to, subject, text } = req.body;
  try {
    await sendEmail(to, subject, text);
    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/notify/sms
router.post('/sms', auth, async (req, res) => {
  const { to, message } = req.body;
  try {
    await sendSMS(to, message);
    res.json({ message: 'SMS sent successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
