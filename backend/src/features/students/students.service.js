const repository = require('./students.repository');
const { ConflictError, NotFoundError, ValidationError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

// Cross-feature calls through single, narrow, public interfaces only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling and the
// Technical Design's Architecture section. This module never queries
// Authentication & Authorization's or Class Management's tables directly.
const authService = require('../auth/auth.service');
const classesService = require('../classes/classes.service');
const academicYearsService = require('../academic-years/academic-years.service');

async function getStudentOrThrow(schoolId, studentId) {
  const student = await repository.findById(studentId);
  if (!student || student.schoolId !== schoolId) {
    throw new NotFoundError('Student not found');
  }
  return student;
}

// Validates a Class reference the same way regardless of caller (Enrollment
// or Promotion): must belong to the Student's own school and must not be
// archived, per Business Rule #9 — archiving a Class blocks new Enrollment.
async function assertClassEnrollable(schoolId, classId) {
  const cls = await classesService.getClassById(classId);
  if (!cls || cls.schoolId !== schoolId) {
    throw new NotFoundError('Class not found');
  }
  if (cls.status === 'ARCHIVED') {
    throw new ConflictError('This Class is archived and cannot accept new Enrollment');
  }
  return cls;
}

// (ACR-002) Validates a Section reference the same way regardless of caller
// (Enrollment, Promotion, or Class Correction), mirroring
// assertClassEnrollable's existing shared-helper pattern. Business Rule #18:
// a present sectionId must resolve to one of the target Class's own active
// Sections (wrong Class, archived, and nonexistent all collapse into "not a
// valid choice," since listActiveSectionsForClass already excludes all
// three); an absent sectionId is rejected only when the Class has at least
// one active Section — a Class with none requires no Section at all.
async function assertSectionEnrollable(schoolId, classId, sectionId) {
  const activeSections = await classesService.listActiveSectionsForClass(schoolId, classId);

  if (sectionId) {
    const match = activeSections.find((section) => section.id === sectionId);
    if (!match) {
      throw new ValidationError('Invalid Section', {
        sectionId: 'This Section is not a valid, active Section of the selected Class.',
      });
    }
  } else if (activeSections.length > 0) {
    throw new ValidationError('A Section is required', {
      sectionId: 'Required — the selected Class has active Sections; choose one.',
    });
  }
}

// (ACR-004) Validates an Academic Year reference the same way regardless of
// caller (Enrollment or Promotion), mirroring assertClassEnrollable and
// assertSectionEnrollable's existing shared-helper pattern. Business Rule
// #21: a present academicYearId must resolve to a non-Archived Academic Year
// belonging to this school (missing, nonexistent, cross-school, and Archived
// all collapse into "not a valid choice"). Business Rule #22: a school with
// zero Academic Years has no valid value to supply, so it fails this same
// check with no separate error path. Reached only through Academic Year
// Management's own Stable Public Service Interface — never a direct query
// against its data, per Loose Coupling.
async function assertAcademicYearEnrollable(schoolId, academicYearId) {
  if (!academicYearId) {
    throw new ValidationError('An Academic Year is required', {
      academicYearId: 'Required — create an Academic Year for your school first if none exists yet.',
    });
  }

  const academicYear = await academicYearsService.getAcademicYearById(schoolId, academicYearId);
  if (!academicYear) {
    throw new ValidationError('Invalid Academic Year', {
      academicYearId: 'This Academic Year does not exist for your school.',
    });
  }
  if (academicYear.status === 'ARCHIVED') {
    throw new ValidationError('Invalid Academic Year', {
      academicYearId: 'This Academic Year is archived and cannot accept new Enrollment.',
    });
  }
}

async function withEnrollmentDetail(student) {
  const latestEnrollment = await repository.findLatestEnrollment(student.id);
  return { ...student, latestEnrollment };
}

// --- Admission ---------------------------------------------------------

// Business Rule #3: every admitted Student is issued individual login
// credentials as part of Admission — reuses Authentication & Authorization's
// existing account-creation service (Business Rule #16 there), the same
// pattern School & Platform Management uses for a school's first School Admin.
async function admitStudent({ email, fullName, parentName, parentContact }, actingUser) {
  const schoolId = actingUser.schoolId;

  const account = await authService.createAccount({ email, role: 'STUDENT', schoolId }, actingUser);

  const student = await repository.create({
    schoolId,
    accountId: account.id,
    fullName,
    parentName: parentName || null,
    parentContact: parentContact || null,
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_ADMITTED' });

  return student;
}

// --- Enrollment ----------------------------------------------------------

// Business Rule #4: a Student must be enrolled before being referenced
// elsewhere; a Student cannot be enrolled without first being admitted
// (enforced simply by requiring an existing Student record here). Only an
// ACTIVE Student may be enrolled — a Transferred, Withdrawn, or Graduated
// Student's permanence (Business Rule #15) would otherwise be bypassed by
// creating a fresh Enrollment through this endpoint instead of Promotion.
async function enrollStudent(studentId, { classId, sectionId, academicYearId }, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);

  if (student.status !== 'ACTIVE') {
    throw new ConflictError('Only an active Student may be enrolled');
  }

  await assertClassEnrollable(schoolId, classId);
  await assertSectionEnrollable(schoolId, classId, sectionId);
  await assertAcademicYearEnrollable(schoolId, academicYearId);

  const enrollment = await repository.createEnrollment({
    studentId: student.id,
    classId,
    sectionId: sectionId || null,
    academicYearId,
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_ENROLLED' });

  return enrollment;
}

// --- Promotion -------------------------------------------------------------

// Business Rule #6: Class Management's sequence only ever suggests the next
// Class — School Admin may override the destination. Business Rule #10: a
// Promotion into the school's final Class transitions the Student into
// "Eligible for Graduation", a one-way state this feature owns and never
// re-derives afterward.
async function promoteStudent(studentId, { classId, sectionId, academicYearId }, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);

  if (student.status !== 'ACTIVE') {
    throw new ConflictError('Only an active Student may be promoted');
  }

  const currentEnrollment = await repository.findLatestEnrollment(studentId);
  if (!currentEnrollment) {
    throw new ConflictError('Student must be enrolled before they can be promoted');
  }

  let targetClassId = classId;
  if (!targetClassId) {
    const suggested = await classesService.getSuggestedNextClass(schoolId, currentEnrollment.classId);
    if (!suggested) {
      throw new ValidationError('No suggested next Class is available; specify a target Class explicitly', {
        classId: 'Required — this Student\'s current Class has no automatic next Class.',
      });
    }
    targetClassId = suggested.id;
  }

  await assertClassEnrollable(schoolId, targetClassId);

  // (ACR-002) Business Rule #19: if the caller didn't explicitly choose a
  // destination Section, and the current Enrollment has one, look for a
  // same-named Section in the destination Class and suggest it. Never
  // derived from any combined display name — always from actual Section
  // records, matched by their own `name` field.
  let targetSectionId = sectionId;
  if (!targetSectionId && currentEnrollment.sectionId) {
    const currentClassSections = await classesService.listActiveSectionsForClass(
      schoolId,
      currentEnrollment.classId
    );
    const currentSection = currentClassSections.find((section) => section.id === currentEnrollment.sectionId);
    if (currentSection) {
      const destinationSections = await classesService.listActiveSectionsForClass(schoolId, targetClassId);
      const matched = destinationSections.find((section) => section.name === currentSection.name);
      if (matched) {
        targetSectionId = matched.id;
      }
    }
  }

  await assertSectionEnrollable(schoolId, targetClassId, targetSectionId);

  // (ACR-004) Business Rule #23: if the caller didn't explicitly choose an
  // Academic Year, default to the school's Current Academic Year as a
  // suggestion only — the chosen value (defaulted or explicit) always still
  // passes through assertAcademicYearEnrollable below, so the suggestion can
  // never bypass validation the way an explicit choice wouldn't either.
  let targetAcademicYearId = academicYearId;
  if (!targetAcademicYearId) {
    const current = await academicYearsService.getCurrentAcademicYear(schoolId);
    targetAcademicYearId = current ? current.id : null;
  }

  await assertAcademicYearEnrollable(schoolId, targetAcademicYearId);

  const enrollment = await repository.createEnrollment({
    studentId,
    classId: targetClassId,
    sectionId: targetSectionId || null,
    academicYearId: targetAcademicYearId,
  });

  const finalClass = await classesService.getFinalClass(schoolId);
  if (finalClass && finalClass.id === targetClassId) {
    await repository.updateStatus(studentId, 'ELIGIBLE_FOR_GRADUATION');
    await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_ELIGIBLE_FOR_GRADUATION' });
  }

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_PROMOTED' });

  return enrollment;
}

// Business Rule #16: a Class Correction is an administrative data fix, never
// a Promotion — it mutates the Student's current Enrollment's Class in
// place, creates no new Enrollment, requires no academic year, and never
// evaluates Graduation eligibility, even if the corrected Class happens to
// be the school's final Class. Only available while the Student's academic
// placement is still active (ACTIVE or ELIGIBLE_FOR_GRADUATION) — Transfer
// and Graduation finalize a Student's academic history, and Withdrawal
// pauses it; correcting the Class afterward would leave records that are
// meant to be a fixed historical snapshot (a Transfer's summary, a
// Graduation) internally inconsistent with the Enrollment they describe.
async function correctStudentClass(studentId, { classId, sectionId, reason }, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);
  assertNotAlreadyTerminal(student);

  const currentEnrollment = await repository.findLatestEnrollment(studentId);
  if (!currentEnrollment) {
    throw new ConflictError('Student has no current Enrollment to correct');
  }

  await assertClassEnrollable(schoolId, classId);
  await assertSectionEnrollable(schoolId, classId, sectionId);

  const previousClassId = currentEnrollment.classId;
  const previousSectionId = currentEnrollment.sectionId;
  const updated = await repository.correctEnrollmentClass(currentEnrollment.id, classId, sectionId);

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: 'STUDENT_CLASS_CORRECTED',
    metadata: {
      studentId,
      previousClassId,
      newClassId: classId,
      previousSectionId: previousSectionId || null,
      newSectionId: sectionId || null,
      reason: reason || null,
    },
  });

  return updated;
}

// --- Transfer / Withdrawal / Graduation ------------------------------------

function assertNotAlreadyTerminal(student) {
  if (['TRANSFERRED', 'WITHDRAWN', 'GRADUATED'].includes(student.status)) {
    throw new ConflictError(`Student has already ${student.status.toLowerCase()}`);
  }
}

// Business Rules #7, #8, #9: Transfer always has a receiving school and
// generates a summary record (prior Class + academic summary) on the
// outgoing Enrollment; Withdrawal has neither.
async function transferStudent(studentId, { academicSummary }, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);
  assertNotAlreadyTerminal(student);

  const latestEnrollment = await repository.findLatestEnrollment(studentId);
  if (latestEnrollment) {
    await repository.setTransferSummary(latestEnrollment.id, academicSummary || null);
  }

  const updated = await repository.updateStatus(studentId, 'TRANSFERRED');
  await authService.deactivateAccount(student.accountId, actingUser);

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_TRANSFERRED' });

  return updated;
}

async function withdrawStudent(studentId, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);
  assertNotAlreadyTerminal(student);

  const updated = await repository.updateStatus(studentId, 'WITHDRAWN');
  await authService.deactivateAccount(student.accountId, actingUser);

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_WITHDRAWN' });

  return updated;
}

// Business Rule #14: unlike Transfer and Graduation, Withdrawal is
// reversible. Restoration only flips status and reactivates the account —
// it never touches Enrollment, since the Student's prior Class may no
// longer be valid; School Admin enrolls or promotes separately if needed.
async function restoreWithdrawnStudent(studentId, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);

  if (student.status !== 'WITHDRAWN') {
    throw new ConflictError('Only a Withdrawn Student can be restored');
  }

  const updated = await repository.updateStatus(studentId, 'ACTIVE');
  await authService.reactivateAccount(student.accountId, actingUser);

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_WITHDRAWAL_RESTORED' });

  return updated;
}

// Product Owner's Graduation-guard decision: only ELIGIBLE_FOR_GRADUATION ->
// GRADUATED is permitted. Any other status is rejected with 409, makes no
// change, and the attempt itself is audited — there is deliberately no
// direct ACTIVE -> GRADUATED path.
async function graduateStudent(studentId, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);

  if (student.status !== 'ELIGIBLE_FOR_GRADUATION') {
    await recordAuditEvent({
      schoolId,
      userId: actingUser.id,
      action: 'STUDENT_GRADUATION_REJECTED',
      metadata: { studentId, currentStatus: student.status },
    });
    throw new ConflictError('Only a Student who is Eligible for Graduation may be graduated');
  }

  const updated = await repository.updateStatus(studentId, 'GRADUATED');
  await authService.deactivateAccount(student.accountId, actingUser);

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_GRADUATED' });

  return updated;
}

// --- Profile / Roster -------------------------------------------------------

async function updateProfile(studentId, { fullName, parentName, parentContact }, actingUser) {
  const schoolId = actingUser.schoolId;
  await getStudentOrThrow(schoolId, studentId);

  const updated = await repository.update(studentId, {
    ...(fullName !== undefined ? { fullName } : {}),
    ...(parentName !== undefined ? { parentName } : {}),
    ...(parentContact !== undefined ? { parentContact } : {}),
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'STUDENT_PROFILE_UPDATED' });

  return updated;
}

async function listStudents({ status, classId, sectionId, page = 1, pageSize = 20 }, actingUser) {
  const schoolId = actingUser.schoolId;

  if (classId || sectionId) {
    // Filtering by Class (and, per ACR-002, optionally Section) must match
    // each Student's *current* (most recent) Enrollment only. Enrollment
    // history is preserved forever (Business Rule #5), so a naive "has any
    // Enrollment in this Class" match would wrongly include Students who
    // passed through this Class long ago and have since moved on —
    // including Students who already Graduated.
    const all = await repository.listAllBySchool({ schoolId, status });
    const withEnrollments = await Promise.all(all.map(withEnrollmentDetail));
    const filtered = withEnrollments.filter((s) => {
      if (classId && s.latestEnrollment?.classId !== classId) {
        return false;
      }
      if (sectionId && s.latestEnrollment?.sectionId !== sectionId) {
        return false;
      }
      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const students = filtered.slice(start, start + pageSize);

    return { students, total, page, pageSize };
  }

  const { students, total } = await repository.listBySchool({ schoolId, status, page, pageSize });
  const withEnrollments = await Promise.all(students.map(withEnrollmentDetail));
  return { students: withEnrollments, total, page, pageSize };
}

async function getStudentDetail(studentId, actingUser) {
  const schoolId = actingUser.schoolId;
  const student = await getStudentOrThrow(schoolId, studentId);
  const enrollments = await repository.listEnrollments(studentId);
  return { ...student, enrollments };
}

// --- Self-service (Student's own record) ------------------------------------
// Resolved strictly from the authenticated user's own account, never a
// client-supplied studentId, per Business Rule #11 and Security-Standards.md.
async function getOwnProfile(accountId) {
  const student = await repository.findByAccountId(accountId);
  if (!student) {
    throw new NotFoundError('Student record not found');
  }
  return withEnrollmentDetail(student);
}

module.exports = {
  getStudentOrThrow,
  admitStudent,
  enrollStudent,
  promoteStudent,
  correctStudentClass,
  transferStudent,
  withdrawStudent,
  restoreWithdrawnStudent,
  graduateStudent,
  updateProfile,
  listStudents,
  getStudentDetail,
  getOwnProfile,
};
