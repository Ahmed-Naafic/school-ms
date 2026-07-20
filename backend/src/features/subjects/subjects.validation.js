const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.
// Shape-only here; data-dependent checks (duplicates, assignment-count guard,
// Education Level match, dependency validation) live in subjects.service.js,
// per this project's established validation/service split.

const VALID_EDUCATION_LEVELS = ['PRIMARY', 'SECONDARY'];

function validateName(name, errors) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
}

function validateEducationLevel(educationLevel, errors, { required }) {
  if (educationLevel === undefined) {
    if (required) {
      errors.educationLevel = 'Education Level is required.';
    }
    return;
  }
  if (!VALID_EDUCATION_LEVELS.includes(educationLevel)) {
    errors.educationLevel = `Invalid Education Level. Must be one of: ${VALID_EDUCATION_LEVELS.join(', ')}.`;
  }
}

function validateCreateSubject(body) {
  const errors = {};
  validateName(body.name, errors);
  validateEducationLevel(body.educationLevel, errors, { required: true });

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Subject creation request', errors);
  }
}

function validateUpdateSubject(body) {
  const errors = {};
  if (body.name !== undefined) {
    validateName(body.name, errors);
  }
  validateEducationLevel(body.educationLevel, errors, { required: false });

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Subject update request', errors);
  }
}

const VALID_STATUSES = ['ACTIVE', 'ARCHIVED'];

// Phase 9 code review finding: an invalid `status` or `educationLevel` query
// param reached Prisma unvalidated and surfaced as an unhandled 500
// (PrismaClientValidationError), unlike Teacher/Student Management's own
// list endpoints, which both validate their filters before the service
// layer is ever reached (see teachers.validation.js's validateListTeachers).
function validateListSubjects(query) {
  const errors = {};
  validateEducationLevel(query.educationLevel, errors, { required: false });

  if (query.status !== undefined && !VALID_STATUSES.includes(query.status)) {
    errors.status = `Status must be one of: ${VALID_STATUSES.join(', ')}.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Subject catalog query', errors);
  }
}

module.exports = {
  validateCreateSubject,
  validateUpdateSubject,
  validateListSubjects,
};
