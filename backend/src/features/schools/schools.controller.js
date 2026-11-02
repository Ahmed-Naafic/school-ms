const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const { assertSameSchool } = require('../../middlewares/authorize');
const service = require('./schools.service');
const validation = require('./schools.validation');

const createSchool = asyncHandler(async (req, res) => {
  validation.validateCreateSchool(req.body);
  const school = await service.createSchool(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'School created', data: school });
});

const listSchools = asyncHandler(async (req, res) => {
  const schools = await service.listSchools();
  return sendSuccess(res, { message: 'Schools retrieved', data: schools });
});

const getSchoolById = asyncHandler(async (req, res) => {
  const school = await service.getSchoolOrThrow(req.params.schoolId);
  assertSameSchool(req.user, school.id);
  return sendSuccess(res, { message: 'School retrieved', data: school });
});

const updateCoreIdentity = asyncHandler(async (req, res) => {
  validation.validateUpdateCoreIdentity(req.body);
  const school = await service.updateCoreIdentity(req.params.schoolId, req.body.name, req.user);
  return sendSuccess(res, { message: 'School identity updated', data: school });
});

const updateOperationalProfile = asyncHandler(async (req, res) => {
  validation.validateUpdateOperationalProfile(req.body);

  const existing = await service.getSchoolOrThrow(req.params.schoolId);
  assertSameSchool(req.user, existing.id);

  const school = await service.updateOperationalProfile(req.params.schoolId, req.body, req.user);
  return sendSuccess(res, { message: 'School profile updated', data: school });
});

const suspendSchool = asyncHandler(async (req, res) => {
  const school = await service.suspendSchool(req.params.schoolId, req.user);
  return sendSuccess(res, { message: 'School suspended', data: school });
});

const reactivateSchool = asyncHandler(async (req, res) => {
  const school = await service.reactivateSchool(req.params.schoolId, req.user);
  return sendSuccess(res, { message: 'School reactivated', data: school });
});

const closeSchool = asyncHandler(async (req, res) => {
  const school = await service.closeSchool(req.params.schoolId, req.user);
  return sendSuccess(res, { message: 'School closed', data: school });
});

const reopenSchool = asyncHandler(async (req, res) => {
  const school = await service.reopenSchool(req.params.schoolId, req.user);
  return sendSuccess(res, { message: 'School reopened', data: school });
});

const updateSubscriptionStatus = asyncHandler(async (req, res) => {
  validation.validateSubscriptionUpdate(req.body);
  const school = await service.updateSubscriptionStatus(
    req.params.schoolId,
    req.body.subscriptionStatus,
    req.user
  );
  return sendSuccess(res, { message: 'Subscription status updated', data: school });
});

const getPlatformStatistics = asyncHandler(async (req, res) => {
  const stats = await service.getPlatformStatistics();
  return sendSuccess(res, { message: 'Platform statistics retrieved', data: stats });
});

const updateEducationLevels = asyncHandler(async (req, res) => {
  validation.validateUpdateEducationLevels(req.body);
  const school = await service.updateEducationLevels(req.params.schoolId, req.body.educationLevels, req.user);
  return sendSuccess(res, { message: 'Education Levels updated', data: school });
});

module.exports = {
  createSchool,
  listSchools,
  getSchoolById,
  updateCoreIdentity,
  updateOperationalProfile,
  suspendSchool,
  reactivateSchool,
  closeSchool,
  reopenSchool,
  updateSubscriptionStatus,
  updateEducationLevels,
  getPlatformStatistics,
};
