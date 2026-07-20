const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./subjects.service');
const validation = require('./subjects.validation');

const listSubjects = asyncHandler(async (req, res) => {
  validation.validateListSubjects(req.query);
  const { educationLevel, status } = req.query;
  const subjects = await service.listSubjects({ educationLevel, status });
  return sendSuccess(res, { message: 'Subjects retrieved', data: subjects });
});

const createSubject = asyncHandler(async (req, res) => {
  validation.validateCreateSubject(req.body);
  const subject = await service.createSubject(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Subject created', data: subject });
});

const updateSubject = asyncHandler(async (req, res) => {
  validation.validateUpdateSubject(req.body);
  const subject = await service.updateSubject(req.params.subjectId, req.body, req.user);
  return sendSuccess(res, { message: 'Subject updated', data: subject });
});

const archiveSubject = asyncHandler(async (req, res) => {
  const subject = await service.archiveSubject(req.params.subjectId, req.user);
  return sendSuccess(res, { message: 'Subject archived', data: subject });
});

const reactivateSubject = asyncHandler(async (req, res) => {
  const subject = await service.reactivateSubject(req.params.subjectId, req.user);
  return sendSuccess(res, { message: 'Subject reactivated', data: subject });
});

const assignSubjectToSchool = asyncHandler(async (req, res) => {
  const assignment = await service.assignSubjectToSchool(req.params.schoolId, req.params.subjectId, req.user);
  return sendSuccess(res, { message: 'Subject assigned to School', data: assignment });
});

const removeSubjectFromSchool = asyncHandler(async (req, res) => {
  const removed = await service.removeSubjectFromSchool(req.params.schoolId, req.params.subjectId, req.user);
  return sendSuccess(res, { message: 'Subject assignment removed', data: removed });
});

const listSchoolSubjects = asyncHandler(async (req, res) => {
  service.assertSchoolAccessible(req.user, req.params.schoolId);
  const subjects = await service.listSchoolSubjects(req.params.schoolId);
  return sendSuccess(res, { message: "School's Subjects retrieved", data: subjects });
});

module.exports = {
  listSubjects,
  createSubject,
  updateSubject,
  archiveSubject,
  reactivateSubject,
  assignSubjectToSchool,
  removeSubjectFromSchool,
  listSchoolSubjects,
};
