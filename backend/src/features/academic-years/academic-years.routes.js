const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./academic-years.controller');

const router = express.Router();

// Every route in this feature is School-Admin-only, tenant-scoped strictly
// from the authenticated token — Super Admin has no operational role here,
// per Academic-Year-Management.md's Actors section.
router.use(authenticate);
router.use(requireCredentialsEstablished);
router.use(requireRole('SCHOOL_ADMIN'));

router.get('/', controller.listAcademicYears);
router.post('/', controller.createAcademicYear);
router.patch('/:academicYearId', controller.updateAcademicYear);
router.patch('/:academicYearId/archive', controller.archiveAcademicYear);
router.patch('/:academicYearId/reactivate', controller.reactivateAcademicYear);
router.patch('/:academicYearId/current', controller.designateCurrentAcademicYear);

module.exports = router;
