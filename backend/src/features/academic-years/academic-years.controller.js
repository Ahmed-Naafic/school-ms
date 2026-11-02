const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./academic-years.service');
const validation = require('./academic-years.validation');

const listAcademicYears = asyncHandler(async (req, res) => {
  validation.validateListAcademicYears(req.query);
  const academicYears = await service.listAcademicYears(req.user.schoolId, { status: req.query.status });
  return sendSuccess(res, { message: 'Academic Years retrieved', data: academicYears });
});

const createAcademicYear = asyncHandler(async (req, res) => {
  validation.validateCreateAcademicYear(req.body);
  const academicYear = await service.createAcademicYear(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Academic Year created', data: academicYear });
});

const updateAcademicYear = asyncHandler(async (req, res) => {
  validation.validateUpdateAcademicYear(req.body);
  const academicYear = await service.updateAcademicYear(
    req.user.schoolId,
    req.params.academicYearId,
    req.body,
    req.user
  );
  return sendSuccess(res, { message: 'Academic Year updated', data: academicYear });
});

const archiveAcademicYear = asyncHandler(async (req, res) => {
  const academicYear = await service.archiveAcademicYear(
    req.user.schoolId,
    req.params.academicYearId,
    req.body ? req.body.newCurrentAcademicYearId : undefined,
    req.user
  );
  return sendSuccess(res, { message: 'Academic Year archived', data: academicYear });
});

const reactivateAcademicYear = asyncHandler(async (req, res) => {
  const academicYear = await service.reactivateAcademicYear(req.user.schoolId, req.params.academicYearId, req.user);
  return sendSuccess(res, { message: 'Academic Year reactivated', data: academicYear });
});

const designateCurrentAcademicYear = asyncHandler(async (req, res) => {
  const academicYear = await service.designateCurrentAcademicYear(
    req.user.schoolId,
    req.params.academicYearId,
    req.user
  );
  return sendSuccess(res, { message: 'Current Academic Year updated', data: academicYear });
});

module.exports = {
  listAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  archiveAcademicYear,
  reactivateAcademicYear,
  designateCurrentAcademicYear,
};
