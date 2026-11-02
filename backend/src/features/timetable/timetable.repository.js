const prisma = require('../../config/database');

// Repository layer is the only code touching Prisma directly, per Coding-Standards.md.

// Serializes every Lesson write for a given school (Business Rules #6, #7) —
// the Teacher/Class conflict checks each span the whole school, not one
// Class or one Teacher, so the lock must be school-scoped, not finer-grained
// (the same reasoning that made Shift's own lock school-scoped rather than
// Period's own shift-scoped lock).
function acquireSchoolLock(schoolId, tx) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;
}

// --- TimetableVersion (Architecture Update — Generation-First) ----------------

function findDraftVersion(schoolId, academicYearId, tx = prisma) {
  return tx.timetableVersion.findFirst({ where: { schoolId, academicYearId, status: 'DRAFT' } });
}

function findPublishedVersion(schoolId, academicYearId, tx = prisma) {
  return tx.timetableVersion.findFirst({ where: { schoolId, academicYearId, status: 'PUBLISHED' } });
}

function createVersion(data, tx = prisma) {
  return tx.timetableVersion.create({ data });
}

function updateVersion(id, data, tx = prisma) {
  return tx.timetableVersion.update({ where: { id }, data });
}

// --- LessonGroup (Architecture Update — double periods) -----------------------

function createLessonGroup(schoolId, tx = prisma) {
  return tx.lessonGroup.create({ data: { schoolId } });
}

function findLessonGroupById(id, tx = prisma) {
  return tx.lessonGroup.findUnique({ where: { id }, include: { lessons: true } });
}

function deleteLessonGroup(id, tx = prisma) {
  return tx.lessonGroup.delete({ where: { id } });
}

// --- TimetableGenerationJob (Architecture Update — background jobs) ----------

function createJob(data, tx = prisma) {
  return tx.timetableGenerationJob.create({ data });
}

function findJobById(id, tx = prisma) {
  return tx.timetableGenerationJob.findUnique({ where: { id } });
}

function updateJob(id, data, tx = prisma) {
  return tx.timetableGenerationJob.update({ where: { id }, data });
}

function listJobsBySchool(schoolId, tx = prisma) {
  return tx.timetableGenerationJob.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' }, take: 20 });
}

// Guards startGenerationJob against launching a second concurrent run for a
// School that already has one in flight — every run shares the same Draft
// Version and the same school-scoped advisory lock (acquireSchoolLock),
// regardless of Academic Year, so two overlapping runs don't just waste
// work, they clear and rebuild each other's Lessons out from under one
// another.
function findActiveJobForSchool(schoolId, tx = prisma) {
  return tx.timetableGenerationJob.findFirst({
    where: { schoolId, status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
  });
}

// --- Lesson -----------------------------------------------------------------
// Architecture Update: every list/conflict query is now additionally scoped
// to one timetableVersionId — the same Teacher/Class/Day/Period slot
// legitimately exists as independent Lesson rows across a school's Draft
// and Published versions at once (two different working copies), so version
// scoping is required, not optional, for every one of these.

function findLessonById(id, tx = prisma) {
  return tx.lesson.findUnique({ where: { id } });
}

// includeArchived lets the Master Timetable's own management view show
// cancelled Lessons too (so there is something to Restore) — Class/Teacher
// Timetable's own read-only views never pass this, staying Active-only.
function listLessonsByVersion(timetableVersionId, { includeArchived = false } = {}, tx = prisma) {
  return tx.lesson.findMany({ where: { timetableVersionId, ...(includeArchived ? {} : { status: 'ACTIVE' }) } });
}

function listLessonsByClassAndVersion(classId, timetableVersionId, { includeArchived = false } = {}, tx = prisma) {
  return tx.lesson.findMany({ where: { classId, timetableVersionId, ...(includeArchived ? {} : { status: 'ACTIVE' }) } });
}

function listLessonsByTeacherAndVersion(teacherId, timetableVersionId, { includeArchived = false } = {}, tx = prisma) {
  return tx.lesson.findMany({ where: { teacherId, timetableVersionId, ...(includeArchived ? {} : { status: 'ACTIVE' }) } });
}

// Business Rule #6 — the Teacher-conflict check, scoped to one Timetable
// Version. excludeLessonId lets an update exclude the Lesson's own prior
// slot from conflicting with itself.
function findActiveByTeacherSlot({ teacherId, timetableVersionId, dayOfWeek, periodId, excludeLessonId }, tx = prisma) {
  return tx.lesson.findFirst({
    where: {
      teacherId,
      timetableVersionId,
      dayOfWeek,
      periodId,
      status: 'ACTIVE',
      ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
    },
  });
}

// Business Rule #7 — the Class-conflict check, scoped to one Timetable Version.
function findActiveByClassSlot({ classId, timetableVersionId, dayOfWeek, periodId, excludeLessonId }, tx = prisma) {
  return tx.lesson.findFirst({
    where: {
      classId,
      timetableVersionId,
      dayOfWeek,
      periodId,
      status: 'ACTIVE',
      ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
    },
  });
}

// (ACR-006) Backs Timetable's own weekly-target assertion and its
// countActiveLessonsForAssignment narrow-interface function. Scoped to one
// Timetable Version — a weekly target is checked against the Draft an edit
// is being made in, not across every historical Archived version too.
// excludeLessonId lets an update of a Lesson already referencing this
// Assignment exclude its own prior row from its own count.
function countActiveByAssignment(teacherSubjectAssignmentId, timetableVersionId, excludeLessonId, tx = prisma) {
  return tx.lesson.count({
    where: {
      teacherSubjectAssignmentId,
      timetableVersionId,
      status: 'ACTIVE',
      ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
    },
  });
}

function createLesson(data, tx = prisma) {
  return tx.lesson.create({ data });
}

function updateLesson(id, data, tx = prisma) {
  return tx.lesson.update({ where: { id }, data });
}

// Architecture Update: clears every non-Locked Active Lesson within a
// regeneration's own scope (whole Version, one Class, one Teacher, or one
// Day) — archives rather than hard-deletes, per Archive Before Delete.
// Locked Lessons are excluded at the where-clause level, never filtered
// after the fact, so a regeneration can never accidentally touch one.
function archiveNonLockedLessons(timetableVersionId, filter, tx = prisma) {
  return tx.lesson.updateMany({
    where: { timetableVersionId, status: 'ACTIVE', locked: false, ...filter },
    data: { status: 'ARCHIVED' },
  });
}

module.exports = {
  acquireSchoolLock,
  findDraftVersion,
  findPublishedVersion,
  createVersion,
  updateVersion,
  createLessonGroup,
  findLessonGroupById,
  deleteLessonGroup,
  createJob,
  findJobById,
  updateJob,
  listJobsBySchool,
  findActiveJobForSchool,
  findLessonById,
  listLessonsByVersion,
  listLessonsByClassAndVersion,
  listLessonsByTeacherAndVersion,
  findActiveByTeacherSlot,
  findActiveByClassSlot,
  countActiveByAssignment,
  createLesson,
  updateLesson,
  archiveNonLockedLessons,
  // --- TeacherSchedulePreference -------------------------------------------------
  findTeacherPreference(teacherId, tx = prisma) {
    return tx.teacherSchedulePreference.findUnique({ where: { teacherId } });
  },
  upsertTeacherPreference(schoolId, teacherId, data, tx = prisma) {
    return tx.teacherSchedulePreference.upsert({
      where: { teacherId },
      create: { schoolId, teacherId, ...data },
      update: data,
    });
  },
  // --- SubjectSchedulePreference (Teacher Subject Assignment scoped) ------------
  findSubjectPreference(teacherSubjectAssignmentId, tx = prisma) {
    return tx.subjectSchedulePreference.findUnique({ where: { teacherSubjectAssignmentId } });
  },
  upsertSubjectPreference(schoolId, teacherSubjectAssignmentId, data, tx = prisma) {
    return tx.subjectSchedulePreference.upsert({
      where: { teacherSubjectAssignmentId },
      create: { schoolId, teacherSubjectAssignmentId, ...data },
      update: data,
    });
  },
  // --- SchoolOptimizationSettings ------------------------------------------------
  findOptimizationSettings(schoolId, tx = prisma) {
    return tx.schoolOptimizationSettings.findUnique({ where: { schoolId } });
  },
  createOptimizationSettings(schoolId, tx = prisma) {
    return tx.schoolOptimizationSettings.create({ data: { schoolId } });
  },
  updateOptimizationSettings(schoolId, data, tx = prisma) {
    return tx.schoolOptimizationSettings.update({ where: { schoolId }, data });
  },
};
