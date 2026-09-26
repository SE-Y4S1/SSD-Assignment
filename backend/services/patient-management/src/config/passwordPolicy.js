/**
 * What counts as an acceptable password.
 *
 * Registration used to accept any eight characters, and doctor registration
 * checked nothing at all, so "password" and "12345678" were both allowed
 * (V-A09).
 *
 * Copied into each service rather than shared, because the services have no
 * common package.
 */

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

// Not a complete list, and not meant to be. It catches the handful that show up
// first in any guessing attempt, which is what the rate limit on /login is for.
const OBVIOUS = [
  'password', 'password1', 'password123', 'passw0rd', '123456789012',
  'qwertyuiop', 'letmein', 'welcome1', 'admin123', 'medsync123',
  'iloveyou', 'changeme', 'abc123456789',
];

/**
 * Returns null when the password is acceptable, or a message saying what is
 * wrong with it.
 */
function checkPassword(password) {
  if (typeof password !== 'string' || !password) {
    return 'A password is required.';
  }
  if (password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters.`;
  }
  if (password.length > MAX_LENGTH) {
    return `Password must be no more than ${MAX_LENGTH} characters.`;
  }
  const missing = [];
  if (!/[a-z]/.test(password)) missing.push('a lower case letter');
  if (!/[A-Z]/.test(password)) missing.push('an upper case letter');
  if (!/[0-9]/.test(password)) missing.push('a digit');
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('a symbol');
  if (missing.length) {
    return 'Password must contain ' + missing.join(', ') + '.';
  }
  if (OBVIOUS.includes(password.toLowerCase())) {
    return 'That password is too easy to guess. Please choose another.';
  }
  return null;
}

module.exports = { checkPassword, MIN_LENGTH, MAX_LENGTH };
