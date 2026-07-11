const { AuthorizationError } = require('../shared/errors');
const prisma = require('../config/database');

// Business Rule #23: an account in MUST_CHANGE_CREDENTIALS status must
// establish its own permanent credentials before it can perform any other
// action. Applied to every route except login, logout, and the
// password-change/reset endpoints themselves.
async function requireCredentialsEstablished(req, res, next) {
  const account = await prisma.account.findUnique({ where: { id: req.user.id } });
  if (account && account.status === 'MUST_CHANGE_CREDENTIALS') {
    return next(new AuthorizationError('You must change your credentials before performing this action'));
  }
  next();
}

module.exports = requireCredentialsEstablished;
