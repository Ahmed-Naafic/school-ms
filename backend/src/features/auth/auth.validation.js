const { ValidationError } = require('../../shared/errors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password strength per Security-Standards.md's requirement that Validation
// Rules enforce a minimum strength: at least 8 characters, one letter and
// one number. The exact algorithm (bcrypt) is a separate Security Standard.
function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function validateLogin(body) {
  const errors = {};
  if (!body.email || !EMAIL_REGEX.test(body.email)) {
    errors.email = 'A valid email is required.';
  }
  if (!body.password || typeof body.password !== 'string') {
    errors.password = 'Password is required.';
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid login request', errors);
  }
}

// MANAGER added by ACR-010 — shape-level only; auth.service.js's own
// role-creation matrix still enforces WHO may create one.
const VALID_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT', 'TEACHER', 'STUDENT', 'MANAGER'];

function validateCreateAccount(body) {
  const errors = {};
  if (!body.email || !EMAIL_REGEX.test(body.email)) {
    errors.email = 'A valid email is required.';
  }
  if (!body.role || !VALID_ROLES.includes(body.role)) {
    errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}.`;
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid account creation request', errors);
  }
}

function validatePasswordResetRequest(body) {
  if (!body.email || !EMAIL_REGEX.test(body.email)) {
    throw new ValidationError('Invalid password reset request', {
      email: 'A valid email is required.',
    });
  }
}

function validatePasswordResetConfirm(body) {
  const errors = {};
  if (!body.token || typeof body.token !== 'string') {
    errors.token = 'Reset token is required.';
  }
  if (!isStrongPassword(body.newPassword)) {
    errors.newPassword = 'Password must be at least 8 characters and include a letter and a number.';
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid password reset confirmation', errors);
  }
}

function validateChangePassword(body) {
  const errors = {};
  if (!body.currentPassword || typeof body.currentPassword !== 'string') {
    errors.currentPassword = 'Current password is required.';
  }
  if (!isStrongPassword(body.newPassword)) {
    errors.newPassword = 'Password must be at least 8 characters and include a letter and a number.';
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid password change request', errors);
  }
}

// ACR-001: request-shape validation only. This function has no repository
// access and cannot know a target account's role, so it never decides
// *whether* a reason is required — that role-dependent decision belongs to
// auth.service.js's assertOverrideReasonProvided, which runs after the
// target account has been loaded.
function validateAccountOverride(body) {
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.trim().length === 0)) {
    throw new ValidationError('Invalid account override request', {
      reason: 'Reason must be a non-empty string when provided.',
    });
  }
}

function validateRoleChange(body) {
  const allowed = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT', 'TEACHER', 'STUDENT'];
  if (!body.role || !allowed.includes(body.role)) {
    throw new ValidationError('Invalid role change request', {
      role: `Must be one of: ${allowed.join(', ')}`,
    });
  }
}

module.exports = {
  isStrongPassword,
  validateLogin,
  validateCreateAccount,
  validatePasswordResetRequest,
  validatePasswordResetConfirm,
  validateChangePassword,
  validateRoleChange,
  validateAccountOverride,
};
