const { ValidationError } = require('../../shared/errors');

// Server-side validation only — never trust client input, per Coding-Standards.md.

function validateName(name, errors, field = 'name') {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors[field] = 'Name is required.';
  }
}

function validateCreateClass(body) {
  const errors = {};
  validateName(body.name, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Class creation request', errors);
  }
}

function validateUpdateClass(body) {
  const errors = {};
  validateName(body.name, errors);

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

module.exports = {
  validateCreateClass,
  validateUpdateClass,
  validateReorderClass,
  validateCreateSection,
  validateUpdateSection,
};
