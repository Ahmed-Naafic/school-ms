const bcrypt = require('bcryptjs');
const { BCRYPT_SALT_ROUNDS } = require('../config/security');

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, verifyPassword };
