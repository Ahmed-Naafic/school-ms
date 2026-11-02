const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per
// Coding-Standards.md. Shape-only here; whether a value is *eligible*
// (ACTIVE, assigned-to-school, belongs-to-school, Archived,
// required-vs-forbidden based on Sections, duplicates the Active scope,
// requires a reason due to downstream records) is a data-dependent,
// cross-feature-lookup concern and stays entirely in the service layer's
// assertion helpers, per the Technical Design's Validation Strategy.

function isValidDateString(value) {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(new Date(value).getTime());
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCreateAssignment(body) {
  const errors = {};

  if (!isNonEmptyString(body.teacherId)) {
    errors.teacherId = 'A Teacher is required.';
  }
  if (!isNonEmptyString(body.subjectId)) {
    errors.subjectId = 'A Subject is required.';
  }
  if (!isNonEmptyString(body.classId)) {
    errors.classId = 'A Class is required.';
  }
  if (body.academicYearId !== undefined && typeof body.academicYearId !== 'string') {
    errors.academicYearId = 'Academic Year must be a string identifier.';
  }
  if (body.sectionId !== undefined && typeof body.sectionId !== 'string') {
    errors.sectionId = 'Section must be a string identifier.';
  }
  if (!isValidDateString(body.effectiveStartDate)) {
    errors.effectiveStartDate = 'A valid effective start date is required.';
  }
  if (body.effectiveEndDate !== undefined && body.effectiveEndDate !== null && !isValidDateString(body.effectiveEndDate)) {
    errors.effectiveEndDate = 'Effective end date must be a valid date.';
  }
  if (
    !errors.effectiveStartDate &&
    !errors.effectiveEndDate &&
    body.effectiveEndDate &&
    new Date(body.effectiveEndDate) < new Date(body.effectiveStartDate)
  ) {
    errors.effectiveEndDate = 'Effective end date must not precede the effective start date.';
  }
  if (body.reason !== undefined && typeof body.reason !== 'string') {
    errors.reason = 'Reason must be a string.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Teacher Subject Assignment creation request', errors);
  }
}

const CORRECTABLE_FIELDS = ['effectiveStartDate', 'effectiveEndDate', 'endReason'];

// Guard by Construction (Business Rule #11): teacherId, subjectId, classId,
// sectionId, and academicYearId are immutable and must never even reach the
// service layer if present in a correction request.
function validateCorrectAssignment(body) {
  const errors = {};

  for (const key of Object.keys(body || {})) {
    if (!CORRECTABLE_FIELDS.includes(key)) {
      errors[key] = 'This field cannot be modified after creation.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'effectiveStartDate')) {
    if (body.effectiveStartDate === null || !isValidDateString(body.effectiveStartDate)) {
      errors.effectiveStartDate = 'Effective start date must be a valid date and cannot be cleared.';
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'effectiveEndDate')) {
    if (body.effectiveEndDate !== null && !isValidDateString(body.effectiveEndDate)) {
      errors.effectiveEndDate = 'Effective end date must be a valid date, or null to represent no end date.';
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'endReason')) {
    if (body.endReason !== null && typeof body.endReason !== 'string') {
      errors.endReason = 'End reason must be a string, or null.';
    }
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Teacher Subject Assignment correction request', errors);
  }
}

function validateReplaceTeacher(body) {
  const errors = {};

  if (!isNonEmptyString(body.newTeacherId)) {
    errors.newTeacherId = 'A replacement Teacher is required.';
  }
  if (body.effectiveEndDate !== undefined && !isValidDateString(body.effectiveEndDate)) {
    errors.effectiveEndDate = 'Effective end date must be a valid date.';
  }
  if (body.endReason !== undefined && typeof body.endReason !== 'string') {
    errors.endReason = 'End reason must be a string.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Replace Teacher request', errors);
  }
}

// Business Rule #12: copying is always selective, via an explicit array —
// never "copy everything."
function validateCopyAssignments(body) {
  const errors = {};

  if (!isNonEmptyString(body.fromAcademicYearId)) {
    errors.fromAcademicYearId = 'A source Academic Year is required.';
  }
  if (!isNonEmptyString(body.toAcademicYearId)) {
    errors.toAcademicYearId = 'A target Academic Year is required.';
  }
  if (
    !Array.isArray(body.assignmentIds) ||
    body.assignmentIds.length === 0 ||
    !body.assignmentIds.every((id) => isNonEmptyString(id))
  ) {
    errors.assignmentIds = 'At least one Teacher Subject Assignment id must be selected to copy.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid copy request', errors);
  }
}

function validateListAssignments(query) {
  const errors = {};
  const stringFilters = ['academicYearId', 'teacherId', 'subjectId', 'classId', 'sectionId'];

  for (const field of stringFilters) {
    if (query[field] !== undefined && typeof query[field] !== 'string') {
      errors[field] = `${field} must be a string identifier.`;
    }
  }
  if (query.page !== undefined && (!Number.isInteger(Number(query.page)) || Number(query.page) < 1)) {
    errors.page = 'Page must be a positive whole number.';
  }
  if (query.pageSize !== undefined && (!Number.isInteger(Number(query.pageSize)) || Number(query.pageSize) < 1)) {
    errors.pageSize = 'Page size must be a positive whole number.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Teacher Subject Assignment query', errors);
  }
}

module.exports = {
  validateCreateAssignment,
  validateCorrectAssignment,
  validateReplaceTeacher,
  validateCopyAssignments,
  validateListAssignments,
};
