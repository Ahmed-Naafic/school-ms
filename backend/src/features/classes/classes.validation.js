const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.

function validateName(name, errors, field = 'name') {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors[field] = 'Name is required.';
  }
}

// (School Schedule Management) Shape only — whether a shiftId belongs to
// the school, is Active, or defaults correctly when omitted are
// data-dependent business rules enforced by assertShiftAssignable in the
// service layer, not here, mirroring classId's own validation/service split.
function validateShiftId(body, errors) {
  if (body.shiftId !== undefined && typeof body.shiftId !== 'string') {
    errors.shiftId = 'Shift must be a string identifier.';
  }
}

// (ACR-009) Shape only — whether a gradeLevelId belongs to the school, is
// Active, or shares its Shift with its own sibling Classes are
// data-dependent business rules enforced in the service layer, not here,
// mirroring shiftId's own validation/service split above.
function validateGradeLevelId(body, errors) {
  if (body.gradeLevelId !== undefined && typeof body.gradeLevelId !== 'string') {
    errors.gradeLevelId = 'Grade/Form must be a string identifier.';
  }
}

function validateCreateClass(body) {
  const errors = {};
  validateName(body.name, errors);
  validateShiftId(body, errors);
  validateGradeLevelId(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Class creation request', errors);
  }
}

function validateUpdateClass(body) {
  const errors = {};
  validateName(body.name, errors);
  validateShiftId(body, errors);
  validateGradeLevelId(body, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Class update request', errors);
  }
}

function validateReorderClass(body) {
  const errors = {};

  if (!Number.isInteger(body.position) || body.position < 1) {
    errors.position = 'Position must be a positive whole number.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid sequence update request', errors);
  }
}

function validateCreateSection(body) {
  const errors = {};
  validateName(body.name, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Section creation request', errors);
  }
}

function validateUpdateSection(body) {
  const errors = {};
  validateName(body.name, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Section update request', errors);
  }
}

// --- GradeLevel (ACR-009, Architecture Update — Grade/Form) ----------------

const VALID_EDUCATION_LEVELS = new Set(['PRIMARY', 'SECONDARY']);

// Required on create — a real, explicit choice, never inferred from the
// Grade/Form's own free-text name (see the schema's own comment on
// GradeLevel.educationLevel for why).
function validateEducationLevel(body, errors, { required } = {}) {
  if (body.educationLevel === undefined) {
    if (required) errors.educationLevel = 'Education Level is required.';
    return;
  }
  if (!VALID_EDUCATION_LEVELS.has(body.educationLevel)) {
    errors.educationLevel = "Education Level must be 'PRIMARY' or 'SECONDARY'.";
  }
}

function validateCreateGradeLevel(body) {
  const errors = {};
  validateName(body.name, errors);
  validateEducationLevel(body, errors, { required: true });

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Grade/Form creation request', errors);
  }
}

// Guard by Construction: only `name`/`educationLevel` are ever accepted
// here — `sequenceOrder`/`status` are never modifiable through this
// endpoint, each having its own dedicated action, mirroring PATCH
// /shifts/{id}'s own convention. educationLevel is optional on correction
// (omitted means "leave unchanged") but must be valid when present.
function validateUpdateGradeLevel(body) {
  const errors = {};
  validateName(body.name, errors);
  validateEducationLevel(body, errors, { required: false });

  const allowedFields = new Set(['name', 'educationLevel']);
  const unexpected = Object.keys(body).filter((key) => !allowedFields.has(key));
  if (unexpected.length > 0) {
    errors._unexpected = `Unexpected field(s): ${unexpected.join(', ')}. Only 'name'/'educationLevel' may be corrected here.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Grade/Form update request', errors);
  }
}

function validateReorderGradeLevel(body) {
  const errors = {};

  if (!Number.isInteger(body.position) || body.position < 1) {
    errors.position = 'Position must be a positive whole number.';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid sequence update request', errors);
  }
}

module.exports = {
  validateCreateClass,
  validateUpdateClass,
  validateReorderClass,
  validateCreateSection,
  validateUpdateSection,
  validateCreateGradeLevel,
  validateUpdateGradeLevel,
  validateReorderGradeLevel,
};
