const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.

const OPTIONAL_STRING_FIELDS = [
  'contactPhone',
  'contactAddress',
  'employmentType',
  'departmentId',
  'qualifications',
  'relevantExperience',
];

// employmentStatus is only ever written by the six named transition
// endpoints (WP3); employeeId, schoolId, and accountId are structural and
// never re-assignable by any client request — this is the Technical
// Design's Guard-by-Construction principle enforced at the validation
// boundary, before the service layer is ever reached.
const FORBIDDEN_PROFILE_FIELDS = ['employmentStatus', 'employeeId', 'schoolId', 'accountId'];

function rejectForbiddenFields(body, errors) {
  for (const field of FORBIDDEN_PROFILE_FIELDS) {
    if (body[field] !== undefined) {
      errors[field] = `${field} may not be set through this request.`;
    }
  }
}

function validateOptionalStringFields(body, errors) {
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      errors[field] = `${field} must be a string.`;
    }
  }
}

function validateSubjectSpecializations(body, errors) {
  if (body.subjectSpecializations === undefined) {
    return;
  }
  const isValid =
    Array.isArray(body.subjectSpecializations) &&
    body.subjectSpecializations.every((entry) => typeof entry === 'string');
  if (!isValid) {
    errors.subjectSpecializations = 'Subject specializations must be an array of strings.';
  }
}

function validateOnboardTeacher(body) {
  const errors = {};

  if (!body.email || typeof body.email !== 'string' || body.email.trim().length === 0) {
    errors.email = 'Email is required.';
  }
  if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length === 0) {
    errors.fullName = 'Full name is required.';
  }
  if (!body.joiningDate || Number.isNaN(Date.parse(body.joiningDate))) {
    errors.joiningDate = 'A valid joining date is required.';
  }

  validateOptionalStringFields(body, errors);
  validateSubjectSpecializations(body, errors);
  rejectForbiddenFields(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Onboarding request', errors);
  }
}

function validateUpdateTeacherProfile(body) {
  const errors = {};

  if (body.fullName !== undefined && (typeof body.fullName !== 'string' || body.fullName.trim().length === 0)) {
    errors.fullName = 'Full name must be a non-empty string.';
  }
  if (body.joiningDate !== undefined && Number.isNaN(Date.parse(body.joiningDate))) {
    errors.joiningDate = 'Joining date must be a valid date.';
  }

  validateOptionalStringFields(body, errors);
  validateSubjectSpecializations(body, errors);
  rejectForbiddenFields(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Teacher profile update', errors);
  }
}

// Shared by all six named transition endpoints (WP3) — each accepts only an
// optional reason, per Business Rule #13; the allowed-from-status
// precondition itself is role-dependent business logic and stays in the
// service layer, per the Employment Status Transition Matrix.
function validateEmploymentTransition(body) {
  const errors = {};

  if (body.reason !== undefined && typeof body.reason !== 'string') {
    errors.reason = 'Reason must be a string.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid employment status transition request', errors);
  }
}

const VALID_EMPLOYMENT_STATUSES = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'RETIRED'];

function validateListTeachers(query) {
  const errors = {};

  if (query.employmentStatus !== undefined && !VALID_EMPLOYMENT_STATUSES.includes(query.employmentStatus)) {
    errors.employmentStatus = `Employment status must be one of: ${VALID_EMPLOYMENT_STATUSES.join(', ')}.`;
  }
  if (query.departmentId !== undefined && typeof query.departmentId !== 'string') {
    errors.departmentId = 'Department must be a string identifier.';
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

// --- Self-Service (WP5) --------------------------------------------------
// A strict whitelist, per Business Rule #10 — only contactPhone and
// contactAddress are Teacher-editable. Unlike the School-Admin-facing
// PATCH /teachers/{id} (which rejects only the four structural/lifecycle
// fields), this rejects *any* field outside the two approved ones,
// including otherwise-legitimate profile fields like fullName or
// joiningDate, which remain School-Admin-managed only.

const SELF_SERVICE_ALLOWED_FIELDS = ['contactPhone', 'contactAddress'];

function validateUpdateOwnContactInfo(body) {
  const errors = {};

  for (const field of Object.keys(body)) {
    if (!SELF_SERVICE_ALLOWED_FIELDS.includes(field)) {
      errors[field] = `${field} may not be set through self-service; only contactPhone and contactAddress are editable.`;
    }
  }
  if (body.contactPhone !== undefined && typeof body.contactPhone !== 'string') {
    errors.contactPhone = 'contactPhone must be a string.';
  }
  if (body.contactAddress !== undefined && typeof body.contactAddress !== 'string') {
    errors.contactAddress = 'contactAddress must be a string.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid self-service profile update', errors);
  }
}

// --- Department (WP4) --------------------------------------------------
// `status` and `schoolId` are rejected explicitly here too — the same
// Guard-by-Construction principle applied to Teacher's profile fields,
// kept consistent across both entities in this module (Technical Design's
// second-review fix). Archiving is only reachable via the dedicated
// archive endpoint, never through create/update.

function rejectDepartmentStructuralFields(body, errors) {
  if (body.status !== undefined) {
    errors.status = 'status may not be set through this request.';
  }
  if (body.schoolId !== undefined) {
    errors.schoolId = 'schoolId may not be set through this request.';
  }
}

function validateCreateDepartment(body) {
  const errors = {};

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
  rejectDepartmentStructuralFields(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Department request', errors);
  }
}

function validateUpdateDepartment(body) {
  const errors = {};

  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
    errors.name = 'Name must be a non-empty string.';
  }
  rejectDepartmentStructuralFields(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Department update', errors);
  }
}

function validateListDepartments(query) {
  const errors = {};

  if (query.includeArchived !== undefined && !['true', 'false'].includes(query.includeArchived)) {
    errors.includeArchived = 'includeArchived must be "true" or "false".';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Department query', errors);
  }
}

module.exports = {
  validateOnboardTeacher,
  validateUpdateTeacherProfile,
  validateListTeachers,
  validateEmploymentTransition,
  validateCreateDepartment,
  validateUpdateDepartment,
  validateListDepartments,
  validateUpdateOwnContactInfo,
};
