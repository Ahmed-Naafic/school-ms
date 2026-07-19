const repository = require('./classes.repository');
const { ConflictError, NotFoundError } = require('../../shared/errors');
const { recordAuditEvent } = require('../../shared/audit');

async function getClassOrThrow(schoolId, classId) {
  const cls = await repository.findById(classId);
  if (!cls || cls.schoolId !== schoolId) {
    throw new NotFoundError('Class not found');
  }
  return cls;
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
async function nextEndOfSequencePosition(schoolId) {
  const allClasses = await repository.listBySchool(schoolId);
  return allClasses.reduce((max, cls) => Math.max(max, cls.sequenceOrder), 0) + 1;
}

// Business Rule #3 (unique name) and #6 (defined sequence position — new
// Classes are appended at the end of the school's current sequence).
async function createClass({ name }, actingUser) {
  const schoolId = actingUser.schoolId;

  const existing = await repository.findByName(schoolId, name);
  if (existing) {
    throw new ConflictError('A Class with this name already exists in your school');
  }

  const nextPosition = await nextEndOfSequencePosition(schoolId);
  const cls = await repository.create({ schoolId, name, sequenceOrder: nextPosition });

  await recordAuditEvent({ schoolId, userId: actingUser.id, action: 'CLASS_CREATED' });

  return cls;
}

async function updateClass(classId, { name }, actingUser) {
  const schoolId = actingUser.schoolId;
  await getClassOrThrow(schoolId, classId);

  const existing = await repository.findByName(schoolId, name);
  if (existing && existing.id !== classId) {
    throw new ConflictError('A Class with this name already exists in your school');
  }

  const updated = await repository.update(classId, { name });
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
async function reactivateClass(classId, actingUser) {
  const schoolId = actingUser.schoolId;
  const cls = await getClassOrThrow(schoolId, classId);

  if (cls.status === 'ACTIVE') {
    return cls;
  }

  const nextPosition = await nextEndOfSequencePosition(schoolId);
  const updated = await repository.reactivate(classId, nextPosition);
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
};
