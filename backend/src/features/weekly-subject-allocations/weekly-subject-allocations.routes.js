const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./weekly-subject-allocations.controller');

const router = express.Router();

// Every route in this feature requires authentication first, per
// System-Architecture.md's Security Model, and is School-Admin-only — the
// Business Specification's own Permissions section grants Super Admin no
// role in this feature at all, unlike School Schedule Management.
router.use(authenticate);
router.use(requireCredentialsEstablished);
router.use(requireRole('SCHOOL_ADMIN'));

router.get('/', controller.listAllocations);
// Registered before /:allocationId so these literal paths are never
// captured as a param.
router.get('/available-periods-preview', controller.getAvailablePeriodsPreview);
router.get('/eligible-subjects', controller.listEligibleSubjects);
router.post('/', controller.createAllocation);
router.get('/:allocationId', controller.getAllocationDetail);
router.patch('/:allocationId', controller.correctAllocation);

// No delete route — the Business Specification names no removal action.

module.exports = router;
