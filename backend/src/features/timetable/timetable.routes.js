const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./timetable.controller');

// --- Lesson writes — School-Admin-only, flat resource --------------------------
const lessonsRouter = express.Router();
lessonsRouter.use(authenticate);
lessonsRouter.use(requireCredentialsEstablished);
lessonsRouter.use(requireRole('SCHOOL_ADMIN'));
lessonsRouter.post('/', controller.createLesson);
lessonsRouter.patch('/:lessonId', controller.updateLesson);
lessonsRouter.patch('/:lessonId/archive', controller.archiveLesson);
lessonsRouter.patch('/:lessonId/reactivate', controller.reactivateLesson);
// Architecture Update (Generation-First)
lessonsRouter.patch('/:lessonId/lock', controller.lockLesson);
lessonsRouter.patch('/:lessonId/unlock', controller.unlockLesson);

// --- Lesson Groups (double periods) — School-Admin-only, Architecture Update --
const lessonGroupsRouter = express.Router();
lessonGroupsRouter.use(authenticate);
lessonGroupsRouter.use(requireCredentialsEstablished);
lessonGroupsRouter.use(requireRole('SCHOOL_ADMIN'));
lessonGroupsRouter.patch('/:groupId/split', controller.splitLessonGroup);

// --- Views, printing/PDF, and Quality Score ------------------------------------
// GETs permit both SCHOOL_ADMIN and TEACHER (Teacher access is further
// self-scoped inside the controller for the {teacherId} routes) — the same
// "GETs additionally permit TEACHER, every write School-Admin-only" shape
// School Schedule Management's own routes already established.
const timetableRouter = express.Router();
timetableRouter.use(authenticate);
timetableRouter.use(requireCredentialsEstablished);

// /me registered before /teachers/:teacherId, the same ordering precedent
// Teacher Management's own teachers.routes.js already establishes.
timetableRouter.get('/me', requireRole('TEACHER'), controller.getOwnTimetable);
timetableRouter.get('/me/pdf', requireRole('TEACHER'), controller.getOwnTimetablePdf);
timetableRouter.get('/quality-score', requireRole('SCHOOL_ADMIN'), controller.getQualityScore);
// (Teacher weekly capacity Hard Constraint, Business Rule #30) A proactive
// check, School-Admin-only — registered here (not under /teachers/) so it
// can never be captured by /teachers/:teacherId below.
timetableRouter.get('/teacher-capacity-check', requireRole('SCHOOL_ADMIN'), controller.getTeacherCapacityReport);

// Architecture Update (Generation-First) — generation-jobs registered before
// any path segment that could ambiguously overlap; none do here, but kept
// grouped together for readability.
timetableRouter.post('/generate', requireRole('SCHOOL_ADMIN'), controller.generateTimetable);
timetableRouter.get('/generation-jobs', requireRole('SCHOOL_ADMIN'), controller.listGenerationJobs);
timetableRouter.get('/generation-jobs/:jobId', requireRole('SCHOOL_ADMIN'), controller.getGenerationJob);
timetableRouter.post('/publish', requireRole('SCHOOL_ADMIN'), controller.publishTimetable);

timetableRouter.get('/master', requireRole('SCHOOL_ADMIN'), controller.getMasterTimetable);
timetableRouter.get('/master/pdf', requireRole('SCHOOL_ADMIN'), controller.getMasterTimetablePdf);
timetableRouter.get('/classes/:classId', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.getClassTimetable);
timetableRouter.get('/classes/:classId/pdf', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.getClassTimetablePdf);
timetableRouter.get('/teachers/:teacherId', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.getTeacherTimetable);
timetableRouter.get('/teachers/:teacherId/pdf', requireRole('SCHOOL_ADMIN', 'TEACHER'), controller.getTeacherTimetablePdf);

// --- Teacher schedule preference, nested under the existing /teachers prefix --
// A separate router mounted at the SAME /api/v1/teachers prefix Teacher
// Management's own teachersRouter already uses — Express tries each router
// registered at a prefix in turn, so this never requires modifying that
// feature's own routes.js, per Feature Ownership / Loose Coupling. /me
// registered first, mirroring Teacher Management's own ordering.
const teacherPreferenceRouter = express.Router();
teacherPreferenceRouter.use(authenticate);
teacherPreferenceRouter.use(requireCredentialsEstablished);
teacherPreferenceRouter.get('/me/schedule-preference', requireRole('TEACHER'), controller.getOwnTeacherPreference);
teacherPreferenceRouter.put('/me/schedule-preference', requireRole('TEACHER'), controller.updateOwnTeacherPreference);
teacherPreferenceRouter.get('/:teacherId/schedule-preference', requireRole('SCHOOL_ADMIN'), controller.getTeacherPreference);
teacherPreferenceRouter.put('/:teacherId/schedule-preference', requireRole('SCHOOL_ADMIN'), controller.updateTeacherPreference);

// --- Subject (Teacher Subject Assignment) schedule preference -----------------
// Nested under the existing /teacher-subject-assignments prefix, the same
// "separate router, same prefix" shape as above.
// requireRole applied per-route, not as blanket router-level middleware —
// this router is mounted at the same prefix as, and before, Teacher Subject
// Assignment's own router (see app.js), whose own /me route must still be
// reachable by a Teacher; a blanket .use(requireRole(...)) here would
// intercept and reject that request before it ever reaches that route,
// even though this router defines no route matching it at all. This is the
// exact bug already found and fixed once for teacherPreferenceRouter's own
// relationship with Teacher Management's router — same fix, same reasoning.
const subjectPreferenceRouter = express.Router();
subjectPreferenceRouter.use(authenticate);
subjectPreferenceRouter.use(requireCredentialsEstablished);
subjectPreferenceRouter.get('/:assignmentId/schedule-preference', requireRole('SCHOOL_ADMIN'), controller.getSubjectPreference);
subjectPreferenceRouter.put('/:assignmentId/schedule-preference', requireRole('SCHOOL_ADMIN'), controller.updateSubjectPreference);

// --- School Optimization Settings — a singleton, resolved from the token ------
const optimizationSettingsRouter = express.Router();
optimizationSettingsRouter.use(authenticate);
optimizationSettingsRouter.use(requireCredentialsEstablished);
optimizationSettingsRouter.use(requireRole('SCHOOL_ADMIN'));
optimizationSettingsRouter.get('/', controller.getOptimizationSettings);
optimizationSettingsRouter.patch('/', controller.updateOptimizationSettings);

// --- Super Admin oversight (read-only), mirroring every prior feature's own --
// nested-route precedent. mergeParams required for :schoolId to reach
// req.params here.
const timetableAdminRouter = express.Router({ mergeParams: true });
timetableAdminRouter.use(authenticate);
timetableAdminRouter.use(requireCredentialsEstablished);
timetableAdminRouter.use(requireRole('SUPER_ADMIN'));
timetableAdminRouter.get('/master', controller.getMasterTimetableForSchool);
timetableAdminRouter.get('/classes/:classId', controller.getClassTimetableForSchool);
timetableAdminRouter.get('/teachers/:teacherId', controller.getTeacherTimetableForSchool);

module.exports = {
  lessonsRouter,
  lessonGroupsRouter,
  timetableRouter,
  teacherPreferenceRouter,
  subjectPreferenceRouter,
  optimizationSettingsRouter,
  timetableAdminRouter,
};
