
/** True when the request looks like it came from the health-check/test probe. */
const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Sends a 500 without leaking internals.
 *
 * @param {object} res     express response
 * @param {string} message safe, user-facing text
 * @param {Error}  error   the caught error (logged, never serialised)
 * @param {object} [context] extra fields for the log line
 */
const serverError = (res, message, error, context = {}) => {
  // Server-side log keeps the detail for debugging.
  console.error(`[error] ${message}`, {
    ...context,
    detail: error && error.message,
    name: error && error.name,
  });

  const body = { message };

  if (!isProduction() && error && error.name === 'ValidationError') {
    
    body.errors = Object.keys(error.errors || {});
  }

  return res.status(500).json(body);
};

module.exports = serverError;
