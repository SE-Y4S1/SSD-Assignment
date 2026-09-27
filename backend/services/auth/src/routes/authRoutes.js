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
const oauth = require('../controllers/oauthController');

const router = express.Router();

router.post('/login', credentialLimiter, ctrl.login);
router.post('/register', credentialLimiter, ctrl.register);
router.get('/verify', ctrl.verify);

// Sign in with Google. The start route is rate limited too: it writes a row
// per call, so leaving it open would let anyone fill the collection.
router.get('/oauth/google', credentialLimiter, oauth.start);
router.get('/oauth/google/callback', oauth.callback);

module.exports = router;
