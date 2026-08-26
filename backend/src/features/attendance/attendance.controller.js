const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./attendance.service');
const validation = require('./attendance.validation');

// --- Staff Attendance Timing Settings (School Admin configuration) --------

const getAttendanceSettings = asyncHandler(async (req, res) => {
  const settings = await service.getStaffAttendanceTimingSettings(req.user.schoolId);
  return sendSuccess(res, { message: 'Staff Attendance Timing Settings retrieved', data: settings });
});

const updateAttendanceSettings = asyncHandler(async (req, res) => {
  validation.validateAttendanceSettingsBody(req.body);
  const settings = await service.updateStaffAttendanceTimingSettings(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { message: 'Staff Attendance Timing Settings updated', data: settings });
});

// --- Teacher Student Attendance --------------------------------------------

const getTeacherCurrentLesson = asyncHandler(async (req, res) => {
  const view = await service.getTeacherAttendanceView(req.user.schoolId, req.user);
  return sendSuccess(res, { message: 'Current lesson attendance retrieved', data: view });
});

const recordTeacherAttendance = asyncHandler(async (req, res) => {
  validation.validateStudentRecordsBody(req.body);
  const records = await service.recordTeacherAttendance(
    req.user.schoolId,
    req.params.lessonId,
    req.body.date,
    req.body.records,
    req.user
  );
  return sendSuccess(res, { statusCode: 201, message: 'Attendance recorded', data: records });
});

const editTeacherAttendance = asyncHandler(async (req, res) => {
  validation.validateStudentRecordsBody(req.body);
  const records = await service.editTeacherAttendance(
    req.user.schoolId,
    req.params.lessonId,
    req.body.date,
    req.body.records,
    req.user
  );
  return sendSuccess(res, { message: 'Attendance updated', data: records });
});

// --- Manager Student Attendance — checkpoints ------------------------------

const listClassesForManager = asyncHandler(async (req, res) => {
  const classes = await service.listClassesForManager(req.user.schoolId);
  return sendSuccess(res, { message: 'Classes retrieved', data: classes });
});

const getManagerCheckpointView = asyncHandler(async (req, res) => {
  validation.validateCheckpointParam(req.params.checkpoint);
  validation.validateDateQuery(req.query);
  const view = await service.getManagerCheckpointView(
    req.user.schoolId,
    req.params.classId,
    req.params.checkpoint,
    req.query.date,
    req.user
  );
  return sendSuccess(res, { message: 'Checkpoint attendance retrieved', data: view });
});

const recordManagerCheckpointAttendance = asyncHandler(async (req, res) => {
  validation.validateCheckpointParam(req.params.checkpoint);
  validation.validateStudentRecordsBody(req.body);
  const records = await service.recordManagerCheckpointAttendance(
    req.user.schoolId,
    req.params.classId,
    req.params.checkpoint,
    req.body.date,
    req.body.records,
    req.user
  );
  return sendSuccess(res, { statusCode: 201, message: 'Checkpoint attendance recorded', data: records });
});

const correctStudentAttendance = asyncHandler(async (req, res) => {
  validation.validateCorrectionBody(req.body);
  const record = await service.correctStudentAttendance(
    req.user.schoolId,
    req.params.studentAttendanceId,
    req.body.status,
    req.user
  );
  return sendSuccess(res, { message: 'Attendance corrected', data: record });
});

// --- Staff self check-in — (v1.7) always the acting user's own account -----

const recordSelfArrival = asyncHandler(async (req, res) => {
  const record = await service.recordSelfArrival(req.user.schoolId, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Arrival recorded', data: record });
});

// --- Manager Staff Attendance (Teacher/Accountant) — (v1.3) arrival-based --

const getManagerStaffAttendance = asyncHandler(async (req, res) => {
  validation.validateDateQuery(req.query);
  const view = await service.getManagerStaffAttendanceView(req.user.schoolId, req.query.date);
  return sendSuccess(res, { message: 'Staff attendance retrieved', data: view });
});

const excuseManagerStaff = asyncHandler(async (req, res) => {
  validation.validateOptionalDateBody(req.body);
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const record = await service.excuseManagerStaff(req.user.schoolId, req.params.accountId, date, req.user);
  return sendSuccess(res, { message: 'Marked excused', data: record });
});

// (v1.9) Historical correction — date is required, must be a real past
// date (enforced in the service layer), and is audited distinctly from the
// normal same-day Excuse action above.
const excuseManagerStaffHistorical = asyncHandler(async (req, res) => {
  validation.validateRequiredDateBody(req.body);
  const record = await service.excuseManagerStaffHistorical(req.user.schoolId, req.params.accountId, req.body.date, req.user);
  return sendSuccess(res, { message: 'Historical attendance corrected to Excused', data: record });
});

const unexcuseManagerStaff = asyncHandler(async (req, res) => {
  validation.validateOptionalDateBody(req.body);
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const record = await service.unexcuseManagerStaff(req.user.schoolId, req.params.accountId, date, req.user);
  return sendSuccess(res, { message: 'Excuse undone', data: record });
});

// --- Admin records Manager attendance — (v1.3) arrival-based ---------------

const getAdminManagerAttendance = asyncHandler(async (req, res) => {
  validation.validateDateQuery(req.query);
  const view = await service.getAdminManagerAttendanceView(req.user.schoolId, req.query.date);
  return sendSuccess(res, { message: 'Manager attendance retrieved', data: view });
});

const excuseAdminManager = asyncHandler(async (req, res) => {
  validation.validateOptionalDateBody(req.body);
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const record = await service.excuseAdminManager(req.user.schoolId, req.params.accountId, date, req.user);
  return sendSuccess(res, { message: 'Marked excused', data: record });
});

const excuseAdminManagerHistorical = asyncHandler(async (req, res) => {
  validation.validateRequiredDateBody(req.body);
  const record = await service.excuseAdminManagerHistorical(req.user.schoolId, req.params.accountId, req.body.date, req.user);
  return sendSuccess(res, { message: 'Historical attendance corrected to Excused', data: record });
});

const unexcuseAdminManager = asyncHandler(async (req, res) => {
  validation.validateOptionalDateBody(req.body);
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const record = await service.unexcuseAdminManager(req.user.schoolId, req.params.accountId, date, req.user);
  return sendSuccess(res, { message: 'Excuse undone', data: record });
});

// --- Student attendance history ---------------------------------------------

const getStudentAttendanceHistory = asyncHandler(async (req, res) => {
  const records = await service.getStudentAttendanceHistory(req.user.schoolId, req.params.studentId, req.user);
  return sendSuccess(res, { message: 'Attendance history retrieved', data: records });
});

module.exports = {
  getAttendanceSettings,
  updateAttendanceSettings,
  listClassesForManager,
  getTeacherCurrentLesson,
  recordTeacherAttendance,
  editTeacherAttendance,
  getManagerCheckpointView,
  recordManagerCheckpointAttendance,
  correctStudentAttendance,
  recordSelfArrival,
  getManagerStaffAttendance,
  excuseManagerStaff,
  excuseManagerStaffHistorical,
  unexcuseManagerStaff,
  getAdminManagerAttendance,
  excuseAdminManager,
  excuseAdminManagerHistorical,
  unexcuseAdminManager,
  getStudentAttendanceHistory,
};
