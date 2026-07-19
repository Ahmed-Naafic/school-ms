const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./teachers.service');
const validation = require('./teachers.validation');

const listTeachers = asyncHandler(async (req, res) => {
  validation.validateListTeachers(req.query);
  const { employmentStatus, departmentId, page, pageSize } = req.query;
  const {
    teachers,
    total,
    page: p,
    pageSize: ps,
  } = await service.listTeachers(
    {
      employmentStatus,
      departmentId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    },
    req.user
  );
  return sendSuccess(res, {
    message: 'Teachers retrieved',
    data: teachers,
    metadata: { total, page: p, pageSize: ps },
  });
});

const getTeacherById = asyncHandler(async (req, res) => {
  const teacher = await service.getTeacherDetail(req.params.teacherId, req.user);
  return sendSuccess(res, { message: 'Teacher retrieved', data: teacher });
});

const onboardTeacher = asyncHandler(async (req, res) => {
  validation.validateOnboardTeacher(req.body);
  const teacher = await service.onboardTeacher(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Teacher onboarded', data: teacher });
});

const updateTeacherProfile = asyncHandler(async (req, res) => {
  validation.validateUpdateTeacherProfile(req.body);
  const teacher = await service.updateTeacherProfile(req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher profile updated', data: teacher });
});

// --- Employment Status Transitions (WP3) ------------------------------------
// One handler per named transition, per the Employment Status Transition
// Matrix — never a generic "set status" handler.

const placeOnLeave = asyncHandler(async (req, res) => {
  validation.validateEmploymentTransition(req.body);
  const teacher = await service.placeOnLeave(req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher placed on leave', data: teacher });
});

const returnFromLeave = asyncHandler(async (req, res) => {
  validation.validateEmploymentTransition(req.body);
  const teacher = await service.returnFromLeave(req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher returned from leave', data: teacher });
});

const resign = asyncHandler(async (req, res) => {
  validation.validateEmploymentTransition(req.body);
  const teacher = await service.resign(req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher marked as resigned', data: teacher });
});

const rehire = asyncHandler(async (req, res) => {
  validation.validateEmploymentTransition(req.body);
  const teacher = await service.rehire(req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher rehired', data: teacher });
});

const terminate = asyncHandler(async (req, res) => {
  validation.validateEmploymentTransition(req.body);
  const teacher = await service.terminate(req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher terminated', data: teacher });
});

const retire = asyncHandler(async (req, res) => {
  validation.validateEmploymentTransition(req.body);
  const teacher = await service.retire(req.params.teacherId, req.body, req.user);
  return sendSuccess(res, { message: 'Teacher retired', data: teacher });
});

// --- Self-Service (WP5) --------------------------------------------------

const getOwnProfile = asyncHandler(async (req, res) => {
  const teacher = await service.getOwnProfile(req.user.id);
  return sendSuccess(res, { message: 'Profile retrieved', data: teacher });
});

const updateOwnProfile = asyncHandler(async (req, res) => {
  validation.validateUpdateOwnContactInfo(req.body);
  const teacher = await service.updateOwnContactInfo(req.user.id, req.body);
  return sendSuccess(res, { message: 'Profile updated', data: teacher });
});

// --- Department Reference List (WP4) ----------------------------------------

const listDepartments = asyncHandler(async (req, res) => {
  validation.validateListDepartments(req.query);
  const departments = await service.listDepartments(
    { includeArchived: req.query.includeArchived === 'true' },
    req.user
  );
  return sendSuccess(res, { message: 'Departments retrieved', data: departments });
});

const createDepartment = asyncHandler(async (req, res) => {
  validation.validateCreateDepartment(req.body);
  const department = await service.createDepartment(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Department created', data: department });
});

const updateDepartment = asyncHandler(async (req, res) => {
  validation.validateUpdateDepartment(req.body);
  const department = await service.updateDepartment(req.params.departmentId, req.body, req.user);
  return sendSuccess(res, { message: 'Department updated', data: department });
});

const archiveDepartment = asyncHandler(async (req, res) => {
  const department = await service.archiveDepartment(req.params.departmentId, req.user);
  return sendSuccess(res, { message: 'Department archived', data: department });
});

module.exports = {
  listTeachers,
  getTeacherById,
  onboardTeacher,
  updateTeacherProfile,
  placeOnLeave,
  returnFromLeave,
  resign,
  rehire,
  terminate,
  retire,
  listDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  getOwnProfile,
  updateOwnProfile,
};
