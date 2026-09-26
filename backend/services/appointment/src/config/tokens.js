/**
 * One place where tokens are signed and verified.
 *
 * Every service used to call jwt.verify(token, SECRET) with no options. That
 * accepts whatever algorithm the token's own header asks for and accepts a
 * token from any issuer for any audience, so a token minted for something else
 * that happens to share the secret is honoured here too (V-A15).
 *
 * Copied into each service rather than shared, because the services have no
 * common package.
 */

const jwt = require('jsonwebtoken');

// The only algorithm MedSync signs with. Pinning it is the point of this file:
// without it, the token's own header chooses, which is how algorithm confusion
// attacks start.
const ALGORITHM = 'HS256';
const ISSUER = 'medsync-auth';
const AUDIENCE = 'medsync-api';

// Tokens used to last seven days by default, which is a long time to hold a
// credential that cannot be withdrawn (V-A05).
const DEFAULT_EXPIRY = '12h';

function signToken(payload, { expiresIn = process.env.JWT_EXPIRE || DEFAULT_EXPIRY } = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

module.exports = { signToken, verifyToken, ALGORITHM, ISSUER, AUDIENCE, DEFAULT_EXPIRY };
