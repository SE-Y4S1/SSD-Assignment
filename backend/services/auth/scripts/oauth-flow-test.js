/**
 * Exercises the Google sign-in flow end to end against a stub provider.
 *
 * A real Google client cannot be driven unattended, so this test stands up a
 * local OIDC provider instead: a real RSA key pair, a real JWKS endpoint, a
 * real token endpoint that checks the PKCE verifier, and real RS256 ID tokens.
 * Everything the controller does is therefore genuinely executed, including
 * signature verification through jose, rather than stubbed out.
 *
 *   MONGO_URI=mongodb://127.0.0.1:27017/oauth_flow_test node scripts/oauth-flow-test.js
 */

const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } = require('jose');

/**
 * The models keep their real schemas, so the TTL and uniqueness assertions
 * below are assertions about the shipped schema. Only persistence is held in
 * memory, so the test runs without a database. Set MONGO_URI to run the same
 * checks against a real server instead.
 */
function useInMemoryStore(Model, uniqueKeys) {
  const rows = [];
  const matches = (row, q) => Object.keys(q).every((k) => row[k] === q[k]);
  Model.create = async (doc) => {
    for (const keys of uniqueKeys) {
      const q = {}; keys.forEach((k) => { q[k] = doc[k]; });
      if (rows.some((r) => matches(r, q))) {
        const e = new Error('duplicate key'); e.code = 11000; throw e;
      }
    }
    const row = { ...doc, createdAt: new Date(), save: async () => row };
    rows.push(row);
    return row;
  };
  Model.findOne = async (q) => rows.find((r) => matches(r, q)) || null;
  Model.findOneAndDelete = async (q) => {
    const i = rows.findIndex((r) => matches(r, q));
    if (i === -1) return null;
    return rows.splice(i, 1)[0];
  };
  Model.countDocuments = async (q) => rows.filter((r) => matches(r, q || {})).length;
  Model.deleteMany = async () => { rows.length = 0; };
  return rows;
}

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-client-secret';
const ISSUER = 'https://accounts.google.com';

let PROVIDER_PORT, PATIENT_PORT;
let privateKey, publicJwk, keySet;
const issuedCodes = new Map();   // code -> { challenge, claimsOverride }
let patientSeq = 0;
const registeredEmails = new Set();
let lastRegisterHeaders = null;

const results = [];
const check = (name, expected, observed) => {
  const ok = expected === observed;
  results.push({ ok, name, expected, observed });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      expected: ${expected}\n      observed: ${observed}`);
};

// ── stub provider ────────────────────────────────────────────────────────────
async function startProvider() {
  const { privateKey: priv, publicKey: pub } = await generateKeyPair('RS256');
  privateKey = priv;
  publicJwk = { ...(await exportJWK(pub)), kid: 'test-key-1', alg: 'RS256', use: 'sig' };
  keySet = createLocalJWKSet({ keys: [publicJwk] });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/certs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ keys: [publicJwk] }));
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      return req.on('end', async () => {
        const form = new URLSearchParams(body);
        const entry = issuedCodes.get(form.get('code'));
        if (!entry) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'invalid_grant' }));
        }
        // The provider checks PKCE, exactly as Google does.
        const verifier = form.get('code_verifier') || '';
        const computed = crypto.createHash('sha256').update(verifier).digest('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        if (computed !== entry.challenge) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'invalid_grant', detail: 'pkce mismatch' }));
        }
        if (form.get('client_secret') !== CLIENT_SECRET) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'invalid_client' }));
        }
        issuedCodes.delete(form.get('code'));   // codes are single use
        const idToken = await mintIdToken(entry.claims);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id_token: idToken, access_token: 'stub', token_type: 'Bearer' }));
      });
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, r));
  PROVIDER_PORT = server.address().port;
  return server;
}

async function mintIdToken(o = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: o.sub || 'google-subject-0001',
    email: o.email || 'oauth.person@example.invalid',
    email_verified: o.email_verified === undefined ? true : o.email_verified,
    name: o.name || 'OAuth Person',
    given_name: o.given_name || 'OAuth',
    family_name: o.family_name || 'Person',
    nonce: o.nonce,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuer(o.issuer || ISSUER)
    .setAudience(o.audience || CLIENT_ID)
    .setIssuedAt(o.iat || now)
    .setExpirationTime(o.exp || now + 3600)
    .sign(privateKey);
}

// ── stub patient service ─────────────────────────────────────────────────────
async function startPatientService() {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/patients/register' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      return req.on('end', () => {
        lastRegisterHeaders = req.headers;
        const parsed = JSON.parse(body || '{}');
        if (registeredEmails.has(parsed.email)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'A patient with this email already exists.' }));
        }
        registeredEmails.add(parsed.email);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ patient: { _id: 'patient-' + (++patientSeq), email: parsed.email } }));
      });
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, r));
  PATIENT_PORT = server.address().port;
  return server;
}

// ── minimal express-like req/res doubles ─────────────────────────────────────
const makeRes = () => {
  const r = { status: 0, redirectedTo: null, body: null };
  r.redirect = (u) => { r.status = 302; r.redirectedTo = u; return r; };
  r.status = function (c) { this.code = c; return this; };
  r.json = function (b) { this.body = b; return this; };
  return r;
};

async function main() {
  const provider = await startProvider();
  const patientService = await startPatientService();

  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = CLIENT_SECRET;
  process.env.OAUTH_TOKEN_ENDPOINT = `http://127.0.0.1:${PROVIDER_PORT}/token`;
  process.env.OAUTH_JWKS_URI = `http://127.0.0.1:${PROVIDER_PORT}/certs`;
  process.env.OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/oauth/google/callback';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.PATIENT_SERVICE_URL = `http://127.0.0.1:${PATIENT_PORT}/api/patients`;
  process.env.JWT_SECRET = crypto.randomBytes(36).toString('base64');
  process.env.INTERNAL_SERVICE_SECRET = crypto.randomBytes(24).toString('base64');

  const live = Boolean(process.env.MONGO_URI);
  if (live) await mongoose.connect(process.env.MONGO_URI);

  const oauth = require('../src/controllers/oauthController');
  const OAuthState = require('../src/models/OAuthState');
  const OAuthIdentity = require('../src/models/OAuthIdentity');
  const { verifyToken } = require('../src/config/tokens');

  if (live) {
    await OAuthState.deleteMany({});
    await OAuthIdentity.deleteMany({});
  } else {
    useInMemoryStore(OAuthState, [['state']]);
    useInMemoryStore(OAuthIdentity, [['provider', 'subject']]);
    console.log('running against in-memory stores; set MONGO_URI to use a real server');
  }

  // keep the stub keys local instead of fetching over the network
  oauth._internals.setKeySet(keySet);

  // ---- begin the flow, and inspect what is sent to the provider ------------
  const startRes = makeRes();
  await oauth.start({ query: { next: '/patient/records' } }, startRes);
  const authUrl = new URL(startRes.redirectedTo);
  const sentState = authUrl.searchParams.get('state');
  const sentNonce = authUrl.searchParams.get('nonce');
  const stored = await OAuthState.findOne({ state: sentState });

  check('PKCE: challenge method is S256', 'S256', authUrl.searchParams.get('code_challenge_method'));
  check('PKCE: the verifier is never sent to the provider', 'absent',
    authUrl.searchParams.get('code_verifier') === null ? 'absent' : 'present');
  check('PKCE: the challenge is the S256 hash of the stored verifier', 'match',
    oauth._internals.challengeFor(stored.codeVerifier) === authUrl.searchParams.get('code_challenge') ? 'match' : 'mismatch');
  check('the client secret is not in the authorization URL', 'absent',
    startRes.redirectedTo.includes(CLIENT_SECRET) ? 'present' : 'absent');
  check('state is unpredictable (>= 32 chars)', 'true', String(sentState.length >= 32));
  check('the requested scope is only openid email profile', 'openid email profile',
    authUrl.searchParams.get('scope'));

  // helper: run a callback for a fresh authorization request
  async function runCallback(claimOverrides, opts = {}) {
    const sres = makeRes();
    await oauth.start({ query: {} }, sres);
    const u = new URL(sres.redirectedTo);
    const st = u.searchParams.get('state');
    const nc = u.searchParams.get('nonce');
    const rec = await OAuthState.findOne({ state: st });
    const code = 'code-' + crypto.randomUUID();
    issuedCodes.set(code, {
      challenge: oauth._internals.challengeFor(rec.codeVerifier),
      claims: { nonce: opts.wrongNonce ? 'a-different-nonce' : nc, ...claimOverrides },
    });
    const cres = makeRes();
    await oauth.callback({ query: { code, state: opts.tamperState ? st + 'x' : st } }, cres);
    return { res: cres, state: st, code };
  }

  const okFirst = await runCallback({});
  const firstUrl = new URL(okFirst.res.redirectedTo);
  check('a valid sign-in lands on the application callback page', '/oauth/callback', firstUrl.pathname);
  const issued = firstUrl.searchParams.get('token');
  const decoded = verifyToken(issued);
  check('the session issued is a MedSync token, not the Google one', 'medsync-auth', decoded.iss);
  check('the session audience is pinned', 'medsync-api', decoded.aud);
  check('the session role is patient', 'patient', decoded.role);
  check('the session lifetime is 12 hours', '12', String((decoded.exp - decoded.iat) / 3600));
  check('an account was provisioned in the patient service', '1', String(patientSeq));
  check('provisioning proved it was a MedSync service', 'true',
    String(lastRegisterHeaders['x-internal-secret'] === process.env.INTERNAL_SERVICE_SECRET));

  // second sign-in, same subject: links, does not duplicate
  await runCallback({});
  check('signing in again reuses the linked account', '1', String(patientSeq));
  check('exactly one identity row exists for that subject', '1',
    String(await OAuthIdentity.countDocuments({ subject: 'google-subject-0001' })));

  // ---- failure paths -------------------------------------------------------
  const errorOf = (res) => new URL(res.redirectedTo).searchParams.get('error');

  // replayed state
  const replay = makeRes();
  await oauth.callback({ query: { code: 'whatever', state: okFirst.state } }, replay);
  check('a replayed state is refused', 'invalid_state', errorOf(replay));

  // tampered state
  const tampered = await runCallback({}, { tamperState: true });
  check('a tampered state is refused', 'invalid_state', errorOf(tampered.res));

  // wrong nonce
  const badNonce = await runCallback({}, { wrongNonce: true });
  check('an ID token carrying the wrong nonce is refused', 'verification_failed', errorOf(badNonce.res));

  // wrong audience
  const badAud = await runCallback({ audience: 'someone-elses-client-id' });
  check('an ID token minted for another client is refused', 'verification_failed', errorOf(badAud.res));

  // wrong issuer
  const badIss = await runCallback({ issuer: 'https://accounts.evil.invalid' });
  check('an ID token from another issuer is refused', 'verification_failed', errorOf(badIss.res));

  // expired
  const past = Math.floor(Date.now() / 1000) - 7200;
  const expired = await runCallback({ iat: past, exp: past + 600 });
  check('an expired ID token is refused', 'verification_failed', errorOf(expired.res));

  // unverified email
  const unverified = await runCallback({ email_verified: false, sub: 'google-subject-unverified' });
  check('an unverified provider email is refused', 'verification_failed', errorOf(unverified.res));

  // a different provider account claiming an address already linked
  const conflict = await runCallback({ sub: 'google-subject-0002', email: 'oauth.person@example.invalid' });
  check('a second provider account on a linked address is refused', 'account_exists', errorOf(conflict.res));

  // the person pressed cancel
  const denied = makeRes();
  await oauth.callback({ query: { error: 'access_denied' } }, denied);
  check('a cancelled consent is reported, not treated as success', 'access_denied', errorOf(denied));

  // an authorization code the provider never issued
  const sres = makeRes();
  await oauth.start({ query: {} }, sres);
  const badCodeState = new URL(sres.redirectedTo).searchParams.get('state');
  const badCode = makeRes();
  await oauth.callback({ query: { code: 'never-issued', state: badCodeState } }, badCode);
  check('an authorization code the provider never issued is refused', 'verification_failed', errorOf(badCode));

  // open redirect attempts on the next parameter
  check('an absolute URL in next is discarded', '/patient',
    oauth._internals.safeRedirect('https://evil.invalid/steal'));
  check('a protocol-relative URL in next is discarded', '/patient',
    oauth._internals.safeRedirect('//evil.invalid'));
  check('an in-application path in next is kept', '/patient/records',
    oauth._internals.safeRedirect('/patient/records'));

  // the shipped schema, not the in-memory double
  check('abandoned authorization requests expire after 10 minutes', '600',
    String(OAuthState.schema.path('createdAt').options.expires));
  const idIdx = OAuthIdentity.schema.indexes().find(([f]) => f.provider && f.subject);
  check('one provider subject can link to only one account', 'true',
    String(Boolean(idIdx && idIdx[1] && idIdx[1].unique)));
  check('state is unique in the schema', 'true',
    String(Boolean(OAuthState.schema.path('state').options.unique)));

  if (live) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  provider.close();
  patientService.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n--- summary ---\n${passed} of ${results.length} checks matched the expected behaviour`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
