const crypto = require('crypto');
const prisma = require('../../config/database');
const repository = require('./teachers.repository');
const { ConflictError, NotFoundError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

// Cross-feature calls through a single, narrow, public interface only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling and the
// Technical Design's Architecture section. This module never queries
// Authentication & Authorization's tables directly.
const authService = require('../auth/auth.service');

async function getTeacherOrThrow(schoolId, teacherId) {
  const teacher = await repository.findById(teacherId);
  if (!teacher || teacher.schoolId !== schoolId) {
    throw new NotFoundError('Teacher not found');
  }
  return teacher;
}

// System-generated at Onboarding, immutable thereafter (Business Rule #8).
// Uniqueness is scoped per school; the database's own unique constraint
// (schoolId, employeeId) is the final guarantee, per the Implementation
// Plan's Risk Assessment — collision odds are astronomically low, so no
// application-level retry loop is added on top of it.
function generateEmployeeId() {
  return `EMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// --- Onboarding -------------------------------------------------------------

// Business Rules #1, #2, #3: every onboarded Teacher is issued individual
// login credentials as part of Onboarding, reusing Authentication &
// Authorization's existing account-creation service — the same pattern
// Student Management already uses for STUDENT.
//
// Account creation and the Teacher-record write are wrapped in one
// transaction (Completion Review finding): without this, a failure in
// repository.create after the Account already committed would leave an
// orphaned, Teacher-less Account behind — the same defect class already
// found and fixed once in School & Platform Management's own code review.
async function onboardTeacher(payload, actingUser) {
  const schoolId = actingUser.schoolId;
  const {
    email,
    fullName,
    contactPhone,
    contactAddress,
    joiningDate,
    employmentType,
    qualifications,
    subjectSpecializations,
    relevantExperience,
  } = payload;

  const teacher = await prisma.$transaction(async (tx) => {
    const account = await authService.createAccount({ email, role: 'TEACHER', schoolId }, actingUser, tx);

    return repository.create(
      {
        schoolId,
        accountId: account.id,
        employeeId: generateEmployeeId(),
        fullName,
        contactPhone: contactPhone || null,
        contactAddress: contactAddress || null,
        joiningDate: new Date(joiningDate),
        employmentType: employmentType || null,
        qualifications: qualifications || null,
        subjectSpecializations: subjectSpecializations || [],
        relevantExperience: relevantExperience || null,
      },
      tx
    );
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'TEACHER_ONBOARDED' });

  return teacher;
}

// --- Profile / Roster --------------------------------------------------------

// Business Rules #10, #11: only School Admin may update employment/
// professional information. employmentStatus, employeeId, schoolId, and
// accountId are never accepted here at all — this function's own parameter
// destructuring is the guard-by-construction the Technical Design requires,
// on top of teachers.validation.js's explicit rejection of those fields.
async function updateTeacherProfile(teacherId, payload, actingUser) {
  const schoolId = actingUser.schoolId;
  await getTeacherOrThrow(schoolId, teacherId);

  const {
    fullName,
    contactPhone,
    contactAddress,
    joiningDate,
    employmentType,
    qualifications,
    subjectSpecializations,
    relevantExperience,
  } = payload;

  const updated = await repository.update(teacherId, {
    ...(fullName !== undefined ? { fullName } : {}),
    ...(contactPhone !== undefined ? { contactPhone } : {}),
    ...(contactAddress !== undefined ? { contactAddress } : {}),
    ...(joiningDate !== undefined ? { joiningDate: new Date(joiningDate) } : {}),
    ...(employmentType !== undefined ? { employmentType } : {}),
    ...(qualifications !== undefined ? { qualifications } : {}),
    ...(subjectSpecializations !== undefined ? { subjectSpecializations } : {}),
    ...(relevantExperience !== undefined ? { relevantExperience } : {}),
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'TEACHER_PROFILE_UPDATED' });

  return updated;
}

async function listTeachers({ employmentStatus, page = 1, pageSize = 20 }, actingUser) {
  const schoolId = actingUser.schoolId;
  const { teachers, total } = await repository.listBySchool({
    schoolId,
    employmentStatus,
    page,
    pageSize,
  });
  return { teachers, total, page, pageSize };
}

async function getTeacherDetail(teacherId, actingUser) {
  const schoolId = actingUser.schoolId;
  return getTeacherOrThrow(schoolId, teacherId);
}

// --- Employment Status Transitions ------------------------------------------
//
// The Employment Status Transition Matrix (Technical Design, Architecture),
// exactly as approved — the single authoritative source for every
// allowed-from-status precondition below. This table is private: it is only
// ever reached through the six named wrapper functions at the bottom of this
// section, each hard-coding its own transition key. No caller — controller
// or otherwise — can request an arbitrary transition; there is deliberately
// no generic "set employment status" entry point anywhere in this module,
// per the Technical Design's Architecture section.
//
// accountAction reflects Business Rule #5's default synchronization:
// 'enable' / 'disable' call Authentication & Authorization's existing
// activate/deactivate functions; null (On Leave) makes no account call at
// all. Per ACR-001 (WP6), every such call explicitly passes
// `{ source: 'teacher_management', reason: null }` as its third argument —
// this feature never identifies itself as the administrative/security
// override, and Authentication & Authorization's own reason-required guard
// (Business Rule #25) never fires for a call carrying this source.
const EMPLOYMENT_TRANSITIONS = {
  leave: { from: ['ACTIVE'], to: 'ON_LEAVE', accountAction: null, auditAction: 'TEACHER_EMPLOYMENT_STATUS_CHANGED' },
  returnFromLeave: { from: ['ON_LEAVE'], to: 'ACTIVE', accountAction: 'enable', auditAction: 'TEACHER_REINSTATED' },
  resign: {
    from: ['ACTIVE', 'ON_LEAVE'],
    to: 'RESIGNED',
    accountAction: 'disable',
    auditAction: 'TEACHER_EMPLOYMENT_STATUS_CHANGED',
  },
  rehire: { from: ['RESIGNED'], to: 'ACTIVE', accountAction: 'enable', auditAction: 'TEACHER_REINSTATED' },
  terminate: {
    from: ['ACTIVE', 'ON_LEAVE'],
    to: 'TERMINATED',
    accountAction: 'disable',
    auditAction: 'TEACHER_EMPLOYMENT_STATUS_CHANGED',
  },
  retire: {
    from: ['ACTIVE', 'ON_LEAVE'],
    to: 'RETIRED',
    accountAction: 'disable',
    auditAction: 'TEACHER_EMPLOYMENT_STATUS_CHANGED',
  },
};

// Validation (the allowed-from-status precondition) always runs before
// persistence, and persistence always completes before the Authentication &
// Authorization call, per the Technical Design's Employment Status
// Transition Matrix — enforced here by wrapping both writes in one
// transaction (Completion Review finding). Previously these were two
// independent, sequential writes: if the Authentication & Authorization
// call failed after employmentStatus had already been persisted, a Teacher
// could be left permanently stuck in a terminal status (e.g. TERMINATED)
// with their account still enabled, since no transition endpoint accepts a
// TERMINATED source status to retry from. Wrapping both in
// prisma.$transaction means either both commit or neither does.
async function applyEmploymentTransition(transitionKey, teacherId, { reason } = {}, actingUser) {
  const schoolId = actingUser.schoolId;
  const transition = EMPLOYMENT_TRANSITIONS[transitionKey];
  const teacher = await getTeacherOrThrow(schoolId, teacherId);

  if (!transition.from.includes(teacher.employmentStatus)) {
    throw new ConflictError(
      `Cannot apply this transition to a Teacher whose employment status is ${teacher.employmentStatus}`
    );
  }

  // ACR-001: this feature always identifies its own calls with an explicit
  // operation context — never the administrative/security override source
  // — so Authentication & Authorization's reason-required guard (Business
  // Rule #25) never applies to an ordinary employment-lifecycle transition.
  const authContext = { source: 'teacher_management', reason: null };

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTeacher = await repository.updateEmploymentStatus(teacherId, transition.to, tx);

    if (transition.accountAction === 'enable') {
      await authService.reactivateAccount(teacher.accountId, actingUser, authContext, tx);
    } else if (transition.accountAction === 'disable') {
      await authService.deactivateAccount(teacher.accountId, actingUser, authContext, tx);
    }

    return updatedTeacher;
  });

  await recordAuditEvent({
    schoolId,
    userId: actingUser.id,
    action: transition.auditAction,
    metadata: {
      teacherId,
      previousStatus: teacher.employmentStatus,
      newStatus: transition.to,
      reason: reason || null,
    },
  });

  return updated;
}

// Business Workflow #3 (Employment Status Changes): Active -> On Leave. No
// account change, per Business Rule #5.
async function placeOnLeave(teacherId, payload, actingUser) {
  return applyEmploymentTransition('leave', teacherId, payload, actingUser);
}

// Business Workflow #4 (Reinstatement): On Leave -> Active. Reversible, per
// Business Rule #6.
async function returnFromLeave(teacherId, payload, actingUser) {
  return applyEmploymentTransition('returnFromLeave', teacherId, payload, actingUser);
}

// Business Workflow #3: Active/On Leave -> Resigned.
async function resign(teacherId, payload, actingUser) {
  return applyEmploymentTransition('resign', teacherId, payload, actingUser);
}

// Business Workflow #4 (Reinstatement): Resigned -> Active. The other
// reversible transition permitted by Business Rule #6.
async function rehire(teacherId, payload, actingUser) {
  return applyEmploymentTransition('rehire', teacherId, payload, actingUser);
}

// Business Workflow #3: Active/On Leave -> Terminated. Terminal, per
// Business Rule #6 — no endpoint ever transitions a Teacher out of this
// status.
async function terminate(teacherId, payload, actingUser) {
  return applyEmploymentTransition('terminate', teacherId, payload, actingUser);
}

// Business Workflow #3: Active/On Leave -> Retired. Terminal, per Business
// Rule #6, same as Terminated.
async function retire(teacherId, payload, actingUser) {
  return applyEmploymentTransition('retire', teacherId, payload, actingUser);
}

// --- Self-Service (Teacher's own record, WP5) -------------------------------
// Resolved strictly from the authenticated user's own account, never a
// client-supplied teacherId, per Business Rule #12 and Security-Standards.md's
// Authorization Security section — the same IDOR protection Student
// Management's /students/me already relies on.

async function getOwnProfile(accountId) {
  const teacher = await repository.findByAccountId(accountId);
  if (!teacher) {
    throw new NotFoundError('Teacher record not found');
  }
  return teacher;
}

// Business Rule #10: a Teacher may edit only their own approved personal
// contact information — employment and professional information remain
// School Admin-managed. Guard by construction: this function's own
// parameter destructuring accepts only contactPhone/contactAddress: even a
// caller that bypassed teachers.validation.js's whitelist could not smuggle
// another field through, since nothing else is ever read from `payload`.
async function updateOwnContactInfo(accountId, { contactPhone, contactAddress }) {
  const teacher = await getOwnProfile(accountId);

  const updated = await repository.update(teacher.id, {
    ...(contactPhone !== undefined ? { contactPhone } : {}),
    ...(contactAddress !== undefined ? { contactAddress } : {}),
  });

  await recordAuditEvent({ schoolId: teacher.schoolId, userId: accountId, action: 'TEACHER_PROFILE_UPDATED' });

  return updated;
}

module.exports = {
  getTeacherOrThrow,
  onboardTeacher,
  updateTeacherProfile,
  listTeachers,
  getTeacherDetail,
  placeOnLeave,
  returnFromLeave,
  resign,
  rehire,
  terminate,
  retire,
  getOwnProfile,
  updateOwnContactInfo,
};
