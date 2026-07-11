const rateLimit = require('express-rate-limit');

// Rate limiting beyond account lockout, per Security-Standards.md's Rate
// Limiting and Abuse Prevention section: authentication-adjacent endpoints
// (password reset requests, account creation) are rate-limited per source,
// independent of the per-account lockout mechanism.
function createRateLimiter({ windowMinutes, max }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests. Please try again later.',
      errors: null,
    },
  });
}

module.exports = { createRateLimiter };
