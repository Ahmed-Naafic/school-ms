const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const requireCredentialsEstablished = require('../../middlewares/require-credentials-established');
const { requireRole } = require('../../middlewares/authorize');
const controller = require('./attendance.controller');

const router = express.Router();

// Attendance Management is a strictly school-based operational feature per
// Attendance-Management.md Business Rule #34: SUPER_ADMIN has no Attendance
// access of any kind — no view, record, correct, page, or API access, under
// any school context. requireRole is an ALLOW-LIST (see
// backend/src/middlewares/authorize.js) — SUPER_ADMIN is never named in any
// requireRole(...) call below, on any route in this file, so it is rejected
// by role alone, before the request ever reaches this feature's own
// tenant-scoped service logic (req.user.schoolId always comes from the
// authenticated token, never a client-supplied value — Business Rule #24).
// This is deliberate and total: do not add SUPER_ADMIN to any route here.
router.use(authenticate);
router.use(requireCredentialsEstablished);

// --- Staff Attendance Timing Settings (School Admin configuration) --------

router.get('/settings', requireRole('SCHOOL_ADMIN'), controller.getAttendanceSettings);
router.patch('/settings', requireRole('SCHOOL_ADMIN'), controller.updateAttendanceSettings);

// --- Teacher Student Attendance --------------------------------------------

router.get('/teacher/current-lesson', requireRole('TEACHER'), controller.getTeacherCurrentLesson);
router.post('/teacher/lessons/:lessonId/records', requireRole('TEACHER'), controller.recordTeacherAttendance);
router.patch('/teacher/lessons/:lessonId/records', requireRole('TEACHER'), controller.editTeacherAttendance);

// --- Manager Student Attendance — checkpoints ------------------------------

router.get('/manager/classes', requireRole('MANAGER'), controller.listClassesForManager);
router.get(
  '/manager/classes/:classId/checkpoints/:checkpoint',
  requireRole('MANAGER'),
  controller.getManagerCheckpointView
);
router.post(
  '/manager/classes/:classId/checkpoints/:checkpoint/records',
  requireRole('MANAGER'),
  controller.recordManagerCheckpointAttendance
);
router.patch('/manager/records/:studentAttendanceId', requireRole('MANAGER'), controller.correctStudentAttendance);

// --- Staff self check-in — (v1.7) always the acting user's own account -----
// No path parameter and no body — there is no target account for a client
// to supply, ever. A Teacher/Accountant/Manager can only ever record their
// own arrival (Business Rules #14, #17, amended). A Manager or Admin never
// records anyone else's arrival any more; see the Excuse/Unexcuse routes
// below for their own, unrelated correction authority.

router.post('/staff/me/come', requireRole('TEACHER', 'ACCOUNTANT', 'MANAGER'), controller.recordSelfArrival);

// --- Manager Staff Attendance (Teacher/Accountant) — (v1.3) arrival-based --
// No body-supplied status anywhere here, ever — "excuse" accepts only an
// optional date, defaulting to and restricted to TODAY (v1.9, Business Rule
// #41) — never a status (Business Rule #37, the one manually-appliable value
// is implied by calling the action at all); "unexcuse" (v1.6) reverses a
// mistaken excuse but likewise never accepts a status — the restored value
// is always computed server-side (Section H.2). "excuse-historical" (v1.9)
// is the separate, explicitly-authorized path for a genuine past date — its
// date is required, not optional/defaulted, and today/future are rejected.

router.get('/manager/staff', requireRole('MANAGER'), controller.getManagerStaffAttendance);
router.patch('/manager/staff/:accountId/excuse', requireRole('MANAGER'), controller.excuseManagerStaff);
router.patch('/manager/staff/:accountId/excuse-historical', requireRole('MANAGER'), controller.excuseManagerStaffHistorical);
router.patch('/manager/staff/:accountId/unexcuse', requireRole('MANAGER'), controller.unexcuseManagerStaff);

// --- Admin correction jurisdiction over Manager attendance — (v1.3) --------

router.get('/admin/managers', requireRole('SCHOOL_ADMIN'), controller.getAdminManagerAttendance);
router.patch('/admin/managers/:accountId/excuse', requireRole('SCHOOL_ADMIN'), controller.excuseAdminManager);
router.patch('/admin/managers/:accountId/excuse-historical', requireRole('SCHOOL_ADMIN'), controller.excuseAdminManagerHistorical);
router.patch('/admin/managers/:accountId/unexcuse', requireRole('SCHOOL_ADMIN'), controller.unexcuseAdminManager);

// --- Student attendance history (role-scoped inside the service layer) -----

router.get(
  '/students/:studentId/history',
  requireRole('TEACHER', 'MANAGER', 'SCHOOL_ADMIN'),
  controller.getStudentAttendanceHistory
);

module.exports = router;
