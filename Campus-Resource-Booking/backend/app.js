const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const resourceRoutes = require('./routes/resourceRoutes');

const app = express();

/*
 * CORS
 * ----
 * `cors()` with no options reflects *any* Origin, letting every website read
 * this API's responses. The allowlist below is the intended deployment shape.
 *
 * Requests with no Origin header (curl, Postman, server-to-server) are always
 * allowed: CORS is a browser control, so blocking them would add no security
 * while breaking the API for non-browser clients.
 */
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin: not a browser cross-origin request.
      if (!origin) {
        return callback(null, true);
      }

      // An empty allowlist means "same-origin only" in production. In
      // development, fall back to the local static server so the app still runs.
      if (allowedOrigins.length === 0) {
        const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

        if (process.env.NODE_ENV === 'production' || !isLocal) {
          return callback(null, false);
        }

        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Rejected: no CORS headers are sent, so the browser blocks the read.
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  })
);

// Bounded body size: a huge JSON payload should be rejected, not buffered.
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/resources', resourceRoutes);

app.get('/api/test', (req, res) => {
  res.json({
    message: 'Campus Resource Booking API is running',
  });
});

// Unknown /api routes get JSON, not Express's default HTML error page.
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Central error handler. Without this, a thrown error in a route leaks an
// HTML stack trace to the client.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large' });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ message: 'Malformed JSON in request body' });
  }

  console.error('[error] Unhandled route error:', error && error.message);

  return res.status(500).json({ message: 'Something went wrong' });
});

module.exports = app;
