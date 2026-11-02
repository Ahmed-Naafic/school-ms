const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./students.service');
const validation = require('./students.validation');

const listStudents = asyncHandler(async (req, res) => {
  validation.validateListStudents(req.query);
  const { status, classId, sectionId, page, pageSize } = req.query;
  const { students, total, page: p, pageSize: ps } = await service.listStudents(
    {
      status,
      classId,
      sectionId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    },
    req.user
  );
  return sendSuccess(res, {
    message: 'Students retrieved',
    data: students,
    metadata: { total, page: p, pageSize: ps },
  });
});

const getStudentById = asyncHandler(async (req, res) => {
  const student = await service.getStudentDetail(req.params.studentId, req.user);
  return sendSuccess(res, { message: 'Student retrieved', data: student });
});

const admitStudent = asyncHandler(async (req, res) => {
  validation.validateAdmitStudent(req.body);
  const student = await service.admitStudent(req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Student admitted', data: student });
});

const enrollStudent = asyncHandler(async (req, res) => {
  validation.validateEnrollStudent(req.body);
  const enrollment = await service.enrollStudent(req.params.studentId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Student enrolled', data: enrollment });
});

const promoteStudent = asyncHandler(async (req, res) => {
  validation.validatePromoteStudent(req.body);
  const enrollment = await service.promoteStudent(req.params.studentId, req.body, req.user);
  return sendSuccess(res, { message: 'Student promoted', data: enrollment });
});

const correctClass = asyncHandler(async (req, res) => {
  validation.validateCorrectClass(req.body);
  const enrollment = await service.correctStudentClass(req.params.studentId, req.body, req.user);
  return sendSuccess(res, { message: 'Student Class corrected', data: enrollment });
});

const transferStudent = asyncHandler(async (req, res) => {
  validation.validateTransferStudent(req.body);
  const student = await service.transferStudent(req.params.studentId, req.body, req.user);
  return sendSuccess(res, { message: 'Student transferred', data: student });
});

const withdrawStudent = asyncHandler(async (req, res) => {
  const student = await service.withdrawStudent(req.params.studentId, req.user);
  return sendSuccess(res, { message: 'Student withdrawn', data: student });
});

const restoreWithdrawal = asyncHandler(async (req, res) => {
  const student = await service.restoreWithdrawnStudent(req.params.studentId, req.user);
  return sendSuccess(res, { message: 'Student restored to Active', data: student });
});

const graduateStudent = asyncHandler(async (req, res) => {
  const student = await service.graduateStudent(req.params.studentId, req.user);
  return sendSuccess(res, { message: 'Student graduated', data: student });
});

const updateProfile = asyncHandler(async (req, res) => {
  validation.validateUpdateProfile(req.body);
  const student = await service.updateProfile(req.params.studentId, req.body, req.user);
  return sendSuccess(res, { message: 'Student profile updated', data: student });
});

const getOwnProfile = asyncHandler(async (req, res) => {
  const student = await service.getOwnProfile(req.user.id);
  return sendSuccess(res, { message: 'Profile retrieved', data: student });
});

module.exports = {
  listStudents,
  getStudentById,
  admitStudent,
  enrollStudent,
  promoteStudent,
  correctClass,
  transferStudent,
  withdrawStudent,
  restoreWithdrawal,
  graduateStudent,
  updateProfile,
  getOwnProfile,
};
