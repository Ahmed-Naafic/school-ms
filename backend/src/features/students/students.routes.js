const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./students.controller');

const router = express.Router();

router.use(authenticate);
router.use(requireCredentialsEstablished);

// Student's own self-service view — resolved strictly from the authenticated
// user's own account, never a client-supplied studentId (Business Rule #11,
// Security-Standards.md's Authorization Security section). Registered before
// the School-Admin-only role gate below, so it is reachable by STUDENT.
router.get('/me', requireRole('STUDENT'), controller.getOwnProfile);

// Every other route in this feature is School-Admin-only, per
// Class-Management.md's Actors-section precedent — Super Admin has no
// operational role in a school's day-to-day Student lifecycle.
router.use(requireRole('SCHOOL_ADMIN'));

router.get('/', controller.listStudents);
router.post('/', controller.admitStudent);
router.get('/:studentId', controller.getStudentById);
router.patch('/:studentId', controller.updateProfile);
router.post('/:studentId/enrollments', controller.enrollStudent);
router.patch('/:studentId/promote', controller.promoteStudent);
router.patch('/:studentId/correct-class', controller.correctClass);
router.patch('/:studentId/transfer', controller.transferStudent);
router.patch('/:studentId/withdraw', controller.withdrawStudent);
router.patch('/:studentId/restore-withdrawal', controller.restoreWithdrawal);
router.patch('/:studentId/graduate', controller.graduateStudent);

module.exports = router;
