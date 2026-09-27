/**
 * Answers a failed request without describing the failure.
 *
 * Controllers used to answer res.status(500).json({ message: error.message }),
 * which handed the caller whatever the exception said: Mongo connection
 * strings, file paths on the host, schema and collection names, and the
 * internal URLs of the other services. That is free reconnaissance, and it is
 * of no use to the person using the application (V-A14).
 *
 * The detail still goes to the service log, together with a short reference
 * that is also returned, so a support request can be matched to the log line.
 *
 * Copied into each service rather than shared, because the services have no
 * common package.
 */

const crypto = require('crypto');

const GENERIC = {
  server: 'Something went wrong. Please try again.',
  client: 'The request could not be completed.',
};

/**
 * @param {object}  res      Express response
 * @param {Error}   err      what was caught
 * @param {string}  context  where it was caught, for the log line
 * @param {object} [options] status, and a public message when there is a safe
 *                           one worth saying
 */
function respondWithError(res, err, context, options = {}) {
  const status = options.status || 500;
  const reference = crypto.randomBytes(4).toString('hex');

  console.error(`[${context}] ${reference}`, (err && err.stack) || err);

  let message = options.message;
  if (!message) {
    // A schema validation failure is about what the caller sent, so its text is
    // safe to repeat and is the only thing they can act on.
    if (status < 500 && err && err.name === 'ValidationError' && err.errors) {
      message = Object.values(err.errors)
        .map((e) => e.message)
        .join(' ');
    }
    message = message || (status >= 500 ? GENERIC.server : GENERIC.client);
  }

  return res.status(status).json({ message, reference });
}

module.exports = { respondWithError, GENERIC };
