/**
 * Google OpenID Connect configuration for the "Sign in with Google" feature.
 *
 * The authorization code is exchanged on this server, never in the browser, so
 * the client secret is never shipped to a client. The endpoints below are
 * Google's published OIDC endpoints; they are pinned here rather than
 * discovered at runtime so that a compromised or spoofed discovery document
 * cannot redirect the flow somewhere else.
 */

const ISSUER = 'https://accounts.google.com';
const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

// Only what is needed to identify the person. No Gmail, Drive or contacts
// scope is requested, because none of it is used.
const SCOPE = 'openid email profile';

function config() {
  return {
    issuer: process.env.OAUTH_ISSUER || ISSUER,
    authorizationEndpoint: process.env.OAUTH_AUTHORIZATION_ENDPOINT || AUTHORIZATION_ENDPOINT,
    tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT || TOKEN_ENDPOINT,
    jwksUri: process.env.OAUTH_JWKS_URI || JWKS_URI,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:5000/api/auth/oauth/google/callback',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    scope: SCOPE,
  };
}

// The feature is optional: a deployment without Google credentials still runs,
// and the route simply reports that the provider is not configured rather than
// the service refusing to start.
function isConfigured() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret);
}

module.exports = { config, isConfigured, SCOPE };
