const prisma = require('../../config/database');
const repository = require('./classes.repository');
const { ConflictError, NotFoundError, ValidationError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

// Cross-feature call through a single, narrow, public interface only, per
// Decision-Making-Principles' Feature Ownership / Loose Coupling and the
// Technical Design's Architecture section. This module never queries
// School Schedule Management's own tables directly.
const schoolScheduleService = require('../school-schedule/school-schedule.service');

async function getClassOrThrow(schoolId, classId) {
  const cls = await repository.findById(classId);
  if (!cls || cls.schoolId !== schoolId) {
    throw new NotFoundError('Class not found');
  }
  return cls;
}

// (School Schedule Management) Business Rule #13 there: every Class
// references exactly one active Shift. Validates a resolved shiftId the
// same way assertAcademicYearEnrollable validates academicYearId in
// Student Management — a missing/invalid/cross-school/Archived Shift all
// collapse into "not a valid choice."
async function assertShiftAssignable(schoolId, shiftId, tx) {
  if (!shiftId) {
    throw new ValidationError('A Shift is required', {
      shiftId: "Required — this school's Default Shift could not be resolved automatically; choose one explicitly.",
    });
  }
  const isValid = await schoolScheduleService.validateShift(schoolId, shiftId, tx);
  if (!isValid) {
    throw new ValidationError('Invalid Shift', {
      shiftId: 'This Shift does not exist, does not belong to your school, or is not Active.',
    });
  }
}

// --- GradeLevel (ACR-009, Architecture Update — Grade/Form) ----------------

async function getGradeLevelOrThrow(schoolId, gradeLevelId, tx = prisma) {
  const gradeLevel = await repository.findGradeLevelById(gradeLevelId, tx);
  if (!gradeLevel || gradeLevel.schoolId !== schoolId) {
    throw new NotFoundError('Grade/Form not found');
  }
  return gradeLevel;
}

// Every Class must reference an Active GradeLevel belonging to its own
// school — the same "missing/invalid/cross-school/Archived all collapse
// into 'not a valid choice'" shape assertShiftAssignable already uses.
async function assertGradeLevelAssignable(schoolId, gradeLevelId, tx) {
  if (!gradeLevelId) {
    throw new ValidationError('A Grade/Form is required', {
      gradeLevelId: 'Required — choose which Grade/Form this Class belongs to.',
    });
  }
  const gradeLevel = await repository.findGradeLevelById(gradeLevelId, tx);
  if (!gradeLevel || gradeLevel.schoolId !== schoolId || gradeLevel.status !== 'ACTIVE') {
    throw new ValidationError('Invalid Grade/Form', {
      gradeLevelId: 'This Grade/Form does not exist, does not belong to your school, or is not Active.',
    });
  }
}

// New Business Rule (ACR-009): every Class within one GradeLevel must
// reference the same shiftId — this is what makes "this Grade/Form's own
// available weekly teaching periods" a single, well-defined number for
// Weekly Subject Allocation's own future calculation. Runs against the
// Class's own final, resulting (gradeLevelId, shiftId) pair on every
// createClass/updateClass/reactivateClass call — regardless of which of the
// two fields actually changed (Technical Design Review finding: changing
// only shiftId is exactly as capable of violating this as changing only
// gradeLevelId would be), and including reactivateClass (a second Review
// finding: an Archived Class's own GradeLevel membership cannot be assumed
// still valid — a different Class could have joined that same, now-emptier
// GradeLevel on a different Shift while this one sat archived).
async function assertSameShiftWithinGradeLevel(schoolId, gradeLevelId, shiftId, excludeClassId, tx) {
  const siblings = await repository.listOtherActiveClassesInGradeLevel(gradeLevelId, excludeClassId, tx);
  const conflicting = siblings.find((sibling) => sibling.shiftId !== shiftId);
  if (conflicting) {
    throw new ConflictError(
      'Every Class within the same Grade/Form must use the same Shift as its other Classes'
    );
  }
}

function listClasses(schoolId) {
  return repository.listBySchool(schoolId);
}

// The next position must account for every Class regardless of status — the
// (schoolId, sequenceOrder) uniqueness constraint applies to archived Classes
// too, so basing this on the active count/list alone can collide with an
// archived Class's still-existing position. Shared by createClass (a brand
// new Class joins at the end) and reactivateClass (an archived Class rejoins
// at the end, per Business Rule #11) — the same class of bug this fixes was
// independently hit in both places, plus reorderClass, during Implementation.
async function nextEndOfSequencePosition(schoolId, tx = prisma) {
  const allClasses = await repository.listBySchool(schoolId, tx);
  return allClasses.reduce((max, cls) => Math.max(max, cls.sequenceOrder), 0) + 1;
}

// Business Rule #3 (unique name) and #6 (defined sequence position — new
// Classes are appended at the end of the school's current sequence).
// (School Schedule Management) shiftId defaults to the school's own
// current Default Shift when omitted — the same "suggest, don't silently
// bypass validation" pattern Student Management's own Promotion-default
// already established; the defaulted value still passes through the exact
// same assertShiftAssignable check an explicit choice would.
// The shiftId validate-then-write sequence is wrapped in a transaction that
// acquires the same per-school advisory lock School Schedule Management's
// own archiveShift acquires (Postgres pg_advisory_xact_lock(hashtext(schoolId)),
// as the very first statement) — otherwise a concurrent archiveShift could
// archive this exact Shift after it's been validated as Active here but
// before this Class's write commits, leaving an active Class referencing an
// archived Shift with no error to either caller. Found and verified live
// during Phase 9 review; see Code-Review-Report.md.
async function createClass({ name, shiftId, gradeLevelId }, actingUser) {
  const schoolId = actingUser.schoolId;

  const cls = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);

    const existing = await repository.findByName(schoolId, name, tx);
    if (existing) {
      throw new ConflictError('A Class with this name already exists in your school');
    }

    let targetShiftId = shiftId;
    if (!targetShiftId) {
      const defaultShift = await schoolScheduleService.getActiveShift(schoolId, tx);
      targetShiftId = defaultShift ? defaultShift.id : null;
    }
    await assertShiftAssignable(schoolId, targetShiftId, tx);

    // (ACR-009) gradeLevelId defaults to the school's own oldest Active
    // GradeLevel when omitted — the same "suggest a sensible default, the
    // defaulted value still passes through the same assertion an explicit
    // choice would" pattern shiftId's own default already establishes.
    // GradeLevel has no isDefault flag of its own (deliberately — any
    // number of Active GradeLevels are equally valid), so this is a plain
    // "oldest by sequence" fallback rather than a stored designation.
    let targetGradeLevelId = gradeLevelId;
    if (!targetGradeLevelId) {
      const firstGradeLevel = await repository.findFirstActiveGradeLevel(schoolId, tx);
      targetGradeLevelId = firstGradeLevel ? firstGradeLevel.id : null;
    }
    await assertGradeLevelAssignable(schoolId, targetGradeLevelId, tx);
    await assertSameShiftWithinGradeLevel(schoolId, targetGradeLevelId, targetShiftId, null, tx);

    const nextPosition = await nextEndOfSequencePosition(schoolId, tx);
    return repository.create(
      { schoolId, name, shiftId: targetShiftId, gradeLevelId: targetGradeLevelId, sequenceOrder: nextPosition },
      tx
    );
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'CLASS_CREATED' });

  return cls;
}

// Same race, same fix as createClass above: only entered when shiftId or
// gradeLevelId is actually being changed, since those are the only cases
// that read/write the Shift/GradeLevel references this feature must
// serialize against archiveShift for. (ACR-009, Technical Design Review
// finding) assertSameShiftWithinGradeLevel runs against the Class's own
// final, resulting (gradeLevelId, shiftId) pair whenever EITHER field is
// present in the request body — never conditioned on gradeLevelId alone —
// since changing only shiftId is exactly as capable of violating the
// invariant as changing only gradeLevelId would be.
async function updateClass(classId, { name, shiftId, gradeLevelId }, actingUser) {
  const schoolId = actingUser.schoolId;
  const cls = await getClassOrThrow(schoolId, classId);

  const updated = await prisma.$transaction(async (tx) => {
    if (shiftId !== undefined || gradeLevelId !== undefined) {
      await repository.acquireSchoolLock(schoolId, tx);
    }

    const existing = await repository.findByName(schoolId, name, tx);
    if (existing && existing.id !== classId) {
      throw new ConflictError('A Class with this name already exists in your school');
    }

    // (School Schedule Management) shiftId is optional on update — omitted
    // means "leave the current Shift unchanged"; when present, it is
    // re-validated exactly as a new choice would be.
    const nextShiftId = shiftId !== undefined ? shiftId : cls.shiftId;
    if (shiftId !== undefined) {
      await assertShiftAssignable(schoolId, nextShiftId, tx);
    }

    // (ACR-009) gradeLevelId is likewise optional on update — omitted means
    // "leave the current Grade/Form unchanged."
    const nextGradeLevelId = gradeLevelId !== undefined ? gradeLevelId : cls.gradeLevelId;
    if (gradeLevelId !== undefined) {
      await assertGradeLevelAssignable(schoolId, nextGradeLevelId, tx);
    }

    if (shiftId !== undefined || gradeLevelId !== undefined) {
      await assertSameShiftWithinGradeLevel(schoolId, nextGradeLevelId, nextShiftId, classId, tx);
    }

    return repository.update(classId, { name, shiftId: nextShiftId, gradeLevelId: nextGradeLevelId }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'CLASS_UPDATED' });
  return updated;
}

// Archiving blocks new Enrollment only — it never affects Students already
// enrolled in the Class, per Business Rule #9. Enforcing "no new Enrollment
// into an archived Class" is Student Management's responsibility when it
// calls getClassById, not this feature's.
//
// The currently-designated final Class may never be archived: Business Rule
// #7 requires exactly one final Class "at any given time," but no Class can
// ever be promoted into once archived (assertClassEnrollable blocks it), so
// archiving it would leave the school unable to reach Graduation eligibility
// at all, silently, with no error anywhere. School Admin must designate a
// different final Class first.
async function archiveClass(classId, actingUser) {
  const schoolId = actingUser.schoolId;
  const cls = await getClassOrThrow(schoolId, classId);

  if (cls.status === 'ARCHIVED') {
    return cls;
  }

  if (cls.isFinal) {
    throw new ConflictError(
      'The final Class cannot be archived — designate a different Class as final first'
    );
  }

  const updated = await repository.archive(classId);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'CLASS_ARCHIVED' });
  return updated;
}

// Reactivating always assigns a fresh end-of-sequence position rather than
// restoring the Class's pre-archival one, per Business Rule #11 — that old
// position may since have been reassigned to another Class, or no longer sit
// in a meaningful place relative to Classes added or reordered since.
//
// (ACR-009, Technical Design Review finding) Also re-validates the same-Shift
// invariant before restoring, unconditionally — an Archived Class's own
// GradeLevel membership cannot be assumed still valid: while it sat
// archived, its GradeLevel could have dropped to zero other Active members,
// letting a brand-new Class join that same GradeLevel on a different Shift
// in the meantime (nothing else was left to conflict with at that moment).
// Reactivating the original Class back into it would silently create two
// Active Classes in the same GradeLevel on different Shifts. The same
// "an archived record cannot assume its own old state is still valid"
// principle already established for reactivateShift, reactivatePeriod, and
// replaceTeacher — a fourth instance, caught here at Technical Design
// Review rather than a later finding.
async function reactivateClass(classId, actingUser) {
  const schoolId = actingUser.schoolId;
  const cls = await getClassOrThrow(schoolId, classId);

  if (cls.status === 'ACTIVE') {
    return cls;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);
    await assertSameShiftWithinGradeLevel(schoolId, cls.gradeLevelId, cls.shiftId, classId, tx);

    const nextPosition = await nextEndOfSequencePosition(schoolId, tx);
    return repository.reactivate(classId, nextPosition, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'CLASS_REACTIVATED' });
  return updated;
}

// Moves a Class to a 1-based target position among its school's active
// Classes, then renumbers the entire school's Class set (active and
// archived together) to a contiguous 1..N sequence in a single transaction,
// per the Technical Design's Risks section — two Classes can never end up
// sharing a position. Archived Classes are appended after the active ones,
// in their existing relative order, and are otherwise unaffected: the
// (schoolId, sequenceOrder) uniqueness constraint applies regardless of
// status, so an archived Class's stale position must be renumbered too, not
// left in place, or it could collide with an active Class's new position.
async function reorderClass(classId, targetPosition, actingUser) {
  const schoolId = actingUser.schoolId;
  const cls = await getClassOrThrow(schoolId, classId);

  if (cls.status === 'ARCHIVED') {
    throw new ConflictError('An archived Class cannot be reordered');
  }

  const allClasses = await repository.listBySchool(schoolId);
  const activeClasses = allClasses.filter((c) => c.status === 'ACTIVE');
  const archivedClasses = allClasses.filter((c) => c.status === 'ARCHIVED');

  const withoutMoved = activeClasses.filter((c) => c.id !== classId);
  const moved = activeClasses.find((c) => c.id === classId);

  const clampedPosition = Math.max(1, Math.min(targetPosition, activeClasses.length));
  withoutMoved.splice(clampedPosition - 1, 0, moved);

  await repository.reorder([...withoutMoved, ...archivedClasses]);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'CLASS_SEQUENCE_CHANGED' });

  return repository.listActiveBySchoolOrdered(schoolId);
}

// Business Rule #7: exactly one Class per school may be the final Class.
async function designateFinalClass(classId, actingUser) {
  const schoolId = actingUser.schoolId;
  const cls = await getClassOrThrow(schoolId, classId);

  if (cls.status === 'ARCHIVED') {
    throw new ConflictError('An archived Class cannot be designated as the final Class');
  }

  await repository.designateFinalClass(schoolId, classId);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'CLASS_FINAL_DESIGNATION_CHANGED' });

  return repository.findById(classId);
}

async function createSection(classId, { name }, actingUser) {
  const schoolId = actingUser.schoolId;
  await getClassOrThrow(schoolId, classId);

  const existing = await repository.findSectionByName(classId, name);
  if (existing) {
    throw new ConflictError('A Section with this name already exists in this Class');
  }

  const section = await repository.createSection({ classId, name });
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SECTION_CREATED' });
  return section;
}

async function getSectionOrThrow(schoolId, classId, sectionId) {
  await getClassOrThrow(schoolId, classId);

  const section = await repository.findSectionById(sectionId);
  if (!section || section.classId !== classId) {
    throw new NotFoundError('Section not found');
  }
  return section;
}

async function updateSection(classId, sectionId, { name }, actingUser) {
  const schoolId = actingUser.schoolId;
  await getSectionOrThrow(schoolId, classId, sectionId);

  const existing = await repository.findSectionByName(classId, name);
  if (existing && existing.id !== sectionId) {
    throw new ConflictError('A Section with this name already exists in this Class');
  }

  const updated = await repository.updateSection(sectionId, { name });
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SECTION_UPDATED' });
  return updated;
}

async function archiveSection(classId, sectionId, actingUser) {
  const schoolId = actingUser.schoolId;
  const section = await getSectionOrThrow(schoolId, classId, sectionId);

  if (section.status === 'ARCHIVED') {
    return section;
  }

  const updated = await repository.archiveSection(sectionId);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SECTION_ARCHIVED' });
  return updated;
}

// Sections have no sequence concept, so reactivation is a plain status flip.
async function reactivateSection(classId, sectionId, actingUser) {
  const schoolId = actingUser.schoolId;
  const section = await getSectionOrThrow(schoolId, classId, sectionId);

  if (section.status === 'ACTIVE') {
    return section;
  }

  const updated = await repository.reactivateSection(sectionId);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'SECTION_REACTIVATED' });
  return updated;
}

// --- GradeLevel CRUD & lifecycle (ACR-009, Architecture Update — Grade/Form)

// The live (going-forward) equivalent of this feature's own migration
// backfill, for schools created from this point on — mirrors School
// Schedule Management's own createDefaultScheduleForSchool exactly:
// every new school gets its own placeholder "Ungrouped" GradeLevel at the
// moment of its own creation, so createClass always has at least one valid
// GradeLevel to default to (see createClass's own default above), never a
// state where no Class can be created until a School Admin first sets up
// real Grade/Form groups. Called from School & Platform Management's own
// createSchool — a small, additive change to that already-Accepted
// feature, the same category of change already made twice for that same
// call site (School Schedule Management, Timetable's optimization
// settings).
// educationLevel is the caller's own school's first configured Education
// Level (School & Platform Management's own School.educationLevels[0]) —
// passed in, not fetched, since the only real call site (schools.service.js's
// createSchool) already has the just-created school record in scope.
function createDefaultGradeLevelForSchool(schoolId, educationLevel) {
  return repository.createGradeLevel({
    schoolId,
    name: 'Ungrouped',
    sequenceOrder: 1,
    status: 'ACTIVE',
    educationLevel,
  });
}

function listGradeLevels(schoolId, { status } = {}) {
  return repository.listGradeLevelsBySchool(schoolId, { status });
}

// Same "must account for every GradeLevel regardless of status" reasoning
// as nextEndOfSequencePosition for Class — the (schoolId, sequenceOrder)
// uniqueness constraint applies to archived rows too.
async function nextEndOfSequencePositionForGradeLevel(schoolId, tx = prisma) {
  const allGradeLevels = await repository.listAllGradeLevelsBySchool(schoolId, tx);
  return allGradeLevels.reduce((max, gl) => Math.max(max, gl.sequenceOrder), 0) + 1;
}

async function createGradeLevel({ name, educationLevel }, actingUser) {
  const schoolId = actingUser.schoolId;

  const gradeLevel = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);

    const existing = await repository.findGradeLevelByName(schoolId, name, tx);
    if (existing) {
      throw new ConflictError('A Grade/Form with this name already exists in your school');
    }

    const nextPosition = await nextEndOfSequencePositionForGradeLevel(schoolId, tx);
    return repository.createGradeLevel({ schoolId, name, educationLevel, sequenceOrder: nextPosition }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'GRADE_LEVEL_CREATED' });
  return gradeLevel;
}

// Guard by Construction: only `name`/`educationLevel` are ever accepted
// here — `sequenceOrder` and `status` are never modifiable through this
// action, each having its own dedicated action below, mirroring Shift's own
// PATCH convention. educationLevel is correctable (unlike gradeLevelId
// itself on a Class) — no downstream invariant depends on it staying fixed
// once set, per the schema's own comment.
async function updateGradeLevel(gradeLevelId, { name, educationLevel }, actingUser) {
  const schoolId = actingUser.schoolId;
  await getGradeLevelOrThrow(schoolId, gradeLevelId);

  const updated = await prisma.$transaction(async (tx) => {
    await repository.acquireSchoolLock(schoolId, tx);

    const existing = await repository.findGradeLevelByName(schoolId, name, tx);
    if (existing && existing.id !== gradeLevelId) {
      throw new ConflictError('A Grade/Form with this name already exists in your school');
    }

    return repository.updateGradeLevel(gradeLevelId, { name, educationLevel }, tx);
  });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'GRADE_LEVEL_UPDATED' });
  return updated;
}

// Same renumbering algorithm as reorderClass, one entity up — archived
// GradeLevels are appended after actives and otherwise unaffected, per the
// same convention Class.sequenceOrder already established.
async function reorderGradeLevel(gradeLevelId, targetPosition, actingUser) {
  const schoolId = actingUser.schoolId;
  const gradeLevel = await getGradeLevelOrThrow(schoolId, gradeLevelId);

  if (gradeLevel.status === 'ARCHIVED') {
    throw new ConflictError('An archived Grade/Form cannot be reordered');
  }

  const all = await repository.listAllGradeLevelsBySchool(schoolId);
  const active = all.filter((gl) => gl.status === 'ACTIVE');
  const archived = all.filter((gl) => gl.status === 'ARCHIVED');

  const withoutMoved = active.filter((gl) => gl.id !== gradeLevelId);
  const moved = active.find((gl) => gl.id === gradeLevelId);

  const clampedPosition = Math.max(1, Math.min(targetPosition, active.length));
  withoutMoved.splice(clampedPosition - 1, 0, moved);

  await repository.reorderGradeLevels([...withoutMoved, ...archived]);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'GRADE_LEVEL_SEQUENCE_CHANGED' });

  return repository.listActiveGradeLevelsBySchoolOrdered(schoolId);
}

// A Class with no Grade/Form would be structurally invalid, so archival is
// blocked while any Active Class still references it — the same "referenced
// by an active Class" guard archiveShift already applies one level down.
// Does not renumber the remaining sequence (archived rows keep their
// position), per the Technical Design's own "follow Class's convention, not
// Shift's" resolution.
async function archiveGradeLevel(gradeLevelId, actingUser) {
  const schoolId = actingUser.schoolId;
  const gradeLevel = await getGradeLevelOrThrow(schoolId, gradeLevelId);

  if (gradeLevel.status === 'ARCHIVED') {
    return gradeLevel;
  }

  const activeClassCount = await repository.countActiveClassesByGradeLevel(schoolId, gradeLevelId);
  if (activeClassCount > 0) {
    throw new ConflictError('This Grade/Form is referenced by an active Class and cannot be archived');
  }

  const updated = await repository.archiveGradeLevel(gradeLevelId);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'GRADE_LEVEL_ARCHIVED' });
  return updated;
}

// Mirrors reactivateClass's own convention exactly: a fresh end-of-sequence
// position, never the pre-archival one.
async function reactivateGradeLevel(gradeLevelId, actingUser) {
  const schoolId = actingUser.schoolId;
  const gradeLevel = await getGradeLevelOrThrow(schoolId, gradeLevelId);

  if (gradeLevel.status === 'ACTIVE') {
    return gradeLevel;
  }

  const nextPosition = await nextEndOfSequencePositionForGradeLevel(schoolId);
  const updated = await repository.reactivateGradeLevel(gradeLevelId, nextPosition);
  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'GRADE_LEVEL_REACTIVATED' });
  return updated;
}

// --- Narrow public interface for other features (Student Management) -------
// Per the Technical Design's Architecture section: this feature is called,
// never calling. These three read-only functions are the entire surface
// Student Management is expected to depend on.

function getClassById(classId) {
  return repository.findById(classId);
}

// Suggests, never enforces, the next Class in the school's active sequence —
// Student Management's Promotion may override this suggestion (Business Rule #6).
async function getSuggestedNextClass(schoolId, currentClassId) {
  const activeClasses = await repository.listActiveBySchoolOrdered(schoolId);
  const currentIndex = activeClasses.findIndex((cls) => cls.id === currentClassId);
  if (currentIndex === -1 || currentIndex === activeClasses.length - 1) {
    return null;
  }
  return activeClasses[currentIndex + 1];
}

function getFinalClass(schoolId) {
  return repository.findFinalClass(schoolId);
}

// (ACR-002) The one interface addition Student Management needs to validate
// and suggest a Section: returns this Class's active Sections (id, name), or
// an empty array if the Class doesn't exist, belongs to another school, or
// simply has none — a read-only query with no side effects, matching
// getClassById/getSuggestedNextClass/getFinalClass's existing style.
async function listActiveSectionsForClass(schoolId, classId) {
  const cls = await repository.findById(classId);
  if (!cls || cls.schoolId !== schoolId) {
    return [];
  }
  return repository.listActiveSectionsForClass(classId);
}

// (School Schedule Management) The one interface addition that feature
// needs to enforce its own Business Rule #16 ("a Shift cannot be archived
// while active Classes reference it") — a single, narrow, one-directional
// function, not a Subject-Management-style extensibility registry, since
// only this one call site will ever need it (per Implementation Planning).
function countActiveClassesByShift(schoolId, shiftId) {
  return repository.countActiveByShift(schoolId, shiftId);
}

// (ACR-009) The literal function that ACR-009 and Weekly Subject
// Allocation's own Technical Design name, for that feature's own future
// consumption: the one shiftId every Active member Class of this GradeLevel
// already shares (guaranteed identical by assertSameShiftWithinGradeLevel),
// derived via a single query, never stored. `null` if the GradeLevel has no
// member Classes yet, or does not exist/belongs to a different school —
// never throws, the same contract every other narrow interface in this
// project already uses.
async function getGradeLevelShift(schoolId, gradeLevelId) {
  const gradeLevel = await repository.findGradeLevelById(gradeLevelId);
  if (!gradeLevel || gradeLevel.schoolId !== schoolId) {
    return null;
  }
  const members = await repository.listOtherActiveClassesInGradeLevel(gradeLevelId, null);
  return members.length > 0 ? members[0].shiftId : null;
}

function getGradeLevelById(schoolId, gradeLevelId) {
  return repository
    .findGradeLevelById(gradeLevelId)
    .then((gradeLevel) => (gradeLevel && gradeLevel.schoolId === schoolId ? gradeLevel : null));
}

async function validateGradeLevel(schoolId, gradeLevelId) {
  const gradeLevel = await repository.findGradeLevelById(gradeLevelId);
  return Boolean(gradeLevel && gradeLevel.schoolId === schoolId && gradeLevel.status === 'ACTIVE');
}

// (Weekly Subject Allocation) Returns this Grade/Form's own Active member
// Classes (id, name), or an empty array on a miss/cross-school id — never
// throws, the same contract every other narrow interface in this project
// already uses.
async function listActiveClassesByGradeLevel(schoolId, gradeLevelId) {
  const gradeLevel = await repository.findGradeLevelById(gradeLevelId);
  if (!gradeLevel || gradeLevel.schoolId !== schoolId) {
    return [];
  }
  return repository.listActiveClassesByGradeLevel(gradeLevelId);
}

module.exports = {
  listClasses,
  createClass,
  updateClass,
  archiveClass,
  reactivateClass,
  reorderClass,
  designateFinalClass,
  createSection,
  updateSection,
  archiveSection,
  reactivateSection,
  getClassOrThrow,
  getSectionOrThrow,
  getClassById,
  getSuggestedNextClass,
  getFinalClass,
  listActiveSectionsForClass,
  countActiveClassesByShift,
  createDefaultGradeLevelForSchool,
  listGradeLevels,
  createGradeLevel,
  updateGradeLevel,
  reorderGradeLevel,
  archiveGradeLevel,
  reactivateGradeLevel,
  getGradeLevelOrThrow,
  getGradeLevelShift,
  getGradeLevelById,
  validateGradeLevel,
  listActiveClassesByGradeLevel,
};
