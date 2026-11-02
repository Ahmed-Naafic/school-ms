const asyncHandler = require('../../shared/async-handler');
const { sendSuccess } = require('../../shared/response');
const service = require('./school-schedule.service');
const validation = require('./school-schedule.validation');

const getSchoolCalendar = asyncHandler(async (req, res) => {
  const calendar = await service.getSchoolCalendarOrThrow(req.user.schoolId);
  return sendSuccess(res, { message: 'School Calendar retrieved', data: calendar });
});

const updateSchoolCalendar = asyncHandler(async (req, res) => {
  validation.validateUpdateSchoolCalendar(req.body);
  const calendar = await service.updateSchoolCalendar(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { message: 'School Calendar updated', data: calendar });
});

const listShifts = asyncHandler(async (req, res) => {
  validation.validateListShifts(req.query);
  const shifts = await service.listShifts(req.user.schoolId, { status: req.query.status });
  return sendSuccess(res, { message: 'Shifts retrieved', data: shifts });
});

const getShiftById = asyncHandler(async (req, res) => {
  const shift = await service.getShiftDetail(req.user.schoolId, req.params.shiftId);
  return sendSuccess(res, { message: 'Shift retrieved', data: shift });
});

const createShift = asyncHandler(async (req, res) => {
  validation.validateCreateShift(req.body);
  const shift = await service.createShift(req.user.schoolId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Shift created', data: shift });
});

const updateShift = asyncHandler(async (req, res) => {
  validation.validateUpdateShift(req.body);
  const shift = await service.updateShift(req.user.schoolId, req.params.shiftId, req.body, req.user);
  return sendSuccess(res, { message: 'Shift updated', data: shift });
});

const reorderShift = asyncHandler(async (req, res) => {
  validation.validateReorderShift(req.body);
  const shifts = await service.reorderShift(req.user.schoolId, req.params.shiftId, req.body.position, req.user);
  return sendSuccess(res, { message: 'Shift sequence updated', data: shifts });
});

const designateDefaultShift = asyncHandler(async (req, res) => {
  const shift = await service.designateDefaultShift(req.user.schoolId, req.params.shiftId, req.user);
  return sendSuccess(res, { message: 'Default Shift designated', data: shift });
});

const archiveShift = asyncHandler(async (req, res) => {
  const shift = await service.archiveShift(req.user.schoolId, req.params.shiftId, req.user);
  return sendSuccess(res, { message: 'Shift archived', data: shift });
});

const reactivateShift = asyncHandler(async (req, res) => {
  const shift = await service.reactivateShift(req.user.schoolId, req.params.shiftId, req.user);
  return sendSuccess(res, { message: 'Shift reactivated', data: shift });
});

// --- Period (Architecture Update) ----------------------------------------------

const listPeriods = asyncHandler(async (req, res) => {
  validation.validateListPeriods(req.query);
  const periods = await service.listPeriods(req.user.schoolId, req.params.shiftId, { status: req.query.status });
  return sendSuccess(res, { message: 'Periods retrieved', data: periods });
});

const getPeriodById = asyncHandler(async (req, res) => {
  const period = await service.getPeriodDetail(req.user.schoolId, req.params.periodId);
  return sendSuccess(res, { message: 'Period retrieved', data: period });
});

const createPeriod = asyncHandler(async (req, res) => {
  validation.validateCreatePeriod(req.body);
  const period = await service.createPeriod(req.user.schoolId, req.params.shiftId, req.body, req.user);
  return sendSuccess(res, { statusCode: 201, message: 'Period created', data: period });
});

const updatePeriod = asyncHandler(async (req, res) => {
  validation.validateUpdatePeriod(req.body);
  const period = await service.updatePeriod(req.user.schoolId, req.params.periodId, req.body, req.user);
  return sendSuccess(res, { message: 'Period updated', data: period });
});

const reorderPeriod = asyncHandler(async (req, res) => {
  validation.validateReorderPeriod(req.body);
  const periods = await service.reorderPeriod(req.user.schoolId, req.params.periodId, req.body.position, req.user);
  return sendSuccess(res, { message: 'Period sequence updated', data: periods });
});

const archivePeriod = asyncHandler(async (req, res) => {
  const period = await service.archivePeriod(req.user.schoolId, req.params.periodId, req.user);
  return sendSuccess(res, { message: 'Period archived', data: period });
});

const reactivatePeriod = asyncHandler(async (req, res) => {
  const period = await service.reactivatePeriod(req.user.schoolId, req.params.periodId, req.user);
  return sendSuccess(res, { message: 'Period reactivated', data: period });
});

// --- Super Admin oversight (read-only), mirroring Subject Management's own
// /schools/{schoolId}/subjects nested-route precedent exactly.

const getSchoolCalendarForSchool = asyncHandler(async (req, res) => {
  const calendar = await service.getSchoolCalendarOrThrow(req.params.schoolId);
  return sendSuccess(res, { message: 'School Calendar retrieved', data: calendar });
});

const listShiftsForSchool = asyncHandler(async (req, res) => {
  validation.validateListShifts(req.query);
  const shifts = await service.listShifts(req.params.schoolId, { status: req.query.status });
  return sendSuccess(res, { message: 'Shifts retrieved', data: shifts });
});

const listPeriodsForSchool = asyncHandler(async (req, res) => {
  validation.validateListPeriods(req.query);
  const periods = await service.listPeriods(req.params.schoolId, req.params.shiftId, { status: req.query.status });
  return sendSuccess(res, { message: 'Periods retrieved', data: periods });
});

module.exports = {
  getSchoolCalendar,
  updateSchoolCalendar,
  listShifts,
  getShiftById,
  createShift,
  updateShift,
  reorderShift,
  designateDefaultShift,
  archiveShift,
  reactivateShift,
  listPeriods,
  getPeriodById,
  createPeriod,
  updatePeriod,
  reorderPeriod,
  archivePeriod,
  reactivatePeriod,
  getSchoolCalendarForSchool,
  listShiftsForSchool,
  listPeriodsForSchool,
};
