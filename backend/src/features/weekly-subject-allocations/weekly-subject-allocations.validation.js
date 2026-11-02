const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.
// Shape only here; whether a gradeLevelId/academicYearId/subjectId is
// actually eligible is a data-dependent, cross-feature-lookup concern that
// stays entirely in the service layer, per this project's established split.

function validateSubjectsArray(subjects, errors) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    errors.subjects = 'At least one Subject entry is required.';
    return;
  }

  const invalidEntry = subjects.some((entry) => {
    if (!entry || typeof entry.subjectId !== 'string' || entry.subjectId.trim().length === 0) {
      return true;
    }
    if (!Number.isInteger(entry.weeklyPeriods) || entry.weeklyPeriods <= 0) {
      return true;
    }
    if (entry.doublePeriodRequired !== undefined && typeof entry.doublePeriodRequired !== 'boolean') {
      return true;
    }
    return false;
  });

  if (invalidEntry) {
    errors.subjects =
      'Each Subject entry must have a subjectId, a positive whole-number weeklyPeriods, and an optional boolean doublePeriodRequired.';
  }
}

function validateCreateAllocation(body) {
  const errors = {};

  if (body.gradeLevelId !== undefined && typeof body.gradeLevelId !== 'string') {
    errors.gradeLevelId = 'Grade/Form must be a string identifier.';
  }
  if (!body.gradeLevelId) {
    errors.gradeLevelId = errors.gradeLevelId || 'A Grade/Form is required.';
  }
  if (body.academicYearId !== undefined && typeof body.academicYearId !== 'string') {
    errors.academicYearId = 'Academic Year must be a string identifier.';
  }
  validateSubjectsArray(body.subjects, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Weekly Subject Allocation creation request', errors);
  }
}

// Guard by Construction: only `subjects` is ever accepted here —
// `gradeLevelId`/`academicYearId` are immutable after creation, each having
// no correction path of its own (correcting either means creating a new
// allocation for the correct Grade/Form or Academic Year, not an edit to
// this one).
function validateCorrectAllocation(body) {
  const errors = {};
  validateSubjectsArray(body.subjects, errors);

  const allowedFields = new Set(['subjects']);
  const unexpected = Object.keys(body).filter((key) => !allowedFields.has(key));
  if (unexpected.length > 0) {
    errors._unexpected = `Unexpected field(s): ${unexpected.join(', ')}. Only 'subjects' may be corrected here.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Weekly Subject Allocation correction request', errors);
  }
}

module.exports = {
  validateCreateAllocation,
  validateCorrectAllocation,
};
