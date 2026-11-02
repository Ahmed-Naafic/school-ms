import { api } from '../../../shared/api/client';

// Mirrors backend/src/features/attendance/attendance.routes.js exactly.
// No SUPER_ADMIN-facing function exists here, deliberately — Attendance
// Management is a strictly school-based feature and Super Admin has zero
// Attendance access (Business Rule #34).

// --- Staff Attendance Timing Settings (School Admin configuration) --------

export const getAttendanceSettings = () => api.get('/attendance/settings');

export const updateAttendanceSettings = (settings) => api.patch('/attendance/settings', settings);

// --- Teacher Student Attendance --------------------------------------------

export const getTeacherCurrentLesson = () => api.get('/attendance/teacher/current-lesson');

export const recordTeacherAttendance = (lessonId, date, records) =>
  api.post(`/attendance/teacher/lessons/${lessonId}/records`, { date, records });

export const editTeacherAttendance = (lessonId, date, records) =>
  api.patch(`/attendance/teacher/lessons/${lessonId}/records`, { date, records });

// --- Manager Student Attendance — checkpoints ------------------------------

export const listClassesForManager = () => api.get('/attendance/manager/classes');

export const getManagerCheckpointView = (classId, checkpoint, date) =>
  api.get(`/attendance/manager/classes/${classId}/checkpoints/${checkpoint}?date=${date}`);

export const recordManagerCheckpointAttendance = (classId, checkpoint, date, records) =>
  api.post(`/attendance/manager/classes/${classId}/checkpoints/${checkpoint}/records`, { date, records });

export const correctStudentAttendance = (studentAttendanceId, status) =>
  api.patch(`/attendance/manager/records/${studentAttendanceId}`, { status });

// --- Staff self check-in — (v1.7) always the caller's own account ----------
// No path parameter, no body — there is no target account a client could
// supply even if it wanted to. A Teacher, Accountant, or Manager calls this
// for themselves only; a Manager/Admin never calls "come" for someone else
// any more (that capability was removed, not merely restricted).

export const recordSelfArrival = () => api.post('/attendance/staff/me/come');

// --- Manager Staff Attendance (Teacher/Accountant) — (v1.3) arrival-based --
// No status is ever sent by the client, for any action — the server derives
// PRESENT/LATE from the self-recorded arrival timestamp (Business Rules #35,
// #39); "excuse" applies the one manually-appliable status (EXCUSED,
// Business Rule #37) implicitly, and (v1.9) only for today — a client-
// supplied date other than today is rejected by the server, not merely
// unused. "excuse-historical" (v1.9, Business Rule #41) is the separate,
// explicitly-authorized path for a genuine past date; the server rejects
// today or a future date there too. "unexcuse" (v1.6) reverses a mistaken
// excuse, but the restored status is always computed server-side — there is
// no way, through this API, for a Manager/Admin to pick a staff member's
// status themselves.

export const getManagerStaffAttendance = (date) => api.get(`/attendance/manager/staff?date=${date}`);

// (v2.0) Manager-recorded arrival for a specific Teacher/Accountant — no
// body; the server derives PRESENT/LATE from its own captured timestamp,
// identically to self check-in, and rejects (422) any account that isn't a
// Teacher/Accountant at the Manager's own school.
export const recordManagerStaffArrival = (accountId) => api.post(`/attendance/manager/staff/${accountId}/come`);

export const excuseManagerStaff = (accountId, date) =>
  api.patch(`/attendance/manager/staff/${accountId}/excuse`, { date });

export const excuseManagerStaffHistorical = (accountId, date) =>
  api.patch(`/attendance/manager/staff/${accountId}/excuse-historical`, { date });

export const unexcuseManagerStaff = (accountId, date) =>
  api.patch(`/attendance/manager/staff/${accountId}/unexcuse`, { date });

// --- Admin correction jurisdiction over Manager attendance — (v1.3) --------

export const getAdminManagerAttendance = (date) => api.get(`/attendance/admin/managers?date=${date}`);

export const excuseAdminManager = (accountId, date) =>
  api.patch(`/attendance/admin/managers/${accountId}/excuse`, { date });

export const excuseAdminManagerHistorical = (accountId, date) =>
  api.patch(`/attendance/admin/managers/${accountId}/excuse-historical`, { date });

export const unexcuseAdminManager = (accountId, date) =>
  api.patch(`/attendance/admin/managers/${accountId}/unexcuse`, { date });

// --- Student attendance history ---------------------------------------------

export const getStudentAttendanceHistory = (studentId) => api.get(`/attendance/students/${studentId}/history`);
