const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per
// Coding-Standards.md. Shape-only here; whether an Assignment/Period is
// *eligible* (Active, room under its weekly target, Teaching-type,
// Shift-compatible, no Teacher/Class conflict) is a data-dependent,
// cross-feature concern and stays entirely in the service layer's assertion
// helpers, per the Technical Design's Validation Strategy.

const VALID_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const VALID_GAP_PREFERENCES = ['MINIMIZE', 'ALLOW', 'NO_PREFERENCE'];
const VALID_SCOPE_TYPES = ['ALL', 'CLASS', 'TEACHER', 'DAY'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateLessonWrite(body) {
  const errors = {};

  if (!isNonEmptyString(body.teacherSubjectAssignmentId)) {
    errors.teacherSubjectAssignmentId = 'A Teacher Subject Assignment is required.';
  }
  if (!VALID_DAYS.includes(body.dayOfWeek)) {
    errors.dayOfWeek = `Must be one of: ${VALID_DAYS.join(', ')}.`;
  }
  if (!isNonEmptyString(body.periodId)) {
    errors.periodId = 'A Period is required.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Lesson request', errors);
  }
}

function isOptionalPositiveInt(value) {
  return value === undefined || value === null || (Number.isInteger(value) && value > 0);
}

function isOptionalBoolean(value) {
  return value === undefined || value === null || typeof value === 'boolean';
}

function isOptionalDayArray(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.every((d) => VALID_DAYS.includes(d)));
}

function isOptionalIdArray(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}

// Architecture Update (Generation-First) — Hard Constraint: "Teacher
// availability must be respected." Each entry needs a Day dimension
// (unlike preferredPeriods/avoidPeriods above), since availability is
// naturally day-specific.
function isOptionalSlotArray(value) {
  return (
    value === undefined ||
    value === null ||
    (Array.isArray(value) &&
      value.every((slot) => slot && VALID_DAYS.includes(slot.dayOfWeek) && isNonEmptyString(slot.periodId)))
  );
}

function validateTeacherPreference(body) {
  const errors = {};

  if (!isOptionalIdArray(body.preferredPeriods)) errors.preferredPeriods = 'Must be an array of Period ids.';
  if (!isOptionalIdArray(body.avoidPeriods)) errors.avoidPeriods = 'Must be an array of Period ids.';
  if (!isOptionalSlotArray(body.unavailableSlots)) {
    errors.unavailableSlots = 'Must be an array of { dayOfWeek, periodId } objects.';
  }
  if (!isOptionalBoolean(body.preferBeforeBreak)) errors.preferBeforeBreak = 'Must be true or false.';
  if (!isOptionalBoolean(body.preferAfterBreak)) errors.preferAfterBreak = 'Must be true or false.';
  if (!isOptionalDayArray(body.preferredWorkingDays)) errors.preferredWorkingDays = `Must contain only: ${VALID_DAYS.join(', ')}.`;
  if (body.preferredShiftId !== undefined && body.preferredShiftId !== null && !isNonEmptyString(body.preferredShiftId)) {
    errors.preferredShiftId = 'Must be a string identifier, or null.';
  }
  if (!isOptionalPositiveInt(body.maxLessonsPerDay)) errors.maxLessonsPerDay = 'Must be a positive whole number.';
  if (!isOptionalPositiveInt(body.maxConsecutiveLessons)) errors.maxConsecutiveLessons = 'Must be a positive whole number.';
  if (
    body.gapPreference !== undefined &&
    body.gapPreference !== null &&
    !VALID_GAP_PREFERENCES.includes(body.gapPreference)
  ) {
    errors.gapPreference = `Must be one of: ${VALID_GAP_PREFERENCES.join(', ')}.`;
  }
  if (!isOptionalBoolean(body.spreadFreePeriods)) errors.spreadFreePeriods = 'Must be true or false.';

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Teacher schedule preference request', errors);
  }
}

function validateSubjectPreference(body) {
  const errors = {};

  if (!isOptionalIdArray(body.preferredPeriods)) errors.preferredPeriods = 'Must be an array of Period ids.';
  if (!isOptionalIdArray(body.avoidPeriods)) errors.avoidPeriods = 'Must be an array of Period ids.';
  if (!isOptionalDayArray(body.preferredDays)) errors.preferredDays = `Must contain only: ${VALID_DAYS.join(', ')}.`;
  if (!isOptionalDayArray(body.avoidDays)) errors.avoidDays = `Must contain only: ${VALID_DAYS.join(', ')}.`;
  if (!isOptionalBoolean(body.consecutivePeriodsRequired)) errors.consecutivePeriodsRequired = 'Must be true or false.';
  if (!isOptionalBoolean(body.spreadAcrossWeek)) errors.spreadAcrossWeek = 'Must be true or false.';
  if (!isOptionalPositiveInt(body.maxLessonsPerDay)) errors.maxLessonsPerDay = 'Must be a positive whole number.';

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Subject schedule preference request', errors);
  }
}

function validateOptimizationSettings(body) {
  const errors = {};

  for (const key of Object.keys(body || {})) {
    if (
      !['balanceTeacherWorkloads', 'balanceFirstLastPeriods', 'minimizeTeacherGaps', 'distributeSubjectsFairly'].includes(key)
    ) {
      errors[key] = 'This field cannot be modified through this endpoint.';
    }
  }
  for (const key of ['balanceTeacherWorkloads', 'balanceFirstLastPeriods', 'minimizeTeacherGaps', 'distributeSubjectsFairly']) {
    if (!isOptionalBoolean(body[key])) {
      errors[key] = 'Must be true or false.';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid School Optimization Settings request', errors);
  }
}

// Architecture Update (Generation-First) — Validation Rule #14: a generation
// request's own scope must name a valid Class/Teacher/Day, where that
// scope type requires one. Whether the named Class/Teacher actually belongs
// to the acting School Admin's own school is a data-dependent check, left
// to the service layer.
function validateGenerateRequest(body) {
  const errors = {};
  const scope = body && body.scope;

  if (!scope || !VALID_SCOPE_TYPES.includes(scope.type)) {
    errors.scope = `scope.type must be one of: ${VALID_SCOPE_TYPES.join(', ')}.`;
  } else if (scope.type === 'CLASS' && !isNonEmptyString(scope.classId)) {
    errors.classId = 'A Class is required for a CLASS-scoped generation request.';
  } else if (scope.type === 'TEACHER' && !isNonEmptyString(scope.teacherId)) {
    errors.teacherId = 'A Teacher is required for a TEACHER-scoped generation request.';
  } else if (scope.type === 'DAY' && !VALID_DAYS.includes(scope.dayOfWeek)) {
    errors.dayOfWeek = `A valid Day is required for a DAY-scoped generation request. Must be one of: ${VALID_DAYS.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Timetable generation request', errors);
  }
}

module.exports = {
  validateLessonWrite,
  validateTeacherPreference,
  validateSubjectPreference,
  validateOptimizationSettings,
  validateGenerateRequest,
};
