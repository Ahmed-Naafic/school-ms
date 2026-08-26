const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

// --- Student Attendance --------------------------------------------------

function findStudentAttendanceById(id, tx = prisma) {
  return tx.studentAttendance.findUnique({ where: { id } });
}

// The one Teacher-recorded row for (student, lesson, date), if any — backs
// both the roster view (Section G/F) and the create/edit uniqueness check.
function findTeacherRecord(studentId, lessonId, date, tx = prisma) {
  return tx.studentAttendance.findFirst({
    where: { studentId, lessonId, date, source: 'TEACHER' },
  });
}

// Every Manager-checkpoint row for a (student, class, date) — up to two
// (Before Break, After Break) — backs the Teacher-lock check (Technical
// Design Section M) and the Manager's own roster view.
function listManagerCheckpointRecords(studentId, classId, date, tx = prisma) {
  return tx.studentAttendance.findMany({
    where: { studentId, classId, date, source: { in: ['MANAGER_BEFORE_BREAK', 'MANAGER_AFTER_BREAK'] } },
  });
}

// All StudentAttendance rows (any source) for a whole Class on one date —
// the roster-building read for both the Teacher's per-lesson view (filtered
// further in the service layer by studentId) and the Manager's checkpoint view.
function listStudentAttendanceForClassDate(classId, date, tx = prisma) {
  return tx.studentAttendance.findMany({ where: { classId, date } });
}

function createStudentAttendance(data, tx = prisma) {
  return tx.studentAttendance.create({ data });
}

// Teacher's own edit of their own record — status only, recordedBy*/source
// untouched (Business Rule #13's "never overwrite the original" applies to
// correction; an edit by the SAME recorder who created it is not a
// correction at all, so recordedAt is also left as the original recording
// moment).
function updateStudentAttendanceStatus(id, status, tx = prisma) {
  return tx.studentAttendance.update({ where: { id }, data: { status } });
}

// A Manager's correction of any StudentAttendance row (Teacher- or
// Manager-recorded) — sets correctedBy*/status, never touches the original
// recordedBy*/source/recordedAt (Business Rule #13).
function correctStudentAttendance(id, { status, correctedByAccountId, correctedAt }, tx = prisma) {
  return tx.studentAttendance.update({ where: { id }, data: { status, correctedByAccountId, correctedAt } });
}

// A Student's full attendance history, unfiltered by current roster/status —
// Business Rule #29/#30: history survives a lifecycle transition unchanged.
function listStudentAttendanceHistory(studentId, tx = prisma) {
  return tx.studentAttendance.findMany({ where: { studentId }, orderBy: { date: 'desc' } });
}

// --- Staff Attendance ------------------------------------------------------

function findStaffAttendanceById(id, tx = prisma) {
  return tx.staffAttendance.findUnique({ where: { id } });
}

function findStaffAttendanceByAccountAndDate(staffAccountId, date, tx = prisma) {
  return tx.staffAttendance.findUnique({ where: { staffAccountId_date: { staffAccountId, date } } });
}

function listStaffAttendanceForDate(schoolId, date, staffAccountIds, tx = prisma) {
  return tx.staffAttendance.findMany({
    where: { schoolId, date, staffAccountId: { in: staffAccountIds } },
  });
}

function createStaffAttendance(data, tx = prisma) {
  return tx.staffAttendance.create({ data });
}

function correctStaffAttendance(id, { status, correctedByAccountId, correctedAt }, tx = prisma) {
  return tx.staffAttendance.update({ where: { id }, data: { status, correctedByAccountId, correctedAt } });
}

// (v1.6) "Unexcuse" undo path for a row Excuse created fresh (no genuine
// arrival ever happened) — removes it entirely rather than leaving a
// dangling manually-created row, restoring the derived ABSENT/NOT_RECORDED
// read-time state.
function deleteStaffAttendance(id, tx = prisma) {
  return tx.staffAttendance.delete({ where: { id } });
}

// --- Non-working days / Settings -------------------------------------------

function findNonWorkingDay(schoolId, date, tx = prisma) {
  return tx.schoolNonWorkingDay.findUnique({ where: { schoolId_date: { schoolId, date } } });
}

function getAttendanceSettings(schoolId, tx = prisma) {
  return tx.attendanceSettings.findUnique({ where: { schoolId } });
}

// School Admin's own configuration screen — no such row is auto-created
// anywhere (Business Rule #38 requires an explicit, deliberate configuration
// action, never a guessed default), so this is always an upsert: the first
// save creates the row, every save after that updates the same one.
function upsertAttendanceSettings(schoolId, data, tx = prisma) {
  return tx.attendanceSettings.upsert({
    where: { schoolId },
    create: { schoolId, ...data },
    update: data,
  });
}

module.exports = {
  findStudentAttendanceById,
  findTeacherRecord,
  listManagerCheckpointRecords,
  listStudentAttendanceForClassDate,
  createStudentAttendance,
  updateStudentAttendanceStatus,
  correctStudentAttendance,
  listStudentAttendanceHistory,
  findStaffAttendanceById,
  findStaffAttendanceByAccountAndDate,
  listStaffAttendanceForDate,
  createStaffAttendance,
  correctStaffAttendance,
  deleteStaffAttendance,
  findNonWorkingDay,
  getAttendanceSettings,
  upsertAttendanceSettings,
};
