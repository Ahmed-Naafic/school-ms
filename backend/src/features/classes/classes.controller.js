const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./classes.service');
const validation = require('./classes.validation');

const listClasses = asyncHandler(async (req, res) => {
  const classes = await service.listClasses(req.user.schoolId);
  return sendSuccess(res, { message: 'Classes retrieved', data: classes });
});

const getClassById = asyncHandler(async (req, res) => {
  const cls = await service.getClassOrThrow(req.user.schoolId, req.params.classId);
  return sendSuccess(res, { message: 'Class retrieved', data: cls });
});

const createClass = asyncHandler(async (req, res) => {
  validation.validateCreateClass(req.body);
  const cls = await service.createClass(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Class created', data: cls });
});

const updateClass = asyncHandler(async (req, res) => {
  validation.validateUpdateClass(req.body);
  const cls = await service.updateClass(req.params.classId, req.body, req.user);
  return sendSuccess(res, { message: 'Class updated', data: cls });
});

const archiveClass = asyncHandler(async (req, res) => {
  const cls = await service.archiveClass(req.params.classId, req.user);
  return sendSuccess(res, { message: 'Class archived', data: cls });
});

const reactivateClass = asyncHandler(async (req, res) => {
  const cls = await service.reactivateClass(req.params.classId, req.user);
  return sendSuccess(res, { message: 'Class reactivated', data: cls });
});

const reorderClass = asyncHandler(async (req, res) => {
  validation.validateReorderClass(req.body);
  const classes = await service.reorderClass(req.params.classId, req.body.position, req.user);
  return sendSuccess(res, { message: 'Class sequence updated', data: classes });
});

const designateFinalClass = asyncHandler(async (req, res) => {
  const cls = await service.designateFinalClass(req.params.classId, req.user);
  return sendSuccess(res, { message: 'Final Class designated', data: cls });
});

const createSection = asyncHandler(async (req, res) => {
  validation.validateCreateSection(req.body);
  const section = await service.createSection(req.params.classId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Section created', data: section });
});

const updateSection = asyncHandler(async (req, res) => {
  validation.validateUpdateSection(req.body);
  const section = await service.updateSection(req.params.classId, req.params.sectionId, req.body, req.user);
  return sendSuccess(res, { message: 'Section updated', data: section });
});

const archiveSection = asyncHandler(async (req, res) => {
  const section = await service.archiveSection(req.params.classId, req.params.sectionId, req.user);
  return sendSuccess(res, { message: 'Section archived', data: section });
});

const reactivateSection = asyncHandler(async (req, res) => {
  const section = await service.reactivateSection(req.params.classId, req.params.sectionId, req.user);
  return sendSuccess(res, { message: 'Section reactivated', data: section });
});

// --- GradeLevel (ACR-009, Architecture Update — Grade/Form) ----------------

const listGradeLevels = asyncHandler(async (req, res) => {
  const gradeLevels = await service.listGradeLevels(req.user.schoolId, { status: req.query.status });
  return sendSuccess(res, { message: 'Grade/Forms retrieved', data: gradeLevels });
});

const getGradeLevelById = asyncHandler(async (req, res) => {
  const gradeLevel = await service.getGradeLevelOrThrow(req.user.schoolId, req.params.gradeLevelId);
  return sendSuccess(res, { message: 'Grade/Form retrieved', data: gradeLevel });
});

const createGradeLevel = asyncHandler(async (req, res) => {
  validation.validateCreateGradeLevel(req.body);
  const gradeLevel = await service.createGradeLevel(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Grade/Form created', data: gradeLevel });
});

const updateGradeLevel = asyncHandler(async (req, res) => {
  validation.validateUpdateGradeLevel(req.body);
  const gradeLevel = await service.updateGradeLevel(req.params.gradeLevelId, req.body, req.user);
  return sendSuccess(res, { message: 'Grade/Form updated', data: gradeLevel });
});

const reorderGradeLevel = asyncHandler(async (req, res) => {
  validation.validateReorderGradeLevel(req.body);
  const gradeLevels = await service.reorderGradeLevel(req.params.gradeLevelId, req.body.position, req.user);
  return sendSuccess(res, { message: 'Grade/Form sequence updated', data: gradeLevels });
});

const archiveGradeLevel = asyncHandler(async (req, res) => {
  const gradeLevel = await service.archiveGradeLevel(req.params.gradeLevelId, req.user);
  return sendSuccess(res, { message: 'Grade/Form archived', data: gradeLevel });
});

const reactivateGradeLevel = asyncHandler(async (req, res) => {
  const gradeLevel = await service.reactivateGradeLevel(req.params.gradeLevelId, req.user);
  return sendSuccess(res, { message: 'Grade/Form reactivated', data: gradeLevel });
});

module.exports = {
  listClasses,
  getClassById,
  createClass,
  updateClass,
  archiveClass,
  reactivateClass,
  reorderClass,
  designateFinalClass,
  createSection,
  updateSection,
  archiveSection,
  reactivateSection,
  listGradeLevels,
  getGradeLevelById,
  createGradeLevel,
  updateGradeLevel,
  reorderGradeLevel,
  archiveGradeLevel,
  reactivateGradeLevel,
};
