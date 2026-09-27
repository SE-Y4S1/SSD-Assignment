/**
 * Sign in with Google, using the authorization code flow with PKCE.
 *
 * The rules this file exists to enforce:
 *
 *  - The code is exchanged here, on the server. The client secret never leaves
 *    this process and never reaches a browser.
 *  - state is single use. It is created before the redirect, stored server-side
 *    and deleted the first time it comes back, so a replayed callback fails.
 *  - The ID token is verified against the provider's published keys, its own
 *    issuer, this client's id as the audience, and the nonce minted for this
 *    one request. None of those checks is optional.
 *  - An unverified email address is refused. Accepting one would let anyone who
 *    can create a provider account claim someone else's mailbox.
 *  - The session this issues is an ordinary MedSync token from
 *    src/config/tokens.js, so the algorithm, issuer, audience and 12 hour
 *    lifetime pinned for V-A15 all still apply. The Google token is never
 *    reused as a session.
 */

const crypto = require('crypto');
const axios = require('axios');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const { config, isConfigured } = require('../config/oauth');
const { signToken } = require('../config/tokens');
const OAuthState = require('../models/OAuthState');
const OAuthIdentity = require('../models/OAuthIdentity');

const PATIENT_URL = process.env.PATIENT_SERVICE_URL || 'http://patient-management:3001/api/patients';
const internalSecret = () => process.env.INTERNAL_SERVICE_SECRET || process.env.JWT_SECRET;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomUrlSafe = (bytes) => b64url(crypto.randomBytes(bytes || 32));

// RFC 7636 S256: the challenge is the hash of the verifier, so the verifier
// itself never travels through the browser.
const challengeFor = (verifier) => b64url(crypto.createHash('sha256').update(verifier).digest());

// One remote key set per process. jose caches the keys and refetches on a
// signature it has no key for, which is what handles provider key rotation.
let jwks = null;
function keySet() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(config().jwksUri));
  return jwks;
}
// Exported so a test can supply a local key set instead of reaching the network.
function setKeySet(k) { jwks = k; }

/** Only allow the caller to choose a path inside our own application. */
function safeRedirect(value) {
  if (typeof value !== 'string') return '/patient';
  if (!value.startsWith('/') || value.startsWith('//')) return '/patient';
  return value;
}

/** GET /api/auth/oauth/google - begin the flow. */
exports.start = async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ message: 'Google sign-in is not configured on this deployment.' });
  }
  const c = config();

  const state = randomUrlSafe(32);
  const nonce = randomUrlSafe(32);
  const codeVerifier = randomUrlSafe(48);

  try {
    await OAuthState.create({
      state,
      nonce,
      codeVerifier,
      redirectTo: safeRedirect(req.query.next),
    });
  } catch (err) {
    console.error('[auth] could not record the OAuth request:', err.message);
    return res.status(500).json({ message: 'Could not start Google sign-in. Please try again.' });
  }

  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: c.scope,
    state,
    nonce,
    code_challenge: challengeFor(codeVerifier),
    code_challenge_method: 'S256',
    // Ask the provider to re-consent rather than silently reusing a session.
    prompt: 'select_account',
  });

  return res.redirect(c.authorizationEndpoint + '?' + params.toString());
};

/** Exchange the authorization code. Separate so it can be tested alone. */
async function exchangeCode(code, codeVerifier) {
  const c = config();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: c.redirectUri,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    code_verifier: codeVerifier,
  });
  const { data } = await axios.post(c.tokenEndpoint, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 8000,
  });
  return data;
}

/** Verify the ID token. Every check here is required. */
async function verifyIdToken(idToken, nonce) {
  const c = config();
  const { payload } = await jwtVerify(idToken, keySet(), {
    issuer: [c.issuer, 'accounts.google.com'],
    audience: c.clientId,
    algorithms: ['RS256'],
    clockTolerance: 60,
  });
  if (payload.nonce !== nonce) {
    throw new Error('nonce mismatch');
  }
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new Error('email address is not verified with the provider');
  }
  if (!payload.email || !payload.sub) {
    throw new Error('the provider returned no email address or subject');
  }
  return payload;
}

/**
 * Find the MedSync account for this provider subject, or create one.
 *
 * Linking is keyed on the subject claim rather than the address, because an
 * address can be reassigned by whoever owns the domain while the subject is
 * stable for the life of the provider account.
 *
 * A first sign-in whose address already belongs to another account is refused
 * rather than linked automatically. Taking over an existing account on the
 * strength of a matching address is exactly the takeover this refusal prevents.
 */
async function resolveAccount(claims) {
  const email = String(claims.email).trim().toLowerCase();

  const existing = await OAuthIdentity.findOne({ provider: 'google', subject: claims.sub });
  if (existing) {
    existing.lastLoginAt = new Date();
    existing.email = email;
    await existing.save();
    return { id: existing.localId, email: existing.email, role: existing.role, created: false };
  }

  const claimed = await OAuthIdentity.findOne({ provider: 'google', email });
  if (claimed) {
    const err = new Error('account-conflict');
    err.code = 'account-conflict';
    throw err;
  }

  // Provision a patient account. The password is random and is shown to nobody:
  // this account signs in through the provider. It still satisfies the password
  // policy added for V-A09, so the patient service accepts it.
  const provisionedPassword = randomUrlSafe(24) + 'aA1!';
  const names = String(claims.name || email.split('@')[0]).trim().split(/\s+/);

  let created;
  try {
    const { data } = await axios.post(
      PATIENT_URL + '/register',
      {
        email,
        password: provisionedPassword,
        firstName: claims.given_name || names[0] || 'MedSync',
        lastName: claims.family_name || names.slice(1).join(' ') || 'User',
      },
      { timeout: 8000, headers: { 'x-internal-secret': internalSecret() } }
    );
    created = data.patient || data.user || data;
  } catch (err) {
    if (err.response && err.response.status === 409) {
      const conflict = new Error('account-conflict');
      conflict.code = 'account-conflict';
      throw conflict;
    }
    throw err;
  }

  const localId = created._id || created.id;
  await OAuthIdentity.create({
    provider: 'google',
    subject: claims.sub,
    email,
    localId: String(localId),
    role: 'patient',
    lastLoginAt: new Date(),
  });

  return { id: String(localId), email, role: 'patient', created: true };
}

/** GET /api/auth/oauth/google/callback */
exports.callback = async (req, res) => {
  const c = config();
  const fail = (reason) => {
    const url = new URL('/login', c.frontendUrl);
    url.searchParams.set('error', reason);
    return res.redirect(url.toString());
  };

  if (!isConfigured()) return fail('oauth_not_configured');

  // The provider reports a refusal here, for example when the person presses
  // cancel on the consent screen.
  if (req.query.error) {
    console.warn('[auth] provider refused the authorization request:', req.query.error);
    return fail(req.query.error === 'access_denied' ? 'access_denied' : 'provider_error');
  }

  const code = req.query.code;
  const state = req.query.state;
  if (typeof code !== 'string' || typeof state !== 'string') return fail('invalid_response');

  // Single use: whoever consumes the row first gets it and a replay finds
  // nothing. findOneAndDelete makes that atomic.
  const record = await OAuthState.findOneAndDelete({ state });
  if (!record) return fail('invalid_state');

  let claims;
  try {
    const tokens = await exchangeCode(code, record.codeVerifier);
    if (!tokens || !tokens.id_token) return fail('no_id_token');
    claims = await verifyIdToken(tokens.id_token, record.nonce);
  } catch (err) {
    console.error('[auth] Google sign-in failed during verification:', err.message);
    return fail('verification_failed');
  }

  let account;
  try {
    account = await resolveAccount(claims);
  } catch (err) {
    if (err.code === 'account-conflict') return fail('account_exists');
    console.error('[auth] Google sign-in failed while resolving the account:', err.message);
    return fail('account_error');
  }

  // An ordinary MedSync session, pinned the same way as every other one.
  const token = signToken({
    userId: account.id,
    patientId: account.role === 'patient' ? account.id : undefined,
    email: account.email,
    role: account.role,
  });

  const url = new URL('/oauth/callback', c.frontendUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('next', safeRedirect(record.redirectTo));
  return res.redirect(url.toString());
};

module.exports._internals = {
  challengeFor, randomUrlSafe, safeRedirect, verifyIdToken, resolveAccount, exchangeCode, setKeySet,
};
