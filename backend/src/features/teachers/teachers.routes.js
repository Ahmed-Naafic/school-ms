const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./teachers.controller');

const teachersRouter = express.Router();

teachersRouter.use(authenticate);
teachersRouter.use(requireCredentialsEstablished);

// Teacher self-service — resolved strictly from the authenticated user's
// own token, never a client-supplied teacherId (Business Rule #12).
// Registered before the School-Admin-only gate below, so it is reachable by
// TEACHER, mirroring Student Management's /students/me precedent exactly.
teachersRouter.get('/me', requireRole('TEACHER'), controller.getOwnProfile);
teachersRouter.patch('/me', requireRole('TEACHER'), controller.updateOwnProfile);

// Every route below is School-Admin-only, per the Business Specification's
// Permissions section. Super Admin has no operational role in a school's
// day-to-day Teacher lifecycle, consistent with every other school-level
// feature in this project.
teachersRouter.use(requireRole('SCHOOL_ADMIN'));

teachersRouter.get('/', controller.listTeachers);
teachersRouter.post('/', controller.onboardTeacher);
teachersRouter.get('/:teacherId', controller.getTeacherById);
teachersRouter.patch('/:teacherId', controller.updateTeacherProfile);

// Employment Status Transitions (WP3) — one route per named transition, per
// the Employment Status Transition Matrix. Any transition not listed here
// simply has no route at all; there is no generic status-setting endpoint.
teachersRouter.patch('/:teacherId/leave', controller.placeOnLeave);
teachersRouter.patch('/:teacherId/return-from-leave', controller.returnFromLeave);
teachersRouter.patch('/:teacherId/resign', controller.resign);
teachersRouter.patch('/:teacherId/rehire', controller.rehire);
teachersRouter.patch('/:teacherId/terminate', controller.terminate);
teachersRouter.patch('/:teacherId/retire', controller.retire);

// Department reference list (WP4) — a separate router, mounted at its own
// flat /departments path (not nested under /teachers), per the Technical
// Design's API Design section: a Department belongs to the school (the
// authenticated user's tenant), not to any single Teacher instance. Still
// implemented in this same module/file, per the Technical Design's Backend
// Design decision — mirrors Class Management's Section, not a separate
// feature.
const departmentsRouter = express.Router();

departmentsRouter.use(authenticate);
departmentsRouter.use(requireCredentialsEstablished);
departmentsRouter.use(requireRole('SCHOOL_ADMIN'));

departmentsRouter.get('/', controller.listDepartments);
departmentsRouter.post('/', controller.createDepartment);
departmentsRouter.patch('/:departmentId', controller.updateDepartment);
departmentsRouter.patch('/:departmentId/archive', controller.archiveDepartment);

module.exports = { teachersRouter, departmentsRouter };
