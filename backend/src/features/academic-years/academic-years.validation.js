const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.
// Shape-only here; data-dependent checks (overlap, duplicate derived label,
// Current-designation invariants) live in academic-years.service.js, per
// this project's established validation/service split.

const VALID_STATUSES = ['ACTIVE', 'ARCHIVED'];

function isValidDateString(value) {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(new Date(value).getTime());
}

function validateDateRange(body, errors) {
  if (!isValidDateString(body.startDate)) {
    errors.startDate = 'A valid start date is required.';
  }
  if (!isValidDateString(body.endDate)) {
    errors.endDate = 'A valid end date is required.';
  }
  if (!errors.startDate && !errors.endDate && new Date(body.endDate) <= new Date(body.startDate)) {
    errors.endDate = 'End date must be after start date.';
  }
}

function validateCreateAcademicYear(body) {
  const errors = {};
  validateDateRange(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Academic Year creation request', errors);
  }
}

// Both dates are always required on update too — a date range is edited as
// a whole, not field-by-field, per the Technical Design's API Design.
function validateUpdateAcademicYear(body) {
  const errors = {};
  validateDateRange(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Academic Year update request', errors);
  }
}

// Phase 9 code review lesson from Subject Management: an invalid list
// query filter must be shape-validated before reaching the service layer,
// not left to surface as an unhandled 500 from Prisma.
function validateListAcademicYears(query) {
  const errors = {};
  if (query.status !== undefined && !VALID_STATUSES.includes(query.status)) {
    errors.status = `Status must be one of: ${VALID_STATUSES.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Academic Year catalog query', errors);
  }
}

module.exports = {
  validateCreateAcademicYear,
  validateUpdateAcademicYear,
  validateListAcademicYears,
};
