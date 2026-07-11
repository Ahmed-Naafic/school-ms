const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY_DAYS } = require('../config/jwt');

// Access token carries the claims Authorization checks need, per
// Technical Design's "role/permission checks resolved from the JWT's claims."
function signAccessToken(account) {
  return jwt.sign(
    { sub: account.id, role: account.role, schoolId: account.schoolId },
    env.jwt.accessSecret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

// Refresh tokens are opaque, high-entropy values tracked server-side by
// reference (a hash, not the raw value) per Security-Standards.md.
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function refreshTokenExpiryDate() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiry;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
};
