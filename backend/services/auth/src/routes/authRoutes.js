const express = require('express');
const rateLimit = require('express-rate-limit');

// Credential endpoints are the ones worth guessing at, so they get their own
// limit. Everything else is left alone (V-A03).
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});
const ctrl = require('../controllers/authController');

const router = express.Router();

router.post('/login', credentialLimiter, ctrl.login);
router.post('/register', credentialLimiter, ctrl.register);
router.get('/verify', ctrl.verify);

module.exports = router;
