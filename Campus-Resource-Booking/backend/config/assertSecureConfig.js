/**
 * assertSecureConfig.js — refuse to start with an unsafe configuration.
 *
 * Why: the original config shipped `JWT_SECRET=your_jwt_secret_key`, a value
 * copied from a tutorial. Anyone who knows it can sign a token that
 * authMiddleware.js will accept, impersonating any user including an admin.
 * Failing at boot turns a silent, exploitable default into an obvious error.
 *
 * Called once from server.js before the database connects.
 */

const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /secret[_-]?key$/i,
  /^changeme$/i,
  /^replace[_-]/i,
  /^example/i,
  /^test/i,
  /^123456/,
];

const MIN_SECRET_LENGTH = 32;

const assertSecureConfig = () => {
  const problems = [];
  const { JWT_SECRET, MONGO_URI, NODE_ENV } = process.env;

  // --- JWT secret ---------------------------------------------------------
  if (!JWT_SECRET) {
    problems.push('JWT_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
  } else {
    if (JWT_SECRET.length < MIN_SECRET_LENGTH) {
      problems.push(
        `JWT_SECRET is only ${JWT_SECRET.length} characters. Use at least ${MIN_SECRET_LENGTH}.`
      );
    }

    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(JWT_SECRET))) {
      problems.push('JWT_SECRET still looks like a placeholder value from a template.');
    }
  }

  // --- database -----------------------------------------------------------
  if (!MONGO_URI) {
    problems.push('MONGO_URI is not set.');
  }

  if (problems.length === 0) {
    return;
  }

  console.error('\n[FATAL] Insecure configuration - refusing to start:');
  problems.forEach((problem) => console.error(`  - ${problem}`));

  if (NODE_ENV !== 'production') {
    console.error(
      '\nAdd a strong JWT_SECRET to backend/.env, for example:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"\n'
    );
  }

  process.exit(1);
};

module.exports = assertSecureConfig;
