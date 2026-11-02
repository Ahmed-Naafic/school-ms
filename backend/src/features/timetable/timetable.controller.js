const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const { AuthorizationError } = require('../../shared/errors');
const service = require('./timetable.service');
const validation = require('./timetable.validation');
const pdf = require('./timetable.pdf');
const jobs = require('./timetable.jobs');
const teachersService = require('../teachers/teachers.service');

// Architecture Update (Generation-First) — School Admin's own view routes
// may explicitly request either version via ?version=draft|published
// (defaulting to draft, since that is the Administrator's own review/adjust
// context); every Teacher, Student, or Super Admin oversight route below
// always resolves PUBLISHED and never honors this query param, per
// Technical Design's own Security Considerations — a Teacher can never peek
// at an in-progress Draft by manipulating a query string.
function resolveVersionType(req) {
  return req.query.version === 'published' ? 'PUBLISHED' : 'DRAFT';
}

// req.user carries only { id (Account id), role, schoolId } — no teacherId
// claim (per Authentication & Authorization's own JWT shape). Every
// self-service/self-scoping check below resolves the caller's own Teacher
// record through Teacher Management's own getOwnProfile, the same lookup
// teachers.controller.js's own teachers/me routes already use.
async function resolveOwnTeacherId(req) {
  const teacher = await teachersService.getOwnProfile(req.user.id);
  return teacher.id;
}

// --- Lesson writes (School-Admin-only) -----------------------------------------

const createLesson = asyncHandler(async (req, res) => {
  validation.validateLessonWrite(req.body);
  const lesson = await service.createLesson(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Lesson created', data: lesson });
});

const updateLesson = asyncHandler(async (req, res) => {
  validation.validateLessonWrite(req.body);
  const lesson = await service.updateLesson(req.user.schoolId, req.params.lessonId, req.body, req.user);
  return sendSuccess(res, { message: 'Lesson updated', data: lesson });
});

const archiveLesson = asyncHandler(async (req, res) => {
  const lesson = await service.archiveLesson(req.user.schoolId, req.params.lessonId, req.user);
  return sendSuccess(res, { message: 'Lesson cancelled', data: lesson });
});

const reactivateLesson = asyncHandler(async (req, res) => {
  const lesson = await service.reactivateLesson(req.user.schoolId, req.params.lessonId, req.user);
  return sendSuccess(res, { message: 'Lesson restored', data: lesson });
});

// --- Views (School-Admin all; Teacher self-scoped only) ------------------------

// includeArchived=true surfaces a cancelled Lesson too, with a Restore
// action — otherwise reactivateLesson would have no way to be reached from
// the Master Timetable's own management UI at all.
const getMasterTimetable = asyncHandler(async (req, res) => {
  const view = await service.getMasterTimetable(req.user.schoolId, {
    includeArchived: req.query.includeArchived === 'true',
    versionType: resolveVersionType(req),
  });
  return sendSuccess(res, { message: 'Master Timetable retrieved', data: view });
});

const getClassTimetable = asyncHandler(async (req, res) => {
  const view = await service.getClassTimetable(req.user.schoolId, req.params.classId, {
    includeArchived: req.query.includeArchived === 'true',
    versionType: resolveVersionType(req),
  });
  return sendSuccess(res, { message: 'Class Timetable retrieved', data: view });
});

// A Teacher may only ever view their own Teacher Timetable — resolved and
// enforced server-side via their own Account-to-Teacher lookup, never
// trusting a client-supplied match, the same convention Teacher
// Management's own teachers/me self-service already established. Always
// PUBLISHED for a Teacher caller; a School Admin caller may request either.
const getTeacherTimetable = asyncHandler(async (req, res) => {
  let versionType = resolveVersionType(req);
  if (req.user.role === 'TEACHER') {
    const ownTeacherId = await resolveOwnTeacherId(req);
    if (ownTeacherId !== req.params.teacherId) {
      throw new AuthorizationError('You may only view your own Teacher Timetable');
    }
    versionType = 'PUBLISHED';
  }
  const view = await service.getTeacherTimetable(req.user.schoolId, req.params.teacherId, { versionType });
  return sendSuccess(res, { message: 'Teacher Timetable retrieved', data: view });
});

const getOwnTimetable = asyncHandler(async (req, res) => {
  const teacherId = await resolveOwnTeacherId(req);
  const view = await service.getTeacherTimetable(req.user.schoolId, teacherId, { versionType: 'PUBLISHED' });
  return sendSuccess(res, { message: 'Your Timetable retrieved', data: view });
});

// --- Printing / PDF export ------------------------------------------------------

const getMasterTimetablePdf = asyncHandler(async (req, res) => {
  const buffer = await pdf.generateTimetablePdf(req.user.schoolId, 'master', null, resolveVersionType(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="master-timetable.pdf"');
  return res.send(buffer);
});

const getClassTimetablePdf = asyncHandler(async (req, res) => {
  const buffer = await pdf.generateTimetablePdf(req.user.schoolId, 'class', req.params.classId, resolveVersionType(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="class-timetable.pdf"');
  return res.send(buffer);
});

const getTeacherTimetablePdf = asyncHandler(async (req, res) => {
  let versionType = resolveVersionType(req);
  if (req.user.role === 'TEACHER') {
    const ownTeacherId = await resolveOwnTeacherId(req);
    if (ownTeacherId !== req.params.teacherId) {
      throw new AuthorizationError('You may only export your own Teacher Timetable');
    }
    versionType = 'PUBLISHED';
  }
  const buffer = await pdf.generateTimetablePdf(req.user.schoolId, 'teacher', req.params.teacherId, versionType);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="teacher-timetable.pdf"');
  return res.send(buffer);
});

const getOwnTimetablePdf = asyncHandler(async (req, res) => {
  const teacherId = await resolveOwnTeacherId(req);
  const buffer = await pdf.generateTimetablePdf(req.user.schoolId, 'teacher', teacherId, 'PUBLISHED');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="my-timetable.pdf"');
  return res.send(buffer);
});

// --- Preferences and Optimization Settings --------------------------------------

const getTeacherPreference = asyncHandler(async (req, res) => {
  const preference = await service.getTeacherPreference(req.user.schoolId, req.params.teacherId);
  return sendSuccess(res, { message: 'Teacher schedule preference retrieved', data: preference });
});

const updateTeacherPreference = asyncHandler(async (req, res) => {
  validation.validateTeacherPreference(req.body);
  const preference = await service.updateTeacherPreference(req.user.schoolId, req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher schedule preference updated', data: preference });
});

const getOwnTeacherPreference = asyncHandler(async (req, res) => {
  const teacherId = await resolveOwnTeacherId(req);
  const preference = await service.getTeacherPreference(req.user.schoolId, teacherId);
  return sendSuccess(res, { message: 'Your schedule preference retrieved', data: preference });
});

const updateOwnTeacherPreference = asyncHandler(async (req, res) => {
  validation.validateTeacherPreference(req.body);
  const teacherId = await resolveOwnTeacherId(req);
  const preference = await service.updateTeacherPreference(req.user.schoolId, teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Your schedule preference updated', data: preference });
});

const getSubjectPreference = asyncHandler(async (req, res) => {
  const preference = await service.getSubjectPreference(req.user.schoolId, req.params.assignmentId);
  return sendSuccess(res, { message: 'Subject schedule preference retrieved', data: preference });
});

const updateSubjectPreference = asyncHandler(async (req, res) => {
  validation.validateSubjectPreference(req.body);
  const preference = await service.updateSubjectPreference(req.user.schoolId, req.params.assignmentId, req.body, req.user);
  return sendSuccess(res, { message: 'Subject schedule preference updated', data: preference });
});

const getOptimizationSettings = asyncHandler(async (req, res) => {
  const settings = await service.getOptimizationSettings(req.user.schoolId);
  return sendSuccess(res, { message: 'School Optimization Settings retrieved', data: settings });
});

const updateOptimizationSettings = asyncHandler(async (req, res) => {
  validation.validateOptimizationSettings(req.body);
  const settings = await service.updateOptimizationSettings(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { message: 'School Optimization Settings updated', data: settings });
});

// --- Quality Score ---------------------------------------------------------------

const getQualityScore = asyncHandler(async (req, res) => {
  const score = await service.getTimetableQualityScore(req.user.schoolId, { versionType: resolveVersionType(req) });
  return sendSuccess(res, { message: 'Timetable Quality Score retrieved (illustrative)', data: score });
});

// (Teacher weekly capacity Hard Constraint, Business Rule #30) A proactive,
// read-only check — the same figures generation's own pre-flight gate
// blocks on, available here on demand so a School Admin can find and fix an
// over-committed Teacher before ever clicking Generate.
const getTeacherCapacityReport = asyncHandler(async (req, res) => {
  const report = await service.getTeacherCapacityReport(req.user.schoolId, { academicYearId: req.query.academicYearId });
  return sendSuccess(res, { message: 'Teacher weekly capacity report retrieved', data: report });
});

// --- Generation (Architecture Update — School-Admin-only) -----------------------

const generateTimetable = asyncHandler(async (req, res) => {
  validation.validateGenerateRequest(req.body);
  const academicYearId = await service.resolveAcademicYearId(req.user.schoolId, req.body.academicYearId);
  const job = await jobs.startGenerationJob(req.user.schoolId, academicYearId, req.body.scope, req.user);
  return sendSuccess(res, { statusCode: 202, message: 'Timetable generation started', data: { jobId: job.id } });
});

const getGenerationJob = asyncHandler(async (req, res) => {
  const job = await jobs.getJob(req.user.schoolId, req.params.jobId);
  if (!job) {
    return sendSuccess(res, { statusCode: 404, message: 'Generation job not found', data: null });
  }
  return sendSuccess(res, { message: 'Generation job retrieved', data: job });
});

const listGenerationJobs = asyncHandler(async (req, res) => {
  const list = await jobs.listJobs(req.user.schoolId);
  return sendSuccess(res, { message: 'Generation jobs retrieved', data: list });
});

// --- Locking (Architecture Update) ----------------------------------------------

const lockLesson = asyncHandler(async (req, res) => {
  const lesson = await service.lockLesson(req.user.schoolId, req.params.lessonId, req.user);
  return sendSuccess(res, { message: 'Lesson locked', data: lesson });
});

const unlockLesson = asyncHandler(async (req, res) => {
  const lesson = await service.unlockLesson(req.user.schoolId, req.params.lessonId, req.user);
  return sendSuccess(res, { message: 'Lesson unlocked', data: lesson });
});

// --- Lesson Groups / Split (Architecture Update) --------------------------------

const splitLessonGroup = asyncHandler(async (req, res) => {
  await service.splitLessonGroup(req.user.schoolId, req.params.groupId, req.user);
  return sendSuccess(res, { message: 'Lesson Group split into independent Lessons', data: null });
});

// --- Publish (Architecture Update) ----------------------------------------------

const publishTimetable = asyncHandler(async (req, res) => {
  const version = await service.publishTimetableVersion(req.user.schoolId, req.body.academicYearId, req.user);
  return sendSuccess(res, { message: 'Timetable published', data: version });
});

// --- Super Admin oversight (read-only, always the Published Version) -----------

const getMasterTimetableForSchool = asyncHandler(async (req, res) => {
  const view = await service.getMasterTimetable(req.params.schoolId, { versionType: 'PUBLISHED' });
  return sendSuccess(res, { message: 'Master Timetable retrieved', data: view });
});

const getClassTimetableForSchool = asyncHandler(async (req, res) => {
  const view = await service.getClassTimetable(req.params.schoolId, req.params.classId, { versionType: 'PUBLISHED' });
  return sendSuccess(res, { message: 'Class Timetable retrieved', data: view });
});

const getTeacherTimetableForSchool = asyncHandler(async (req, res) => {
  const view = await service.getTeacherTimetable(req.params.schoolId, req.params.teacherId, { versionType: 'PUBLISHED' });
  return sendSuccess(res, { message: 'Teacher Timetable retrieved', data: view });
});

module.exports = {
  createLesson,
  updateLesson,
  archiveLesson,
  reactivateLesson,
  getMasterTimetable,
  getClassTimetable,
  getTeacherTimetable,
  getOwnTimetable,
  getMasterTimetablePdf,
  getClassTimetablePdf,
  getTeacherTimetablePdf,
  getOwnTimetablePdf,
  getTeacherPreference,
  updateTeacherPreference,
  getOwnTeacherPreference,
  updateOwnTeacherPreference,
  getSubjectPreference,
  updateSubjectPreference,
  getOptimizationSettings,
  updateOptimizationSettings,
  getQualityScore,
  getTeacherCapacityReport,
  generateTimetable,
  getGenerationJob,
  listGenerationJobs,
  lockLesson,
  unlockLesson,
  splitLessonGroup,
  publishTimetable,
  getMasterTimetableForSchool,
  getClassTimetableForSchool,
  getTeacherTimetableForSchool,
};
