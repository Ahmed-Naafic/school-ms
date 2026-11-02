const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./weekly-subject-allocations.service');
const validation = require('./weekly-subject-allocations.validation');

const listAllocations = asyncHandler(async (req, res) => {
  const allocations = await service.listAllocations(req.user.schoolId, {
    academicYearId: req.query.academicYearId,
    gradeLevelId: req.query.gradeLevelId,
  });
  return sendSuccess(res, { message: 'Weekly Subject Allocations retrieved', data: allocations });
});

// A read-only preview for the Web frontend's own Create flow, before any
// allocation exists yet — see the Technical Design's Backend Design.
const getAvailablePeriodsPreview = asyncHandler(async (req, res) => {
  const availablePeriods = await service.getAvailablePeriodsPreview(req.user.schoolId, req.query.gradeLevelId);
  return sendSuccess(res, { message: 'Available periods calculated', data: { availablePeriods } });
});

const listEligibleSubjects = asyncHandler(async (req, res) => {
  const subjects = await service.listEligibleSubjectsWithTeachers(
    req.user.schoolId,
    req.query.gradeLevelId,
    req.query.academicYearId
  );
  return sendSuccess(res, { message: 'Eligible Subjects retrieved', data: subjects });
});

const getAllocationDetail = asyncHandler(async (req, res) => {
  const allocation = await service.getAllocationDetail(req.user.schoolId, req.params.allocationId);
  return sendSuccess(res, { message: 'Weekly Subject Allocation retrieved', data: allocation });
});

const createAllocation = asyncHandler(async (req, res) => {
  validation.validateCreateAllocation(req.body);
  const allocation = await service.createAllocation(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Weekly Subject Allocation created', data: allocation });
});

const correctAllocation = asyncHandler(async (req, res) => {
  validation.validateCorrectAllocation(req.body);
  const allocation = await service.correctAllocation(req.params.allocationId, req.body, req.user);
  return sendSuccess(res, { message: 'Weekly Subject Allocation updated', data: allocation });
});

module.exports = {
  listAllocations,
  getAvailablePeriodsPreview,
  listEligibleSubjects,
  getAllocationDetail,
  createAllocation,
  correctAllocation,
};
