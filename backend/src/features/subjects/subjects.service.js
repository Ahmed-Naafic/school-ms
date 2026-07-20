const { Prisma } = require('@prisma/client');
const repository = require('./subjects.repository');
const schoolsService = require('../schools/schools.service');
const { ConflictError, NotFoundError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

async function getSubjectOrThrow(subjectId) {
  const subject = await repository.findById(subjectId);
  if (!subject) {
    throw new NotFoundError('Subject not found');
  }
  return subject;
}

// Business Rule #12: Subject itself is platform-wide and has no owning
// school, so this check only ever applies to a School-scoped resource (a
// SchoolSubject assignment or the /schools/{schoolId}/subjects surface) —
// never to the Subject catalog itself. 404, not 403, for a School Admin
// targeting another school's schoolId, following Class/Teacher/Student
// Management's convention, per the Technical Design's Error Handling section.
function assertSchoolAccessible(user, schoolId) {
  if (user.role === 'SUPER_ADMIN') {
    return;
  }
  if (user.schoolId !== schoolId) {
    throw new NotFoundError('School not found');
  }
}

// Reshapes Prisma's `_count.schoolAssignments` into a plain
// `assignedSchoolCount` field — an API-contract detail, not something
// callers should need to know is a Prisma relation-count shape.
async function listSubjects({ educationLevel, status } = {}) {
  const subjects = await repository.list({ educationLevel, status });
  return subjects.map(({ _count, ...subject }) => ({
    ...subject,
    assignedSchoolCount: _count.schoolAssignments,
  }));
}

// Business Rule #3: uniqueness scoped per Education Level, not platform-wide.
async function createSubject({ name, educationLevel }, actingUser) {
  const existing = await repository.findByNameAndEducationLevel(name, educationLevel);
  if (existing) {
    throw new ConflictError('A Subject with this name already exists for this Education Level');
  }

  const subject = await repository.create({ name, educationLevel });
  await recordAuditEvent({ userId: actingUser.id, action: 'SUBJECT_CREATED', metadata: { subjectId: subject.id } });
  return subject;
}

// Business Rule #2: Education Level is editable only while the Subject has
// zero School assignments; name is always editable.
async function updateSubject(subjectId, { name, educationLevel }, actingUser) {
  const subject = await getSubjectOrThrow(subjectId);

  const nextName = name !== undefined ? name : subject.name;
  const nextEducationLevel = educationLevel !== undefined ? educationLevel : subject.educationLevel;

  if (educationLevel !== undefined && educationLevel !== subject.educationLevel) {
    const assignmentCount = await repository.countActiveAssignments(subjectId);
    if (assignmentCount > 0) {
      throw new ConflictError(
        'Cannot change Education Level — this Subject is currently assigned to at least one School'
      );
    }
  }

  if (nextName !== subject.name || nextEducationLevel !== subject.educationLevel) {
    const duplicate = await repository.findByNameAndEducationLevel(nextName, nextEducationLevel);
    if (duplicate && duplicate.id !== subjectId) {
      throw new ConflictError('A Subject with this name already exists for this Education Level');
    }
  }

  const updated = await repository.update(subjectId, { name: nextName, educationLevel: nextEducationLevel });
  await recordAuditEvent({ userId: actingUser.id, action: 'SUBJECT_UPDATED', metadata: { subjectId } });
  return updated;
}

// Business Rule #4: idempotent no-op if already in the target state.
async function archiveSubject(subjectId, actingUser) {
  const subject = await getSubjectOrThrow(subjectId);
  if (subject.status === 'ARCHIVED') {
    return subject;
  }

  const updated = await repository.archive(subjectId);
  await recordAuditEvent({ userId: actingUser.id, action: 'SUBJECT_ARCHIVED', metadata: { subjectId } });
  return updated;
}

async function reactivateSubject(subjectId, actingUser) {
  const subject = await getSubjectOrThrow(subjectId);
  if (subject.status === 'ACTIVE') {
    return subject;
  }

  const updated = await repository.reactivate(subjectId);
  await recordAuditEvent({ userId: actingUser.id, action: 'SUBJECT_REACTIVATED', metadata: { subjectId } });
  return updated;
}

// --- School <-> Subject assignment ------------------------------------------

// Business Rules #5, #6, #7. hasEducationLevel is School & Platform
// Management's own narrow interface (ACR-003) — this is the only way this
// feature ever reads School data; it never queries the `schools` table
// directly. A nonexistent schoolId surfaces as "doesn't offer this Education
// Level" (409), since hasEducationLevel itself returns false rather than
// throwing for a missing school — an accepted consequence of not being
// allowed to check School existence any other way.
async function assignSubjectToSchool(schoolId, subjectId, actingUser) {
  const subject = await getSubjectOrThrow(subjectId);

  if (subject.status === 'ARCHIVED') {
    throw new ConflictError('Cannot assign an Archived Subject to a School');
  }

  const hasLevel = await schoolsService.hasEducationLevel(schoolId, subject.educationLevel);
  if (!hasLevel) {
    throw new ConflictError(`This School does not currently offer the ${subject.educationLevel} Education Level`);
  }

  const existing = await repository.findAssignment(schoolId, subjectId);
  if (existing && !existing.removedAt) {
    // Already assigned — idempotent no-op, per Business Rule #7.
    return existing;
  }

  let assignment;
  try {
    assignment = existing
      ? await repository.reactivateAssignment(existing.id, actingUser.id)
      : await repository.createAssignment({ schoolId, subjectId, assignedById: actingUser.id });
  } catch (err) {
    // Concurrent identical assignment requests can both pass the
    // findAssignment check above before either has committed its write — the
    // database's own unique constraint on (schoolId, subjectId) is the real
    // backstop against a duplicate row, not this check-then-act sequence.
    // Whichever request loses the race treats the winner's row as its own
    // idempotent success (Phase 9 code review finding), the same as the
    // already-assigned branch above, rather than surfacing a raw Prisma
    // P2002 as an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return repository.findAssignment(schoolId, subjectId);
    }
    throw err;
  }

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'SUBJECT_ASSIGNED_TO_SCHOOL',
    metadata: { subjectId },
  });
  return assignment;
}

// --- Dependency-validation extension point (Business Rule #8) --------------
// A future dependent feature registers its own check here, at its own module
// load time (every feature module is required by app.js before the server
// starts listening, per the Technical Design's Architecture section) — this
// feature's own removal logic never has to change as a result. The registry
// is intentionally generic: `checkFn` knows nothing about what kind of
// dependent it's checking for, only `(schoolId, subjectId) -> reason | null`.

const removalDependencyCheckers = [];

function registerRemovalDependencyCheck(name, checkFn) {
  removalDependencyCheckers.push({ name, check: checkFn });
}

async function removeSubjectFromSchool(schoolId, subjectId, actingUser) {
  const existing = await repository.findAssignment(schoolId, subjectId);
  if (!existing || existing.removedAt) {
    throw new NotFoundError('Subject assignment not found');
  }

  for (const { name, check } of removalDependencyCheckers) {
    const blockingReason = await check(schoolId, subjectId);
    if (blockingReason) {
      throw new ConflictError(`Cannot remove Subject: ${blockingReason} (blocked by ${name})`);
    }
  }

  const removed = await repository.removeAssignment(existing.id, actingUser.id);
  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'SUBJECT_ASSIGNMENT_REMOVED',
    metadata: { subjectId },
  });
  return removed;
}

// Currently-assigned Subjects for a School, including each Subject's own
// status (Archived-but-assigned included, per Business Rule #5) — the
// caller is responsible for its own tenant check (assertSchoolAccessible)
// before calling this, matching schools.controller.js's own
// assertSameSchool-then-service-call pattern.
function listSchoolSubjects(schoolId) {
  return repository.listSchoolAssignments(schoolId);
}

// --- Stable public service interface for future feature integration -------
// Per the Implementation Plan's "Stable Public Service Interface" section —
// the only functions another feature module may call directly, in-process.
// Everything else in this file, and all of subjects.repository.js, is
// module-private.

function getSubjectById(subjectId) {
  return repository.findById(subjectId);
}

async function isSubjectAssignedToSchool(schoolId, subjectId) {
  const assignment = await repository.findAssignment(schoolId, subjectId);
  return Boolean(assignment && !assignment.removedAt);
}

module.exports = {
  listSubjects,
  createSubject,
  updateSubject,
  archiveSubject,
  reactivateSubject,
  assignSubjectToSchool,
  removeSubjectFromSchool,
  listSchoolSubjects,
  getSubjectOrThrow,
  assertSchoolAccessible,
  registerRemovalDependencyCheck,
  getSubjectById,
  isSubjectAssignedToSchool,
};
