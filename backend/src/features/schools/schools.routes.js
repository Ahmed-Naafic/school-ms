const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./schools.controller');

const router = express.Router();

// Every route in this feature requires authentication first, per
// System-Architecture.md's Security Model. An account that hasn't yet
// established its own credentials (Business Rule #23) cannot act here either.
router.use(authenticate);
router.use(requireCredentialsEstablished);

router.post('/', requireRole('SUPER_ADMIN'), controller.createSchool);

router.get('/', requireRole('SUPER_ADMIN'), controller.listSchools);

router.get('/statistics', requireRole('SUPER_ADMIN'), controller.getPlatformStatistics);

// School Admin may view their own school (enforced via assertSameSchool in
// the controller); Super Admin may view any.
router.get('/:schoolId', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'), controller.getSchoolById);

router.patch('/:schoolId/identity', requireRole('SUPER_ADMIN'), controller.updateCoreIdentity);

// Operational profile: School Admin (own school, enforced in the controller
// via assertSameSchool) or Super Admin, per Business Rule #14.
router.patch(
  '/:schoolId/profile',
  requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  controller.updateOperationalProfile
);

router.patch('/:schoolId/suspend', requireRole('SUPER_ADMIN'), controller.suspendSchool);
router.patch('/:schoolId/reactivate', requireRole('SUPER_ADMIN'), controller.reactivateSchool);
router.patch('/:schoolId/close', requireRole('SUPER_ADMIN'), controller.closeSchool);
router.patch('/:schoolId/reopen', requireRole('SUPER_ADMIN'), controller.reopenSchool);
router.patch(
  '/:schoolId/subscription',
  requireRole('SUPER_ADMIN'),
  controller.updateSubscriptionStatus
);
router.patch(
  '/:schoolId/education-levels',
  requireRole('SUPER_ADMIN'),
  controller.updateEducationLevels
);

module.exports = router;
