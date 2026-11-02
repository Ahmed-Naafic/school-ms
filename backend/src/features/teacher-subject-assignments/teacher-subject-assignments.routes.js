const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./teacher-subject-assignments.controller');

const router = express.Router();

router.use(authenticate);
router.use(requireCredentialsEstablished);

// Teacher self-service — resolved strictly from the authenticated user's own
// token, never a client-supplied teacherId (Business Rules #1, #18;
// Security-Standards.md's Authorization Security section). Registered
// before the School-Admin-only gate below, so it is reachable by TEACHER,
// mirroring Student/Teacher Management's own /me precedent exactly.
router.get('/me', requireRole('TEACHER'), controller.getOwnAssignments);

// Every other route is School-Admin-only, per the Business Specification's
// Permissions section — Super Admin has no operational role here.
router.use(requireRole('SCHOOL_ADMIN'));

router.get('/', controller.listAssignments);
router.post('/', controller.createAssignment);
router.post('/copy', controller.copyAssignments);
// Registered before /:assignmentId so "grouped" is never captured as a
// (nonexistent) assignmentId — the same "specific literal path before a
// param route" ordering this project's own routers already use elsewhere.
router.get('/grouped', controller.getGroupedAssignments);
router.get('/:assignmentId', controller.getAssignmentById);
router.patch('/:assignmentId', controller.correctAssignment);
router.post('/:assignmentId/replace-teacher', controller.replaceTeacher);

module.exports = router;
