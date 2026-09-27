const mongoose = require('mongoose');

/**
 * One row per authorization request in flight.
 *
 * state, nonce and the PKCE verifier have to survive the redirect to Google and
 * come back, and they must be usable exactly once. Holding them server-side
 * rather than in a cookie means the browser never carries the verifier, and
 * deleting the row on use is what makes a replayed callback fail.
 */
const oauthStateSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true, index: true },
  nonce: { type: String, required: true },
  codeVerifier: { type: String, required: true },
  redirectTo: { type: String, default: '/patient' },
  // Mongo removes the row automatically ten minutes after it is created, so an
  // abandoned authorization request cannot be resumed later.
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

module.exports = mongoose.model('OAuthState', oauthStateSchema);
