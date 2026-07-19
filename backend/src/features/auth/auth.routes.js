const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const { createRateLimiter } = require('../../middlewares/rate-limiter');
const controller = require('./auth.controller');

const router = express.Router();

// Beyond per-account lockout, rate-limit per source on authentication-adjacent
// endpoints, per Security-Standards.md's Rate Limiting and Abuse Prevention section.
const loginLimiter = createRateLimiter({ windowMinutes: 15, max: 20 });
const passwordResetLimiter = createRateLimiter({ windowMinutes: 15, max: 5 });
const accountCreationLimiter = createRateLimiter({ windowMinutes: 15, max: 30 });

// --- Public routes ---------------------------------------------------------

router.post('/login', loginLimiter, controller.login);
router.post('/refresh', controller.refresh);
router.post('/password-reset/request', passwordResetLimiter, controller.requestPasswordReset);
router.post('/password-reset/confirm', passwordResetLimiter, controller.confirmPasswordReset);

// --- Authenticated routes ---------------------------------------------------

router.post('/logout', authenticate, controller.logout);

// Allowed even while MUST_CHANGE_CREDENTIALS — this is how that state is
// cleared for accounts that already have a password (the bootstrap Super
// Admin), per Business Rule #23.
router.patch('/password', authenticate, controller.changePassword);

router.post(
  '/accounts',
  authenticate,
  requireCredentialsEstablished,
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  accountCreationLimiter,
  controller.createAccount
);

router.get(
  '/accounts',
  authenticate,
  requireCredentialsEstablished,
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  controller.listAccounts
);

router.patch(
  '/accounts/:accountId/deactivate',
  authenticate,
  requireCredentialsEstablished,
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  controller.deactivateAccount
);

router.patch(
  '/accounts/:accountId/reactivate',
  authenticate,
  requireCredentialsEstablished,
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  controller.reactivateAccount
);

router.patch(
  '/accounts/:accountId/unlock',
  authenticate,
  requireCredentialsEstablished,
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  controller.unlockAccount
);

router.patch(
  '/accounts/:accountId/role',
  authenticate,
  requireCredentialsEstablished,
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  controller.changeRole
);

module.exports = router;
