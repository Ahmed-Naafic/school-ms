const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./subjects.controller');

// Catalog: the platform-wide Subject definition surface, Super-Admin-only,
// per Business Rules #1, #10. Mounted at /subjects in app.js.
const subjectsRouter = express.Router();
subjectsRouter.use(authenticate);
subjectsRouter.use(requireCredentialsEstablished);
subjectsRouter.use(requireRole('SUPER_ADMIN'));

subjectsRouter.get('/', controller.listSubjects);
subjectsRouter.post('/', controller.createSubject);
subjectsRouter.patch('/:subjectId', controller.updateSubject);
subjectsRouter.patch('/:subjectId/archive', controller.archiveSubject);
subjectsRouter.patch('/:subjectId/reactivate', controller.reactivateSubject);

// School <-> Subject assignment: mounted at /schools/:schoolId/subjects in
// app.js — a separate top-level mount rather than nested inside the schools
// feature module, per the Technical Design's Architecture section (Subject
// Management owns this surface entirely; School & Platform Management has no
// reference to Subject data). `mergeParams` is required for `:schoolId` from
// the parent mount path to reach this router's own handlers.
const schoolSubjectsRouter = express.Router({ mergeParams: true });
schoolSubjectsRouter.use(authenticate);
schoolSubjectsRouter.use(requireCredentialsEstablished);

// Super Admin for any school; School Admin for their own only (enforced in
// the controller via assertSchoolAccessible), per Business Rule #10.
schoolSubjectsRouter.get('/', requireRole('SUPER_ADMIN', 'SCHOOL_ADMIN'), controller.listSchoolSubjects);
schoolSubjectsRouter.post('/:subjectId', requireRole('SUPER_ADMIN'), controller.assignSubjectToSchool);
schoolSubjectsRouter.delete('/:subjectId', requireRole('SUPER_ADMIN'), controller.removeSubjectFromSchool);

module.exports = { subjectsRouter, schoolSubjectsRouter };
