const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.

function validateAdmitStudent(body) {
  const errors = {};

  if (!body.email || typeof body.email !== 'string' || body.email.trim().length === 0) {
    errors.email = 'Email is required.';
  }
  if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length === 0) {
    errors.fullName = 'Full name is required.';
  }
  if (body.parentName !== undefined && typeof body.parentName !== 'string') {
    errors.parentName = 'Parent name must be a string.';
  }
  if (body.parentContact !== undefined && typeof body.parentContact !== 'string') {
    errors.parentContact = 'Parent contact must be a string.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Admission request', errors);
  }
}

// (ACR-002) Shape only — whether a sectionId is required, belongs to the
// target Class, or is archived are data-dependent business rules enforced by
// assertSectionEnrollable in the service layer, not here, mirroring classId's
// own validation/service split.
function validateSectionId(body, errors) {
  if (body.sectionId !== undefined && typeof body.sectionId !== 'string') {
    errors.sectionId = 'Section must be a string identifier.';
  }
}

// (ACR-004) Shape only — whether an academicYearId belongs to this school or
// is Archived are data-dependent business rules enforced by
// assertAcademicYearEnrollable in the service layer, not here, mirroring
// sectionId's own validation/service split. Unlike sectionId, Enrollment
// requires this field unconditionally (Business Rule #21); Promotion does
// not, since its absence is a valid "use the Current Academic Year" signal
// handled entirely in the service layer (Business Rule #23).
function validateAcademicYearId(body, errors, { required }) {
  if (body.academicYearId !== undefined && typeof body.academicYearId !== 'string') {
    errors.academicYearId = 'Academic Year must be a string identifier.';
    return;
  }
  if (required && (!body.academicYearId || body.academicYearId.trim().length === 0)) {
    errors.academicYearId = 'An Academic Year is required.';
  }
}

function validateEnrollStudent(body) {
  const errors = {};

  if (!body.classId || typeof body.classId !== 'string') {
    errors.classId = 'A Class is required.';
  }
  validateAcademicYearId(body, errors, { required: true });
  validateSectionId(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Enrollment request', errors);
  }
}

function validatePromoteStudent(body) {
  const errors = {};

  if (body.classId !== undefined && typeof body.classId !== 'string') {
    errors.classId = 'Class must be a string identifier.';
  }
  validateAcademicYearId(body, errors, { required: false });
  validateSectionId(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Promotion request', errors);
  }
}

function validateCorrectClass(body) {
  const errors = {};

  if (!body.classId || typeof body.classId !== 'string') {
    errors.classId = 'A Class is required.';
  }
  if (body.reason !== undefined && typeof body.reason !== 'string') {
    errors.reason = 'Reason must be a string.';
  }
  validateSectionId(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Class Correction request', errors);
  }
}

function validateTransferStudent(body) {
  const errors = {};

  if (body.academicSummary !== undefined && typeof body.academicSummary !== 'string') {
    errors.academicSummary = 'Academic summary must be a string.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Transfer request', errors);
  }
}

function validateUpdateProfile(body) {
  const errors = {};
  const optionalStringFields = ['fullName', 'parentName', 'parentContact'];

  for (const field of optionalStringFields) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      errors[field] = `${field} must be a string.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid profile update', errors);
  }
}

const VALID_STUDENT_STATUSES = ['ACTIVE', 'ELIGIBLE_FOR_GRADUATION', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED'];

function validateListStudents(query) {
  const errors = {};

  if (query.status !== undefined && !VALID_STUDENT_STATUSES.includes(query.status)) {
    errors.status = `Status must be one of: ${VALID_STUDENT_STATUSES.join(', ')}.`;
  }
  if (query.sectionId !== undefined && typeof query.sectionId !== 'string') {
    errors.sectionId = 'Section must be a string identifier.';
  }
  if (query.page !== undefined && (!Number.isInteger(Number(query.page)) || Number(query.page) < 1)) {
    errors.page = 'Page must be a positive whole number.';
  }
  if (
    query.pageSize !== undefined &&
    (!Number.isInteger(Number(query.pageSize)) || Number(query.pageSize) < 1)
  ) {
    errors.pageSize = 'Page size must be a positive whole number.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid roster query', errors);
  }
}

module.exports = {
  validateAdmitStudent,
  validateEnrollStudent,
  validatePromoteStudent,
  validateCorrectClass,
  validateTransferStudent,
  validateUpdateProfile,
  validateListStudents,
};
