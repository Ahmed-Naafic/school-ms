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

function validateCreateAccount(body) {
  const errors = {};
  if (!body.email || !EMAIL_REGEX.test(body.email)) {
    errors.email = 'A valid email is required.';
  }
  if (!body.role || typeof body.role !== 'string') {
    errors.role = 'Role is required.';
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
};
