const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./teacher-subject-assignments.service');
const validation = require('./teacher-subject-assignments.validation');

const listAssignments = asyncHandler(async (req, res) => {
  validation.validateListAssignments(req.query);
  const { academicYearId, teacherId, subjectId, classId, sectionId, page, pageSize } = req.query;
  const {
    assignments,
    total,
    page: p,
    pageSize: ps,
  } = await service.listAssignments(req.user.schoolId, {
    academicYearId,
    teacherId,
    subjectId,
    classId,
    sectionId,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  return sendSuccess(res, {
    message: 'Teacher Subject Assignments retrieved',
    data: assignments,
    metadata: { total, page: p, pageSize: ps },
  });
});

const getAssignmentById = asyncHandler(async (req, res) => {
  const assignment = await service.getAssignmentDetail(req.user.schoolId, req.params.assignmentId);
  return sendSuccess(res, { message: 'Teacher Subject Assignment retrieved', data: assignment });
});

// UI Redesign — Teacher -> Subject -> Classes, the feature's own true
// responsibility. A pure read-side presentation of the same Active
// assignments listAssignments already returns; no new business logic.
const getGroupedAssignments = asyncHandler(async (req, res) => {
  const grouped = await service.getAssignmentsGroupedByTeacher(req.user.schoolId, { academicYearId: req.query.academicYearId });
  return sendSuccess(res, { message: 'Teacher Subject Assignments retrieved, grouped by Teacher', data: grouped });
});

const createAssignment = asyncHandler(async (req, res) => {
  validation.validateCreateAssignment(req.body);
  const assignment = await service.createAssignment(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Teacher Subject Assignment created', data: assignment });
});

const correctAssignment = asyncHandler(async (req, res) => {
  validation.validateCorrectAssignment(req.body);
  const assignment = await service.correctAssignment(req.user.schoolId, req.params.assignmentId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher Subject Assignment updated', data: assignment });
});

const replaceTeacher = asyncHandler(async (req, res) => {
  validation.validateReplaceTeacher(req.body);
  const assignment = await service.replaceTeacher(req.user.schoolId, req.params.assignmentId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Teacher replaced', data: assignment });
});

const copyAssignments = asyncHandler(async (req, res) => {
  validation.validateCopyAssignments(req.body);
  const result = await service.copyAssignments(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { message: 'Copy operation complete', data: result });
});

const getOwnAssignments = asyncHandler(async (req, res) => {
  const assignments = await service.getOwnAssignments(req.user.id, { academicYearId: req.query.academicYearId });
  return sendSuccess(res, { message: 'Your Teacher Subject Assignments retrieved', data: assignments });
});

module.exports = {
  listAssignments,
  getGroupedAssignments,
  getAssignmentById,
  createAssignment,
  correctAssignment,
  replaceTeacher,
  copyAssignments,
  getOwnAssignments,
};
