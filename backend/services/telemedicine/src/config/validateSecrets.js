/**
 * Refuses to start on a secret that is not really a secret.
 *
 * The startup scripts copy .env.example to .env and carry on, so a default
 * deployment signed its tokens with a value published in the repository.
 * Checking that the variable merely exists did not catch that (V-A01).
 *
 * Copied into each service rather than shared, because the services have no
 * common package.
 */

// Values that have appeared in .env.example, the README or the k8s manifests.
const PUBLISHED = [
  'change_me_to_a_long_random_string',
  'change_me_strong_password',
  'REPLACE_WITH_STRONG_RANDOM_STRING',
  'REPLACE_WITH_DB_USERNAME',
  'REPLACE_WITH_STRONG_RANDOM_PASSWORD',
  'your_gemini_api_key_here',
  'medsync_super_secret_jwt_key_2026',
  'secret',
  'changeme',
];

const MIN_LENGTH = 32;

function validateSecret(name, { minLength = MIN_LENGTH, required = true } = {}) {
  const value = process.env[name];

  if (!value) {
    if (!required) return;
    throw new Error(
      `FATAL: ${name} is not set. Generate one with: openssl rand -base64 48`
    );
  }
  if (PUBLISHED.includes(value)) {
    throw new Error(
      `FATAL: ${name} is set to a placeholder published in this repository. ` +
      'Generate a real one with: openssl rand -base64 48'
    );
  }
  if (value.length < minLength) {
    throw new Error(
      `FATAL: ${name} is ${value.length} characters; at least ${minLength} are required.`
    );
  }
}

module.exports = { validateSecret, PUBLISHED, MIN_LENGTH };
