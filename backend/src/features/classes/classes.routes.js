const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./classes.controller');

const router = express.Router();

// Every route in this feature requires authentication first, per
// System-Architecture.md's Security Model, and is School-Admin-only —
// Super Admin has no operational role here, per Class-Management.md's Actors
// section (consistent with School-Management.md's own boundary).
router.use(authenticate);
router.use(requireCredentialsEstablished);
router.use(requireRole('SCHOOL_ADMIN'));

router.get('/', controller.listClasses);
router.post('/', controller.createClass);
router.get('/:classId', controller.getClassById);
router.patch('/:classId', controller.updateClass);
router.patch('/:classId/archive', controller.archiveClass);
router.patch('/:classId/reactivate', controller.reactivateClass);
router.patch('/:classId/sequence', controller.reorderClass);
router.patch('/:classId/designate-final', controller.designateFinalClass);

router.post('/:classId/sections', controller.createSection);
router.patch('/:classId/sections/:sectionId', controller.updateSection);
router.patch('/:classId/sections/:sectionId/archive', controller.archiveSection);
router.patch('/:classId/sections/:sectionId/reactivate', controller.reactivateSection);

// (ACR-009, Architecture Update — Grade/Form) A new top-level resource, not
// nested under /classes — a GradeLevel is a peer grouping above Class, not
// a child of one, the same reasoning /shifts is not nested under any other
// resource. Mounted at /api/v1/grade-levels by app.js.
const gradeLevelsRouter = express.Router();
gradeLevelsRouter.use(authenticate);
gradeLevelsRouter.use(requireCredentialsEstablished);
gradeLevelsRouter.use(requireRole('SCHOOL_ADMIN'));

gradeLevelsRouter.get('/', controller.listGradeLevels);
gradeLevelsRouter.post('/', controller.createGradeLevel);
gradeLevelsRouter.get('/:gradeLevelId', controller.getGradeLevelById);
gradeLevelsRouter.patch('/:gradeLevelId', controller.updateGradeLevel);
gradeLevelsRouter.patch('/:gradeLevelId/sequence', controller.reorderGradeLevel);
gradeLevelsRouter.patch('/:gradeLevelId/archive', controller.archiveGradeLevel);
gradeLevelsRouter.patch('/:gradeLevelId/reactivate', controller.reactivateGradeLevel);

module.exports = { classesRouter: router, gradeLevelsRouter };
